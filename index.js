'use strict'

const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY
const ENVIRONMENT = process.env.ENVIRONMENT

const DRY_RUN = process.env.DRY_RUN

const assign = require('101/assign')
const AWS = require('aws-sdk')
const DockerodeModule = require('dockerode')
const find = require('101/find')
const fs = require('fs')
const join = require('path').join
const Promise = require('bluebird')
const Swarmerode = require('swarmerode')

AWS.config.update({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: 'us-west-2'
})
const ec2 = new AWS.EC2()
const cloudwatch = new AWS.CloudWatch()

function promiseWhile (condition, action) {
  function loop (data) {
    if (condition(data)) { return Promise.resolve(data) }
    return action(data).then(loop)
  }
  return loop
}

const Dockerode = Swarmerode(DockerodeModule)

let certs = {}
try {
  // DOCKER_CERT_PATH is docker's default thing it checks - may as well use it
  const certPath = process.env.DOCKER_CERT_PATH
  certs.ca = fs.readFileSync(join(certPath, '/ca.pem'))
  certs.cert = fs.readFileSync(join(certPath, '/cert.pem'))
  certs.key = fs.readFileSync(join(certPath, '/key.pem'))
} catch (e) {
  console.error({ err: e }, 'cannot load certificates for docker!!')
  // use all or none - so reset certs here
  certs = {}
}

const docker = new Dockerode(assign({
  host: process.env.SWARM_HOSTNAME,
  port: process.env.SWARM_PORT,
  timeout: 2 * 60 * 1000
}, certs))

const UNITS = {
  'B': 'Bytes',
  'KiB': 'Kilobytes',
  'MiB': 'Megabytes',
  'GiB': 'Gigabytes'
}

const FACTOR = {
  Bytes: 1000 * 1000 * 1000,
  Kilobytes: 1000 * 1000,
  Megabytes: 1000,
  Gigabytes: 1
}

const FILTER_PARAMS = {
  Filters: [
    { Name: 'tag:role', Values: ['dock'] },
    {
      Name: 'instance.group-name',
      Values: [ `${ENVIRONMENT}-dock` ]
    }
  ]
}

Promise.props({
  docks: getDocks(),
  swarmHosts: getSwarmInfo()
})
  .then((data) => {
    return Promise.each(data.swarmHosts, (h) => {
      const d = find(data.docks, (dock) => {
        return dock.PrivateIpAddress === h.Host
      })
      if (!d) {
        console.error('could not find match:', h.host)
        return
      }
      const org = find(d.Tags, (t) => { return t.Key === 'org' })
      if (!org) {
        console.error('could not find org tag')
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
              Value: d.InstanceId
            }, {
              Name: 'AutoScalingGroupName',
              Value: `asg-production-${ENVIRONMENT}-${orgID}`
            }],
            Value: h.Value,
            Unit: h.Unit
          }, {
            MetricName: 'Swarm Reserved Memory',
            Dimensions: [{
              Name: 'AutoScalingGroupName',
              Value: `asg-production-${ENVIRONMENT}-${orgID}`
            }],
            Value: h.Value,
            Unit: h.Unit
          }
        ]
      }
      console.log(JSON.stringify(postData))
      return Promise.fromCallback((cb) => {
        if (DRY_RUN) {
          console.log('dry run. would be putting data')
          return cb()
        }
        cloudwatch.putMetricData(postData, cb)
      })
        .then(() => { console.log('posted') })
    })
  })
  .catch((err) => {
    console.log(err.stack || err.message || err)
    process.exit(1)
  })

function getDocks () {
  return Promise.resolve({ instances: [] })
    .then(promiseWhile(
      (data) => (data.done),
      (data) => {
        const opts = assign({}, FILTER_PARAMS)
        if (data.NextToken) { opts.NextToken = data.NextToken }
        return Promise.fromCallback((cb) => {
          ec2.describeInstances(opts, cb)
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

function getSwarmInfo () {
  return Promise.fromCallback((cb) => {
    docker.swarmInfo(cb)
  })
    .then((info) => {
      return Object.keys(info.parsedSystemStatus.ParsedNodes).map((key) => {
        const node = info.parsedSystemStatus.ParsedNodes[key]
        const usedMemory = node.ReservedMem.split('/').shift().trim()
        const availableMemory = node.ReservedMem.split('/').pop().trim()
        const usedMemoryValue = parseFloat(usedMemory.split(' ').shift())
        const usedMemoryUnits = UNITS[usedMemory.split(' ').pop()]
        const availableMemoryValue = parseFloat(availableMemory.split(' ').shift())
        const availableMemoryUnits = UNITS[availableMemory.split(' ').pop()]

        const usedMemoryGiB = usedMemoryValue / FACTOR[usedMemoryUnits]
        const availableMemoryGiB = availableMemoryValue / FACTOR[availableMemoryUnits]

        const percentage = (usedMemoryGiB / availableMemoryGiB) * 100

        return {
          Host: node.Host.split(':').shift(),
          Value: percentage,
          Unit: 'Percent'
        }
      })
    })
}
