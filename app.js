'use strict';

const Homey = require('homey');

class VOCApp extends Homey.App {

	onInit() {
		this.log('Volvo On Call App is running...');
	}

}

module.exports = VOCApp;
