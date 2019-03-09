'use strict';

const Homey = require('homey');

const flowlist = {
  car_left_home: 'trigger.car_left_home',
  car_came_home: 'trigger.car_came_home',
  engine_started: 'trigger.engine_started',
  heater_started: 'trigger.heater_started'
}

exports.init = function () {
  Homey.app.log('Removing trigger flows');

  Object.keys(flowlist).forEach(flow => {
    if (Homey.app[flowlist[flow]]) {
      Homey.app.log(`Deleting - trigger.${flow}'`);
      Homey.app[flowlist[flow]].unregister();
      Homey.app[flowlist[flow]] = null;
    } else {
      Homey.app.log(`Not found - trigger.${flow}'`);
    }
  });
}
