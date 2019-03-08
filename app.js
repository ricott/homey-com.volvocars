'use strict';

const Homey = require('homey');
const ActionFlows = require('./lib/flows/actions.js');
const ConditionFlows = require('./lib/flows/conditions.js');
const TriggerFlows = require('./lib/flows/triggers.js');

class VOCApp extends Homey.App {

	onInit() {
		this.log('Volvo On Call App is running...');
		ActionFlows.init();
		ConditionFlows.init();
		TriggerFlows.init();
	}

}

module.exports = VOCApp;
