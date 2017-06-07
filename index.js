'use strict'

const Promise = require('bluebird')

const AWS = require('./lib/aws')
const Swarm = require('./lib/swarm')
const logger = require('./loggers').child({ module: 'models/main' })
const log = logger.child({ method: 'main' })


const swarm = new Swarm()

log.info('Start')
Promise.props({
  docks: AWS.getDocks(),
  swarmHosts: swarm.getInfo()
})
  .tap(data => log.trace({ data }, 'Done fetching docks and swarm hots'))
  .tap(data => (AWS.sendBasicInfoToCloudWatch(data.docks, data.swarmHosts)))
  .tap(data => log.trace({ data }, 'Done sending basic info to cloudwatch'))
  .tap(data => (AWS.sendThresholdDataToCloudWatch(data.swarmHosts)))
  .tap(data => log.trace({ data }, 'Done sending threshold data to cloudwatch'))
  .tap(data => (AWS.sendMaximumAvailableToCloudWatch(data.swarmHosts)))
  .tap(data => log.trace({ data }, 'Done sending max available to cloudwatch'))
  .catch((err) => {
    log.error({ err }, 'Error running script')
    process.exit(1)
  })
