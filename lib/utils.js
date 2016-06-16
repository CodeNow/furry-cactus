'use strict'

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

function promiseWhile (condition, action) {
  function loop (data) {
    if (condition(data)) { return Promise.resolve(data) }
    return action(data).then(loop)
  }
  return loop
}

module.exports = {
  FACTOR: FACTOR,
  promiseWhile: promiseWhile,
  UNITS: UNITS
}
