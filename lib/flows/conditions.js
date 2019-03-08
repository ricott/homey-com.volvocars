'use strict';

const Homey = require('homey');

const flowlist = {
  heaterState: onConditionHeaterState,
  engineState: onConditionEngineState,
  vehicleAtHome: onConditionVehicleState
}

exports.init = function () {
  Homey.app.log('Registering condition flows');

  Object.keys(flowlist).forEach(flow => {
    Homey.app.log(`- condition.${flow}'`);
    Homey.app['condition.' + flow] = new Homey.FlowCardCondition(flow)
      .register()
      .registerRunListener(flowlist[flow]);
  })
}

function onConditionHeaterState (args) {
  Homey.app.log('Flow condition.heaterState');
  Homey.app.log(`- device.heater: ${args.device.getCapabilityValue('heater')}`);

  if (args.device.getCapabilityValue('heater') === 'On') {
    return Promise.resolve(true);
  } else {
    return Promise.resolve(false);
  }
}

function onConditionEngineState (args) {
  Homey.app.log('Flow condition.engineState');
  let engineStateValue = args.device.getCapabilityValue('engine');
  Homey.app.log(`- device.engine: ${engineStateValue}`);

  if (engineStateValue) {
    return Promise.resolve(true);
  } else {
    return Promise.resolve(false);
  }
}

function onConditionVehicleState (args) {
  Homey.app.log('Flow condition.vehicleAtHome');
  Homey.app.log(`- device.distance: ${args.device.car.distanceFromHome}`);

  if (args.device.carAtHome()) {
    Homey.app.log('Car is at home');
    return Promise.resolve(true);
  } else {
    Homey.app.log('Car is not at home');
    return Promise.resolve(false);
  }
}
