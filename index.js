'use strict'

const Promise = require('bluebird')

const AWS = require('./lib/aws')
const Swarm = require('./lib/swarm')

const swarm = new Swarm()

Promise.props({
  docks: AWS.getDocks(),
  swarmHosts: swarm.getInfo()
})
  .tap((data) => (AWS.sendBasicInfoToCloudWatch(data.docks, data.swarmHosts)))
  .tap((data) => (AWS.sendThresholdDataToCloudWatch(data.swarmHosts)))
  .tap((data) => (AWS.sendMaximumAvailableToCloudWatch(data.swarmHosts)))
  .catch((err) => {
    console.log(err.stack || err.message || err)
    process.exit(1)
  })
