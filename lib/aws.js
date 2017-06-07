'use strict'

const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY
const DRY_RUN = process.env.DRY_RUN
const ENVIRONMENT = process.env.ENVIRONMENT
// In gamma and delta, all asgs have 'production-' prepended to the asg name
const ENVIRONMENT_PREFIX = (process.env.ENVIRONMENT_PREFIX === undefined ? 'production-' : process.env.ENVIRONMENT_PREFIX)
const SECURITY_GROUP_SUFFIX = process.env.SECURITY_GROUP_SUFFIX || 'dock'

const FILTER_PARAMS = {
  Filters: [
    { Name: 'tag:role', Values: ['dock'] },
    {
      Name: 'instance.group-name', // Refers to security group
      Values: [ `${ENVIRONMENT}-${SECURITY_GROUP_SUFFIX}` ]
    }
  ]
}

const assign = require('101/assign')
const AWS = require('aws-sdk')
const find = require('101/find')
const Promise = require('bluebird')
const logger = require('./loggers').child({ module: 'models/aws' })

const promiseWhile = require('./utils').promiseWhile

class AWSClass {
  constructor () {
    AWS.config.update({
      accessKeyId: AWS_ACCESS_KEY,
      secretAccessKey: AWS_SECRET_KEY,
      region: 'us-west-2'
    })
    this.ec2 = new AWS.EC2()
    this.cloudwatch = new AWS.CloudWatch()
  }

  getDocks () {
    const log = logger.child({ method: 'getDocks' })
    log.trace('Called')
    return Promise.resolve({ instances: [] })
      .then(promiseWhile(
        (data) => (data.done),
        (data) => {
          const opts = assign({}, FILTER_PARAMS)
          if (data.NextToken) { opts.NextToken = data.NextToken }
          log.trace({ opts }, 'Query opts for EC2 instances')
          return Promise.fromCallback((cb) => {
            this.ec2.describeInstances(opts, cb)
          })
            .then((awsData) => {
              awsData.Reservations.forEach((r) => {
                r.Instances.forEach((i) => {
                  data.instances.push(i)
                })
              })
              data.NextToken = awsData.NextToken
              data.done = !awsData.NextToken
              return data
            })
        }
      ))
      .then((data) => { return data.instances })
  }

  sendMaximumAvailableToCloudWatch (swarmData) {
    const log = logger.child({ method: 'sendMaximumAvailableToCloudWatch' })
    log.trace('Called')
    const orgInfo = swarmData.reduce((memo, curr) => {
      if (memo[curr.org]) {
        memo[curr.org].min = Math.min(curr.usedMemoryGiB, memo[curr.org].min)
        memo[curr.org].max = Math.max(curr.availableMemoryGiB, memo[curr.org].max)
      } else {
        memo[curr.org] = {
          min: curr.usedMemoryGiB,
          max: curr.availableMemoryGiB
        }
      }
      return memo
    }, {})
    return Promise.each(Object.keys(orgInfo), (key) => {
      const orgData = orgInfo[key]
      const orgID = key
      const maxAvailableSpaceInGB = orgData.max - orgData.min
      const postData = {
        Namespace: 'Runnable/Swarm',
        MetricData: [
          {
            MetricName: 'Swarm Reserved Memory Maximum Available',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: maxAvailableSpaceInGB,
            Unit: 'Gigabytes'
          }
        ]
      }
      log.debug({ postData }, 'DRY RUN: Data to be posted to cloudwatch')
      return Promise.fromCallback((cb) => {
        if (DRY_RUN) {
          log.trace('Dry Run: Will not post data')
          return cb()
        }
        this.cloudwatch.putMetricData(postData, cb)
      })
    })
  }

  sendThresholdDataToCloudWatch (swarmData) {
    const log = logger.child({ method: 'sendThresholdDataToCloudWatch' })
    log.trace('Called')
    const orgInfo = swarmData.reduce((memo, curr) => {
      if (memo[curr.org]) {
        memo[curr.org].available += curr.availableMemoryGiB
        memo[curr.org].used += curr.usedMemoryGiB
        memo[curr.org].singleDockCapacity =
          Math.max(curr.availableMemoryGiB, memo[curr.org].singleDockCapacity)
      } else {
        memo[curr.org] = {
          available: curr.availableMemoryGiB,
          used: curr.usedMemoryGiB,
          singleDockCapacity: curr.availableMemoryGiB
        }
      }
      return memo
    }, {})
    return Promise.each(Object.keys(orgInfo), (key) => {
      const orgData = orgInfo[key]
      const orgID = key
      const threshold = orgData.available *
        (1 -
          (orgData.singleDockCapacity /
          (orgData.available + orgData.singleDockCapacity))
        )
      const thresholdUsage = orgData.used / threshold * 100
      const postData = {
        Namespace: 'Runnable/Swarm',
        MetricData: [
          {
            MetricName: 'Swarm Reserved Memory Threshold',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: threshold,
            Unit: 'Gigabytes'
          },
          {
            MetricName: 'Swarm Reserved Memory Threshold Usage',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: thresholdUsage,
            Unit: 'Percent'
          },
          {
            MetricName: 'Swarm Reserved Memory Total',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: orgData.available,
            Unit: 'Gigabytes'
          },
          {
            MetricName: 'Swarm Reserved Memory Used',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: orgData.used,
            Unit: 'Gigabytes'
          }
        ]
      }
      log.debug({ postData }, 'DRY RUN: Data to be posted to cloudwatch')
      return Promise.fromCallback((cb) => {
        if (DRY_RUN) {
          log.trace('Dry Run: Not running')
          return cb()
        }
        this.cloudwatch.putMetricData(postData, cb)
      })
    })
  }

  sendBasicInfoToCloudWatch (awsData, swarmData) {
    const log = logger.child({ method: 'sendBasicInfoToCloudWatch' })
    log.trace('Called')
    return Promise.each(swarmData, (swarmHostInfo) => {
      const awsDockInfo = find(awsData, (dock) => {
        return dock.PrivateIpAddress === swarmHostInfo.Host
      })
      if (!awsDockInfo) {
        log.error({ swarmHostInfo }, 'Could not find matching dock in AWS')
        return
      }
      const org = find(awsDockInfo.Tags, (t) => { return t.Key === 'org' })
      if (!org) {
        log.error({ swarmHostInfo, awsDockInfo  }, 'Could not find `org` tag in EC2 instance tags')
        return
      }
      const orgID = org.Value
      const postData = {
        Namespace: 'Runnable/Swarm',
        MetricData: [
          {
            MetricName: 'Swarm Reserved Memory',
            Dimensions: [{
              Name: 'InstanceId',
              Value: awsDockInfo.InstanceId
            }, {
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: swarmHostInfo.Value,
            Unit: swarmHostInfo.Unit
          }, {
            MetricName: 'Swarm Reserved Memory',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-${ENVIRONMENT_PREFIX}${ENVIRONMENT}-${orgID}`
            }],
            Value: swarmHostInfo.Value,
            Unit: swarmHostInfo.Unit
          }
        ]
      }
      log.debug({ postData }, 'Data to be posted to cloudwatch')
      return Promise.fromCallback((cb) => {
        if (DRY_RUN) {
          log.trace('Dry Run: Will not post data')
          return cb()
        }
        this.cloudwatch.putMetricData(postData, cb)
      })
    })
  }
}

module.exports = new AWSClass()
