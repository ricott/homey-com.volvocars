'use strict';

const Homey	= require('homey');
const VOC = require('../../lib/voc.js')

class VOCDriver extends Homey.Driver {

	onInit() {
		this.log('VOC driver has been initialized');
		//Lets set Europe as default region
		if (!Homey.ManagerSettings.get('region')) {
			Homey.ManagerSettings.set('region', 'eu');
		}
	}

	onPair (socket) {
    let vocSession;
    let account;
    socket.on('login', (data, callback) => {
      if (data.username === '' || data.password === '') {
				return callback(null, false);
			}

			account = data;

			vocSession = new VOC({
			  username: account.username,
			  password: account.password,
			  region: Homey.ManagerSettings.get('region')
			});

      vocSession.login()
				.then(function () {
        	callback(null, true)
				})
				.catch(error => {
        	console.log(error)
        	callback(null, false)
      	});
    });

    socket.on('list_devices', (data, callback) => {

			let devices = vocSession.listVehiclesOnAccount();

			vocSession.on('account_devices_found', vehicles => {
				callback(null, vehicles);
			});

    });

  }

}

module.exports = VOCDriver;
