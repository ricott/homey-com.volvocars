'use strict';

const Homey = require('homey');

const flowlist = {
  car_left_home: 'trigger.car_left_home',
  car_came_home: 'trigger.car_came_home',
  engine_started: 'trigger.engine_started',
  heater_started: 'trigger.heater_started'
}

exports.init = function () {
  Homey.app.log('Registering trigger flows');

  Object.keys(flowlist).forEach(flow => {
    Homey.app.log(`- trigger.${flow}'`);
    Homey.app[flowlist[flow]] = new Homey.FlowCardTriggerDevice(flow).register();
  })
}

exports.triggerFlow = function (triggerName, tokens, device) {
  Homey.app.log(`Triggering flow '${triggerName}' with tokens`, tokens);
  let flowDefinition = Homey.app[flowlist[triggerName]];

  if (flowDefinition instanceof Homey.FlowCardTriggerDevice) {
      Homey.app.log('- device trigger for ', device.getName());
      flowDefinition.trigger(device, tokens, device.state);

  } else if (flowDefinition instanceof Homey.FlowCardTrigger) {

      Homey.app.log('- regular trigger');
      flowDefinition.trigger(tokens);
  }
}
