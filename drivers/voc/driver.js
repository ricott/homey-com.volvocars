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
        this.flowCards = {};
        this._registerFlows();
    }

    _registerFlows() {
        this.log('Registering flows');

        // Register device triggers
        this.flowCards['car_left_home'] = this.homey.flow.getDeviceTriggerCard('car_left_home');
        this.flowCards['car_came_home'] = this.homey.flow.getDeviceTriggerCard('car_came_home');
        this.flowCards['engine_started'] = this.homey.flow.getDeviceTriggerCard('engine_started');
        this.flowCards['engine_stopped'] = this.homey.flow.getDeviceTriggerCard('engine_stopped');
        this.flowCards['heater_started'] = this.homey.flow.getDeviceTriggerCard('heater_started');
        this.flowCards['heater_stopped'] = this.homey.flow.getDeviceTriggerCard('heater_stopped');
        this.flowCards['charge_cable_status_changed'] = this.homey.flow.getDeviceTriggerCard('charge_cable_status_changed');
        this.flowCards['location_human_changed'] = this.homey.flow.getDeviceTriggerCard('location_human_changed');
        this.flowCards['fuel_range_changed'] = this.homey.flow.getDeviceTriggerCard('fuel_range_changed');

        //Register actions
        const heaterControl = this.homey.flow.getActionCard('heaterControl');
        heaterControl.registerRunListener(async (args) => {
            this.log('----- Heater action triggered');
            this.log(`Action: '${args.heaterAction}'`);
            if (args.device.getVehicleAttributeValue(['remoteHeaterSupported']) ||
                args.device.getVehicleAttributeValue(['preclimatizationSupported'])) {
                if (args.heaterAction === 'ON') {
                    return args.device.startHeater().then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedStartHeater'));
                        }
                    });

                } else if (args.heaterAction === 'OFF') {
                    return args.device.stopHeater().then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedStopHeater'));
                        }
                    });
                }
            } else {
                this.log('Heater not supported!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noHeaterSupport') });
                notification.register();
                return Promise.reject(Homey.__('error.noHeaterSupport'));
            }
        });

        const lockControl = this.homey.flow.getActionCard('lockControl');
        lockControl.registerRunListener(async (args) => {
            this.log('----- Lock action triggered');
            this.log(`Action: '${args.lockAction}'`);
            if (args.lockAction === 'LOCK') {
                if (args.device.getVehicleAttributeValue(['lockSupported'])) {

                    return args.device.lock().then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedLock'));
                        }
                    });

                } else {
                    this.log('Lock not supported!');
                    let notification = new Homey.Notification({ excerpt: Homey.__('error.noLockSupport') });
                    notification.register();
                    return Promise.reject(Homey.__('error.noLockSupport'));
                }
            } else if (args.lockAction === 'UNLOCK') {
                if (args.device.getVehicleAttributeValue(['unlockSupported'])) {

                    return args.device.unlock().then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedUnLock'));
                        }
                    });

                } else {
                    this.log('Unlock not supported!');
                    let notification = new Homey.Notification({ excerpt: Homey.__('error.noUnlockSupport') });
                    notification.register();
                    return Promise.reject(Homey.__('error.noUnlockSupport'));
                }
            }
            return true;
        });

        const blinkLightsControl = this.homey.flow.getActionCard('blinkLightsControl');
        blinkLightsControl.registerRunListener(async (args) => {
            this.log('----- Blink lights action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.blinkLights().then((result) => {
                    if (result) {
                        return Promise.resolve(true);
                    } else {
                        return Promise.reject(Homey.__('error.failedBlinkLights'));
                    }
                });

            } else {
                this.log('Honk and blink not supported!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noBlinkHonkSupport') });
                notification.register();
                return Promise.reject(Homey.__('error.noBlinkHonkSupport'));
            }
        });

        const honkHornControl = this.homey.flow.getActionCard('honkHornControl');
        honkHornControl.registerRunListener(async (args) => {
            this.log('----- Honk horn action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.honkHorn().then((result) => {
                    if (result) {
                        return Promise.resolve(true);
                    } else {
                        return Promise.reject(Homey.__('error.failedHonkHorn'));
                    }
                });

            } else {
                this.log('Honk and blink not supported!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noBlinkHonkSupport') });
                notification.register();
                return Promise.reject(Homey.__('error.noBlinkHonkSupport'));
            }
        });

        const honkHornAndBlinkLightsControl = this.homey.flow.getActionCard('honkHornAndBlinkLightsControl');
        honkHornAndBlinkLightsControl.registerRunListener(async (args) => {
            this.log('----- Honk horn and blink lights action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.honkHornAndBlinkLights().then((result) => {
                    if (result) {
                        return Promise.resolve(true);
                    } else {
                        return Promise.reject(Homey.__('error.failedHonkHornAndBlinkLights'));
                    }
                });

            } else {
                this.log('Honk and blink not supported!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noBlinkHonkSupport') });
                notification.register();
                return Promise.reject(Homey.__('error.noBlinkHonkSupport'));
            }
        });

        const engineControl = this.homey.flow.getActionCard('engineControl');
        engineControl.registerRunListener(async (args) => {
            this.log('----- Engine action triggered');
            this.log(`Action: '${args.engineAction}' with param '${args.engineDuration}'`);

            //If Engine Remote Start (ERS) section is missing from status API - then no support for ERS
            if (args.device.getVehicleAttributeValue(['engineStartSupported']) && args.device.car.status.ERS) {
                this.log(`Current ERS state: '${args.device.car.status.ERS.status}'`);
                this.log(`Current engine state: '${args.device.car.status.engineRunning}'`);
                this.log(`Current warning: '${args.device.car.status.ERS.engineStartWarning}'`);

                if (args.engineAction === 'START') {
                    //Cant start engine if already started
                    if (args.device.car.status.engineRunning) {
                        this.log('Engine already running!');
                        return Promise.reject(Homey.__('error.engineAlreadyRunning'));

                    } else if (args.device.car.status.ERS.status !== 'off') {
                        this.log('Engine remote start (ERS) already running!');
                        return Promise.reject(Homey.__('error.engineERSAlreadyRunning'));

                    } else if (args.device.car.status.ERS.engineStartWarning !== 'None') {
                        this.log(`Can't remote start engine, warning: '${args.device.car.status.ERS.engineStartWarning}'`);
                        return Promise.reject(Homey.__('error.engineERSWarning',
                            { 'ERSwarning': args.device.car.status.ERS.engineStartWarning }));
                    }

                    return args.device.startEngine(args.engineDuration).then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedStartERS'));
                        }
                    });

                } else if (args.engineAction === 'STOP') {
                    //Cant stop engine if already stopped
                    if (args.device.car.status.ERS.status === 'off') {
                        this.log('Engine remote start (ERS) already stopped!');
                        return Promise.reject(Homey.__('error.engineAlreadyStopped'));
                    }

                    return args.device.stopEngine().then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedStopERS'));
                        }
                    });
                }

            } else {
                this.log('Engine Remote Start (ERS) not supported!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noERSSupport') });
                notification.register();
                return Promise.reject(Homey.__('error.noERSSupport'));
            }

        });

        const startCharging = this.homey.flow.getActionCard('startCharging');
        startCharging.registerRunListener(async (args) => {
            this.log('----- Start charging action triggered');

            if (args.device.getSetting('isPHEV') == 'true') {
                return args.device.startCharging().then((result) => {
                    if (result) {
                        return Promise.resolve(true);
                    } else {
                        return Promise.reject(Homey.__('error.failedStartCharging'));
                    }
                });

            } else {
                this.log('This is an ICE car and doesnt support charging!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noCharging') });
                notification.register();
                return Promise.reject(Homey.__('error.noCharging'));
            }
        });

        const delayCharging = this.homey.flow.getActionCard('delayCharging');
        delayCharging.registerRunListener(async (args) => {
            this.log('----- Delay charging action triggered');
            this.log(`Charge location: '${args.chargeLocation.id}' - '${args.chargeLocation.name}'`);
            this.log(`Delayed charging: '${args.delayedCharging}'`);
            this.log(`Start time: '${args.startTime}'`);
            this.log(`End time: '${args.endTime}'`);

            if (args.device.getSetting('isPHEV') == 'true') {
                return args.device.delayCharging(args.chargeLocation.id,
                    args.delayedCharging,
                    args.startTime,
                    args.endTime).then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(Homey.__('error.failedDelayCharging'));
                        }
                    });

            } else {
                this.log('This is an ICE car and doesnt support charging!');
                let notification = new Homey.Notification({ excerpt: Homey.__('error.noCharging') });
                notification.register();
                return Promise.reject(Homey.__('error.noCharging'));
            }
        });
        delayCharging.registerArgumentAutocompleteListener('chargeLocation',
            async (query, args) => {
                return Promise.resolve(args.device.car.chargeLocations);
            }
        );

        //Register conditions
        const heaterState = this.homey.flow.getConditionCard('heaterState');
        heaterState.registerRunListener(async (args, state) => {
            this.log('Flow condition.heaterState');
            this.log(`- car.heater: ${args.device.getCapabilityValue('heater')}`);

            if (args.device.getCapabilityValue('heater') === 'On') {
                return true;
            } else {
                return false;
            }
        });

        const engineState = this.homey.flow.getConditionCard('engineState');
        engineState.registerRunListener(async (args, state) => {
            this.log('Flow condition.engineState');
            this.log(`- car.engine: ${args.device.getCapabilityValue('engine')}`);

            if (args.device.getCapabilityValue('engine')) {
                return true;
            } else {
                return false;
            }
        });

        const vehicleAtHome = this.homey.flow.getConditionCard('vehicleAtHome');
        vehicleAtHome.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleAtHome');
            this.log(`- car.distance: ${args.device.car.distanceFromHome}`);

            if (args.device.carAtHome()) {
                this.log('Car is at home');
                return true;
            } else {
                this.log('Car is not at home');
                return false;
            }
        });

        const vehicleLocked = this.homey.flow.getConditionCard('vehicleLocked');
        vehicleLocked.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleLocked');
            this.log(`- car.locked: ${args.device.getCapabilityValue('locked')}`);

            if (args.device.getCapabilityValue('locked')) {
                return true;
            } else {
                return false;
            }
        });

        const anyDoorOpen = this.homey.flow.getConditionCard('anyDoorOpen');
        anyDoorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.anyDoorOpen');
            let anyDoorOpen = args.device.isAnyDoorOpen();
            this.log(`- anyDoorOpen: ${anyDoorOpen}`);

            if (anyDoorOpen) {
                return true;
            } else {
                return false;
            }
        });

        const doorOpen = this.homey.flow.getConditionCard('doorOpen');
        doorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.doorOpen');
            this.log(`Door: '${args.door}'`);

            let doorOpen = args.device.isDoorOpen(args.door);
            this.log(`- doorOpen: ${doorOpen}`);

            if (doorOpen) {
                return true;
            } else {
                return false;
            }
        });
    }

    triggerDeviceFlow(flow, tokens, device) {
        this.log(`[${device.getName()}] Triggering device flow '${flow}' with tokens`, tokens);
        try {
            this.flowCards[flow].trigger(device, tokens);
        } catch (error) {
            this.log(`Failed to trigger flow '${flow}' for device '${device.getName()}'`);
            this.log(error);
        }
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

            /*let devices = vocSession.listVehiclesOnAccount();
            vocSession.on('account_devices_found', vehicles => {
                callback(null, vehicles);
            });*/
            return vocSession.listVehiclesOnAccount()
                .then(function (devices) {
                    return devices;
                });
        });

    }

}

module.exports = VOCDriver;
