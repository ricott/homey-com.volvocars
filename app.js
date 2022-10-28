'use strict';

const { App } = require('homey');

class VOCApp extends App {
	async onInit() {
		this.log(`Volvo on Call v${this.getAppVersion()} is running`);
	}

    getAppVersion() {
        return this.homey.manifest.version;
    }
}

module.exports = VOCApp;
