'use strict'

const chai = require('chai')
const sinon = require('sinon')
require('sinon-as-promised')
const assert = chai.assert
chai.use(require('chai-as-promised'))

const Dockerode = require('dockerode')

const MOCK_SWARM_INFO = require('./fixtures/swarm-info')

const Swarm = require('../lib/swarm')

describe('Swarm Model', () => {
  let swarm

  beforeEach(() => {
    swarm = new Swarm()
    sinon.stub(Dockerode.prototype, 'info').yieldsAsync(null, MOCK_SWARM_INFO)
  })

  afterEach(() => {
    Dockerode.prototype.info.restore()
  })

  describe('getInfo', () => {
    it('should get the swarm info', () => {
      return assert.isFulfilled(swarm.getInfo())
        .then(() => {
          sinon.assert.calledOnce(Dockerode.prototype.info)
        })
    })

    it('should return the decorate the host with the org', () => {
      return assert.isFulfilled(swarm.getInfo())
        .then((data) => {
          assert.equal(data[0].org, '1000')
          assert.equal(data[1].org, '2000')
        })
    })

    it('should return the percentage used for each host', () => {
      return assert.isFulfilled(swarm.getInfo())
        .then((data) => {
          data.forEach((d) => {
            assert.equal(d.Unit, 'Percent')
            assert.equal(d.Value, 50.0)
          })
        })
    })

    it('should return the used memory for each host', () => {
      return assert.isFulfilled(swarm.getInfo())
        .then((data) => {
          data.forEach((d) => {
            assert.equal(d.usedMemoryGiB, 4.0)
          })
        })
    })

    it('should return the available memory for each host', () => {
      return assert.isFulfilled(swarm.getInfo())
        .then((data) => {
          data.forEach((d) => {
            assert.equal(d.availableMemoryGiB, 8.0)
          })
        })
    })
  })
})
