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
        this._registerFlows();
    }

    _registerFlows() {
        this.log('Registering flows');

        //Register actions
        const heaterControl = this.homey.flow.getActionCard('heaterControl');
        heaterControl.registerRunListener(async (args) => {
            this.log('----- Heater action triggered');
            this.log(`Action: '${args.heaterAction}'`);
            if (args.device.getVehicleAttributeValue(['remoteHeaterSupported']) ||
                args.device.getVehicleAttributeValue(['preclimatizationSupported'])) {
                if (args.heaterAction === 'ON') {
                    return args.device.startHeater()
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedStartHeater'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedStartHeater')} Reason: ${reason.message}`);
                        });

                } else if (args.heaterAction === 'OFF') {
                    return args.device.stopHeater()
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedStopHeater'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedStopHeater')} Reason: ${reason.message}`);
                        });
                }
            } else {
                this.log('Heater not supported!');
                return Promise.reject(this.homey.__('error.noHeaterSupport'));
            }
        });

        const lockControl = this.homey.flow.getActionCard('lockControl');
        lockControl.registerRunListener(async (args) => {
            this.log('----- Lock action triggered');
            this.log(`Action: '${args.lockAction}'`);
            if (args.lockAction === 'LOCK') {
                if (args.device.getVehicleAttributeValue(['lockSupported'])) {

                    return args.device.lock()
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedLock'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedLock')} Reason: ${reason.message}`);
                        });

                } else {
                    this.log('Lock not supported!');
                    return Promise.reject(this.homey.__('error.noLockSupport'));
                }
            } else if (args.lockAction === 'UNLOCK') {
                if (args.device.getVehicleAttributeValue(['unlockSupported'])) {

                    return args.device.unlock()
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedUnLock'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedUnLock')} Reason: ${reason.message}`);
                        });

                } else {
                    this.log('Unlock not supported!');
                    return Promise.reject(this.homey.__('error.noUnlockSupport'));
                }
            }
            return true;
        });

        const blinkLightsControl = this.homey.flow.getActionCard('blinkLightsControl');
        blinkLightsControl.registerRunListener(async (args) => {
            this.log('----- Blink lights action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.blinkLights()
                    .then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(this.homey.__('error.failedBlinkLights'));
                        }
                    }).catch(reason => {
                        return Promise.reject(`${this.homey.__('error.failedBlinkLights')} Reason: ${reason.message}`);
                    });

            } else {
                this.log('Honk and blink not supported!');
                return Promise.reject(this.homey.__('error.noBlinkHonkSupport'));
            }
        });

        const honkHornControl = this.homey.flow.getActionCard('honkHornControl');
        honkHornControl.registerRunListener(async (args) => {
            this.log('----- Honk horn action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.honkHorn()
                    .then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(this.homey.__('error.failedHonkHorn'));
                        }
                    }).catch(reason => {
                        return Promise.reject(`${this.homey.__('error.failedHonkHorn')} Reason: ${reason.message}`);
                    });

            } else {
                this.log('Honk and blink not supported!');
                return Promise.reject(this.homey.__('error.noBlinkHonkSupport'));
            }
        });

        const honkHornAndBlinkLightsControl = this.homey.flow.getActionCard('honkHornAndBlinkLightsControl');
        honkHornAndBlinkLightsControl.registerRunListener(async (args) => {
            this.log('----- Honk horn and blink lights action triggered');
            if (args.device.getVehicleAttributeValue(['honkAndBlinkSupported'])) {

                return args.device.honkHornAndBlinkLights()
                    .then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(this.homey.__('error.failedHonkHornAndBlinkLights'));
                        }
                    }).catch(reason => {
                        return Promise.reject(`${this.homey.__('error.failedHonkHornAndBlinkLights')} Reason: ${reason.message}`);
                    });

            } else {
                this.log('Honk and blink not supported!');
                return Promise.reject(this.homey.__('error.noBlinkHonkSupport'));
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
                        return Promise.reject(this.homey.__('error.engineAlreadyRunning'));

                    } else if (args.device.car.status.ERS.status !== 'off') {
                        this.log('Engine remote start (ERS) already running!');
                        return Promise.reject(this.homey.__('error.engineERSAlreadyRunning'));

                    } else if (args.device.car.status.ERS.engineStartWarning !== 'None') {
                        this.log(`Can't remote start engine, warning: '${args.device.car.status.ERS.engineStartWarning}'`);
                        return Promise.reject(this.homey.__('error.engineERSWarning',
                            { 'ERSwarning': args.device.car.status.ERS.engineStartWarning }));
                    }

                    return args.device.startEngine(args.engineDuration)
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedStartERS'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedStartERS')} Reason: ${reason.message}`);
                        });

                } else if (args.engineAction === 'STOP') {
                    //Cant stop engine if already stopped
                    if (args.device.car.status.ERS.status === 'off') {
                        this.log('Engine remote start (ERS) already stopped!');
                        return Promise.reject(this.homey.__('error.engineAlreadyStopped'));
                    }

                    return args.device.stopEngine()
                        .then((result) => {
                            if (result) {
                                return Promise.resolve(true);
                            } else {
                                return Promise.reject(this.homey.__('error.failedStopERS'));
                            }
                        }).catch(reason => {
                            return Promise.reject(`${this.homey.__('error.failedStopERS')} Reason: ${reason.message}`);
                        });
                }

            } else {
                this.log('Engine Remote Start (ERS) not supported!');
                return Promise.reject(this.homey.__('error.noERSSupport'));
            }

        });

        const startCharging = this.homey.flow.getActionCard('startCharging');
        startCharging.registerRunListener(async (args) => {
            this.log('----- Start charging action triggered');

            if (args.device.getSetting('isPHEV') == 'true') {
                return args.device.startCharging()
                    .then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(this.homey.__('error.failedStartCharging'));
                        }
                    }).catch(reason => {
                        return Promise.reject(`${this.homey.__('error.failedStartCharging')} Reason: ${reason.message}`);
                    });

            } else {
                this.log('This is an ICE car and doesnt support charging!');
                return Promise.reject(this.homey.__('error.noCharging'));
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
                    args.delayedCharging, args.startTime, args.endTime)
                    .then((result) => {
                        if (result) {
                            return Promise.resolve(true);
                        } else {
                            return Promise.reject(this.homey.__('error.failedDelayCharging'));
                        }
                    }).catch(reason => {
                        return Promise.reject(`${this.homey.__('error.failedDelayCharging')} Reason: ${reason.message}`);
                    });

            } else {
                this.log('This is an ICE car and doesnt support charging!');
                return Promise.reject(this.homey.__('error.noCharging'));
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
