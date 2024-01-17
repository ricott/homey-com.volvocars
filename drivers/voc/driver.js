'use strict';
const Homey = require('homey');
const { v4: uuidv4 } = require('uuid');
const VOC = require('../../lib/voc.js');

class VOCDriver extends Homey.Driver {

    async onInit() {
        this.log('VOC driver has been initialized');
        //Lets set Europe as default region
        if (!this.homey.settings.get('region')) {
            this.homey.settings.set('region', 'eu');
        }

        this.deviceUUID = uuidv4().toUpperCase();
        this.log(`Generating device uuid '${this.deviceUUID}'`);
    }

    async onPair(session) {
        let self = this;
        let vocSession;
        let account;

        session.setHandler('login', async (data) => {
            if (data.username === '' || data.password === '') {
                throw new Error('User name and password is mandatory!');
            }

            account = data;

            vocSession = new VOC({
                username: account.username,
                password: account.password,
                region: this.homey.settings.get('region'),
                uuid: this.deviceUUID
            });

            return vocSession.login()
                .then(function () {
                    return true;
                })
                .catch(reason => {
                    self.error(reason);
                    throw reason;
                });
        });

        session.setHandler('list_devices', async (data) => {
            return vocSession.listVehiclesOnAccount()
                .then(function (devices) {
                    return devices;
                });
        });

    }

}
module.exports = VOCDriver;
