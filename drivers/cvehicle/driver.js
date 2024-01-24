'use strict';

const Homey = require('homey');
const TokenManager = require('../../lib/tokenManager');
const ConnectedVehicle = require('../../lib/cVehicle.js');
const config = require('../../lib/const.js');

class ConnectedVehicleDriver extends Homey.Driver {

    async onInit() {
        this.log('Connected Vehicle driver has been initialized');
        this.tokenManager = TokenManager;
    }

    async onPair(session) {
        let devices = [];
        let settings;

        session.setHandler('settings', async (data) => {
            settings = data;
            if (settings.username === '' || settings.password === '' || settings.vccApiKey === '') {
                throw new Error('Username, password and vcc api key are mandatory!');
            }

            const token = await this.tokenManager.getToken(
                Homey.env.VCC_LOGIN_TOKEN,
                settings.username,
                settings.password
            )
                .catch(reason => {
                    return Promise.reject(reason);
                });

            const cVehicle = new ConnectedVehicle({
                accessToken: token.access_token,
                vccApiKey: settings.vccApiKey,
                device: this
            });

            const vehicles = await cVehicle.getVehicles()
                .catch(reason => {
                    return Promise.reject(reason);
                });

            const devicesData = vehicles.data.map(async (vehicle) => {
                const vehicleInfo = await cVehicle.getVehicleInfo(vehicle.vin);
                return {
                    name: `${vehicleInfo.data.descriptions.model} / ${vehicleInfo.data.modelYear}`,
                    data: {
                        id: vehicle.vin,
                    },
                    store: {
                        username: settings.username,
                        password: settings.password,
                    },
                    settings: {
                        vccApiKey: settings.vccApiKey
                    }
                };
            });
            devices = await Promise.all(devicesData);

            try {
                session.nextView();
                return true;
            } catch (ignore) { }
        });

        session.setHandler('list_devices', async (data) => {
            return devices;
        });
    }

    onRepair(session, device) {
        let self = this;

        session.setHandler('settings', async (data) => {
            if (data.username === '' || data.password === '' || data.vccApiKey === '') {
                throw new Error('Username, password and vcc api key are mandatory!');
            }

            const token = await this.tokenManager.getToken(
                Homey.env.VCC_LOGIN_TOKEN,
                data.username,
                data.password
            )
                .catch(reason => {
                    return Promise.reject(reason);
                });

            const cVehicle = new ConnectedVehicle({
                accessToken: token.access_token,
                vccApiKey: data.vccApiKey,
                device: this
            });

            return cVehicle.getVehicles()
                .then(async function (vehicles) {
                    const msg = `Vehicle '${device.getName()}' is not connected to the Volvo account '${data.username}'`;
                    if (!Array.isArray(vehicles?.data)) {
                        // The account doesnt have any linked vehicles
                        self.error(msg);
                        throw new Error(msg);
                    }

                    // Verify the new account has access to the vehicle being repaired
                    const vehicle = vehicles.data.find(vehicle => vehicle.vin == device.getData().id);
                    if (vehicle) {
                        self.log(`Found vehicle with id '${vehicle.vin}'`);
                        device.storeCredentialsEncrypted(data.username, data.password);
                        await device.setSettings({
                            vccApiKey: data.vccApiKey
                        })
                            .catch(err => {
                                this.error(`Failed to update settings`, err);
                            });

                        session.done();
                    } else {
                        self.error(msg);
                        throw new Error(msg);
                    }
                })
                .catch(reason => {
                    self.error(reason);
                    return Promise.reject(reason);
                });

        });
    }
}

module.exports = ConnectedVehicleDriver;
