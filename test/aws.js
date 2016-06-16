'use strict'

const chai = require('chai')
const sinon = require('sinon')
require('sinon-as-promised')
const assert = chai.assert
chai.use(require('chai-as-promised'))

const AWS = require('../lib/aws')

describe('AWS', () => {
  beforeEach(() => {
    AWS.ec2 = {}
    AWS.cloudwatch = {
      putMetricData: sinon.stub().yieldsAsync()
    }
  })

  describe('getDocks', () => {
    it('should call describeInstances', () => {
      AWS.ec2.describeInstances = sinon.stub().yieldsAsync(null, {
        Reservations: []
      })
      return assert.isFulfilled(AWS.getDocks())
        .then(() => {
          sinon.assert.calledOnce(AWS.ec2.describeInstances)
        })
    })

    it('should return instances from the reservations', () => {
      AWS.ec2.describeInstances = sinon.stub().yieldsAsync(null, {
        Reservations: [{
          Instances: [{ foo: 'bar' }]
        }]
      })
      return assert.isFulfilled(AWS.getDocks())
        .then((data) => {
          assert.deepEqual(data, [{ foo: 'bar' }])
        })
    })
  })

  describe('sendMaximumAvailableToCloudWatch', () => {
    it('should send the max available information (1 org, 1 dock)', () => {
      const data = [{
        org: 1000,
        availableMemoryGiB: 8.0,
        usedMemoryGiB: 4.1
      }]
      return assert.isFulfilled(AWS.sendMaximumAvailableToCloudWatch(data))
        .then(() => {
          sinon.assert.calledOnce(AWS.cloudwatch.putMetricData)
          const sentData = AWS.cloudwatch.putMetricData.firstCall.args[0]
          assert.lengthOf(sentData.MetricData, 1)
          assert.approximately(sentData.MetricData[0].Value, 3.9, 1e-5)
          assert.equal(sentData.MetricData[0].Unit, 'Gigabytes')
        })
    })

    it('should send the max available information (1 org, 2 docks)', () => {
      const data = [{
        org: 1000,
        availableMemoryGiB: 8.0,
        usedMemoryGiB: 4.1
      }, {
        org: 1000,
        availableMemoryGiB: 8.0,
        usedMemoryGiB: 1.0
      }]
      return assert.isFulfilled(AWS.sendMaximumAvailableToCloudWatch(data))
        .then(() => {
          sinon.assert.calledOnce(AWS.cloudwatch.putMetricData)
          const sentData = AWS.cloudwatch.putMetricData.firstCall.args[0]
          assert.lengthOf(sentData.MetricData, 1)
          assert.approximately(sentData.MetricData[0].Value, 7.0, 1e-5)
          assert.equal(sentData.MetricData[0].Unit, 'Gigabytes')
        })
    })

    it('should send the max available information (2 orgs, 1 dock each)', () => {
      const data = [{
        org: 1000,
        availableMemoryGiB: 8.0,
        usedMemoryGiB: 4.0
      }, {
        org: 2000,
        availableMemoryGiB: 8.0,
        usedMemoryGiB: 1.0
      }]
      return assert.isFulfilled(AWS.sendMaximumAvailableToCloudWatch(data))
        .then(() => {
          sinon.assert.calledTwice(AWS.cloudwatch.putMetricData)
          const firstSentData = AWS.cloudwatch.putMetricData.firstCall.args[0]
          assert.lengthOf(firstSentData.MetricData, 1)
          assert.approximately(firstSentData.MetricData[0].Value, 4.0, 1e-5)
          assert.equal(firstSentData.MetricData[0].Unit, 'Gigabytes')

          const secondSentData = AWS.cloudwatch.putMetricData.secondCall.args[0]
          assert.lengthOf(secondSentData.MetricData, 1)
          assert.approximately(secondSentData.MetricData[0].Value, 7.0, 1e-5)
          assert.equal(secondSentData.MetricData[0].Unit, 'Gigabytes')
        })
    })
  })
})
