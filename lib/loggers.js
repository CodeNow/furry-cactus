'use strict'

const bunyan = require('bunyan')

/**
 * Creates a new logger with the given name and custom serializers.
 *
 * @param {string}    name        - Name for the bunyan logger.
 * @returns {bunyan}              - A bunyan logger.
 */
function create (name) {
  return bunyan.createLogger({
    name: 'furry-cactus',
    streams: [
      {
        level: process.env.LOG_LEVEL || 'INFO',
        stream: process.stdout
      }
    ]
  })
}

/**
 * Bunyan logger
 * @module furry-cactus:logger
 */
module.exports = create('furry-cactus', {})
