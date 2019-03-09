'use strict';

const Homey = require('homey');

const flowlist = {
  heaterControl: 'onHeaterControl',
  lockControl: 'onLockControl',
  engineControl: 'onEngineControl',
  blinkLightsControl: 'onBlinkLightsControl',
  honkHornControl: 'onHonkHornControl',
  honkHornAndBlinkLightsControl: 'onHonkHornAndBlinkLightsControl'
}

exports.init = function () {
  Homey.app.log('Removing action flows');

  Object.keys(flowlist).forEach(flow => {
    if (Homey.app['action.' + flow]) {
      Homey.app.log(`Removing - action.${flow}`);
      Homey.app['action.' + flow].unregister();
      Homey.app['action.' + flow] = null;
    } else {
      Homey.app.log(`Not found - action.${flow}`);
    }
  });
}
