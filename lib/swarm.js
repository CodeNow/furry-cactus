'use strict'

const assign = require('101/assign')
const DockerodeModule = require('dockerode')
const fs = require('fs')
const join = require('path').join
const Swarmerode = require('swarmerode')
const Promise = require('bluebird')

const utils = require('./utils')

class Swarm {
  constructor () {
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

    const Dockerode = Swarmerode(DockerodeModule)
    this._client = new Dockerode(assign({
      host: process.env.SWARM_HOSTNAME,
      port: process.env.SWARM_PORT,
      timeout: 2 * 60 * 1000
    }, certs))
  }

  getInfo () {
    return Promise.fromCallback((cb) => {
      this._client.swarmInfo(cb)
    })
      .then((info) => {
        // console.log(info.parsedSystemStatus.ParsedNodes)
        return Object.keys(info.parsedSystemStatus.ParsedNodes).map((key) => {
          const node = info.parsedSystemStatus.ParsedNodes[key]
          const usedMemory = node.ReservedMem.split('/').shift().trim()
          const availableMemory = node.ReservedMem.split('/').pop().trim()
          const usedMemoryValue = parseFloat(usedMemory.split(' ').shift())
          const usedMemoryUnits = utils.UNITS[usedMemory.split(' ').pop()]
          const availableMemoryValue =
            parseFloat(availableMemory.split(' ').shift())
          const availableMemoryUnits =
            utils.UNITS[availableMemory.split(' ').pop()]

          const usedMemoryGiB =
            usedMemoryValue / utils.FACTOR[usedMemoryUnits]
          const availableMemoryGiB =
            availableMemoryValue / utils.FACTOR[availableMemoryUnits]

          const percentage = (usedMemoryGiB / availableMemoryGiB) * 100

          return {
            Host: node.Host.split(':').shift(),
            Value: percentage,
            Unit: 'Percent',
            org: node.Labels.org,
            usedMemoryGiB: usedMemoryGiB,
            availableMemoryGiB: availableMemoryGiB
          }
        })
      })
  }
}

module.exports = Swarm
