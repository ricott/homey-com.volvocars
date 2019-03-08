'use strict';

const Homey = require('homey');

const flowlist = {
  heaterControl: onHeaterControl,
  lockControl: onLockControl,
  engineControl: onEngineControl,
  blinkLightsControl: onBlinkLightsControl,
  honkHornControl: onHonkHornControl,
  honkHornAndBlinkLightsControl: onHonkHornAndBlinkLightsControl
}

exports.init = function () {
  Homey.app.log('Registering action flows');

  Object.keys(flowlist).forEach(flow => {
    Homey.app.log(`- action.${flow}'`);
    Homey.app['action.' + flow] = new Homey.FlowCardAction(flow)
      .register()
      .registerRunListener(flowlist[flow]);
  })
}

function onHeaterControl (args) {
  Homey.app.log('----- Heater action triggered');
  Homey.app.log(`Action: '${args.heaterAction}'`);
  if (args.heaterAction === 'ON') {
    args.device.startHeater()
      .then(response => Promise.resolve(true))
      .catch(reason => Promise.reject(reason));

  } else if (args.heaterAction === 'OFF') {
    args.device.stopHeater()
      .then(response => Promise.resolve(true))
      .catch(reason => Promise.reject(reason));
  }
}

function onLockControl (args) {
  Homey.app.log('----- Lock action triggered');
  Homey.app.log(`Action: '${args.lockAction}'`);
  if (args.lockAction === 'LOCK') {
    args.device.lock()
     .then(response => Promise.resolve(true))
     .catch(reason => Promise.reject(reason));

  } else if (args.lockAction === 'UNLOCK') {
    args.device.unlock()
     .then(response => Promise.resolve(true))
     .catch(reason => Promise.reject(reason));

  }
}

function onEngineControl (args) {
  Homey.app.log('----- Engine action triggered');
  Homey.app.log(`Action: '${args.engineAction}' with param '${args.engineDuration}'`);
  Homey.app.log(`Current ERS state: '${args.device.car.status.ERS.status}'`);
  Homey.app.log(`Current engine state: '${args.device.car.status.engineRunning}'`);
  Homey.app.log(`Current warning: '${args.device.car.status.ERS.engineStartWarning}'`);

  if (args.engineAction === 'START') {
    //Cant start engine if already started
    if (args.device.car.status.engineRunning) {
      Homey.app.log('Engine already running!');
      return false;
    } else if (args.device.car.status.ERS.status !== 'off') {
      Homey.app.log('Engine remote start (ERS) already running!');
      return false;
    } else if (args.device.car.status.ERS.engineStartWarning !== 'None') {
      Homey.app.log(`Can't remote start engine, warning: '${args.device.car.status.ERS.engineStartWarning}'`);
      return false;
    }

    args.device.startEngine(args.engineDuration)
      .then(response => Promise.resolve(true))
      .catch(reason => Promise.reject(reason));

  } else if (args.engineAction === 'STOP') {
    //Cant stop engine if already stopped
    if (args.device.car.status.ERS.status === 'off') {
      Homey.app.log('Engine remote start (ERS) already stopped!');
      return false;
    }

    args.device.stopEngine()
      .then(response => Promise.resolve(true))
      .catch(reason => Promise.reject(reason));

  }
}

function onBlinkLightsControl (args) {
  Homey.app.log('----- Blink lights action triggered');
  args.device.blinkLights()
    .then(response => Promise.resolve(true))
    .catch(reason => Promise.reject(reason));

}

function onHonkHornControl (args) {
  Homey.app.log('----- Honk horn action triggered');
  args.device.honkHorn()
    .then(response => Promise.resolve(true))
    .catch(reason => Promise.reject(reason));

}

function onHonkHornAndBlinkLightsControl (args) {
  Homey.app.log('----- Honk horn and blink lights action triggered');
  args.device.honkHornAndBlinkLights()
    .then(response => Promise.resolve(true))
    .catch(reason => Promise.reject(reason));

}
