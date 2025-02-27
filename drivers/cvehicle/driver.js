'use strict';
const Homey = require('homey');
const AuthHandler = require('../../lib/auth.js');
const ConnectedVehicle = require('../../lib/cVehicle.js');
const config = require('../../lib/const.js');

class ConnectedVehicleDriver extends Homey.Driver {

    async onInit() {
        this.log('Connected Vehicle driver has been initialized');
    }

    async onPair(session) {
        let settings, cookie, otpUrl, token;

        session.setHandler('settings', async (data) => {
            settings = data;
            if (settings.username === '' || settings.password === '' || settings.vccApiKey === '') {
                throw new Error('Username, password and vcc api key are mandatory!');
            }

            const auth = new AuthHandler(Homey.env.VCC_LOGIN_TOKEN);

            if (settings.otp && otpUrl && cookie) {
                // Second time around, OTP is filled out
                token = await auth.verifyOtp(otpUrl, cookie, settings.otp, settings.username);

                try {
                    session.nextView();
                    return true;
                } catch (ignore) { }

            } else {
                // First time around, no OTP present
                const response = await auth.authorize(settings.username, settings.password);
                if (response.authState == config.authState.OTP_REQUIRED) {
                    this.log('OTP email sent, check...');
                    cookie = response.response.cookie;
                    otpUrl = response.response.data._links.checkOtp.href;
                    return config.authState.OTP_REQUIRED;
                } else {
                    throw new Error(`Auth state not implemented '${response.authState}'`);
                }
            }
        });

        session.setHandler('list_devices', async (data) => {

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
                        token: token
                    },
                    settings: {
                        vccApiKey: settings.vccApiKey
                    }
                };
            });
            let devices = await Promise.all(devicesData);
            return devices;
        });
    }

    onRepair(session, device) {
        let cookie, otpUrl, token;

        session.setHandler('settings', async (settings) => {
            if (settings.username === '' || settings.password === '' || settings.vccApiKey === '') {
                throw new Error('Username, password and vcc api key are mandatory!');
            }

            const auth = new AuthHandler(Homey.env.VCC_LOGIN_TOKEN);

            if (settings.otp && otpUrl && cookie) {
                // Second time around, OTP is filled out
                token = await auth.verifyOtp(otpUrl, cookie, settings.otp, settings.username);

                const cVehicle = new ConnectedVehicle({
                    accessToken: token.access_token,
                    vccApiKey: settings.vccApiKey,
                    device: this
                });

                const vehicles = await cVehicle.getVehicles()
                    .catch(reason => {
                        return Promise.reject(reason);
                    });

                const msg = `Vehicle '${device.getName()}' is not connected to the Volvo account '${settings.username}'`;
                if (!Array.isArray(vehicles?.data)) {
                    // The account doesnt have any linked vehicles
                    this.error(msg);
                    return Promise.reject(new Error(msg));
                }

                // Verify the new account has access to the vehicle being repaired
                const vehicle = vehicles.data.find(vehicle => vehicle.vin == device.getData().id);
                if (vehicle) {
                    this.log(`Found vehicle with id '${vehicle.vin}'`);
                    device.storeCredentialsEncrypted(settings.username, settings.password);
                    device.setToken(token);

                    await device.setSettings({
                        vccApiKey: settings.vccApiKey
                    })
                        .catch(err => {
                            this.error(`Failed to update settings`, err);
                        });

                    session.done();
                }

            } else {
                // First time around, no OTP present
                const response = await auth.authorize(settings.username, settings.password);
                if (response.authState == config.authState.OTP_REQUIRED) {
                    this.log('OTP email sent, check...');
                    cookie = response.response.cookie;
                    otpUrl = response.response.data._links.checkOtp.href;
                    return config.authState.OTP_REQUIRED;
                } else {
                    throw new Error(`Auth state not implemented '${response.authState}'`);
                }
            }
        });
    }
}

module.exports = ConnectedVehicleDriver;
