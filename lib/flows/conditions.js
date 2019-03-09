'use strict';

const Homey = require('homey');

const flowlist = {
  heaterState: 'onConditionHeaterState',
  engineState: 'onConditionEngineState',
  vehicleAtHome: 'onConditionVehicleState'
}

exports.init = function () {
  Homey.app.log('Removing condition flows');

  Object.keys(flowlist).forEach(flow => {
    if (Homey.app['condition.' + flow]) {
      Homey.app.log(`Deleting - condition.${flow}'`);
      Homey.app['condition.' + flow].unregister();
      Homey.app['condition.' + flow] = null;
    } else {
      Homey.app.log(`Not found - condition.${flow}`);
    }
  });
}
