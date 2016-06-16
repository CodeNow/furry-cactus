'use strict'

const swarmInfoGenerator = require('swarmerode/test/fixtures/swarm-info')

const SWARM_INFO = swarmInfoGenerator([{
  Labels: 'org=1000'
}, {
  Labels: 'org=2000'
}])

const reservedMemoryRegexp = /Reserved\ Memory/

for (var i = 0; i < SWARM_INFO.SystemStatus.length; ++i) {
  if (reservedMemoryRegexp.test(SWARM_INFO.SystemStatus[i][0])) {
    SWARM_INFO.SystemStatus[i][1] = '4.000 GiB / 8.000 GiB'
  }
}

module.exports = SWARM_INFO
