'use strict';
const { App } = require('homey');
const { chargingSystemStatus, commands } = require('./lib/const');

class VOCApp extends App {
    async onInit() {
        this.log(`Volvo on Call v${this.getAppVersion()} is running`);

        this.setupGlobalFetch();

        // Register common triggers
        this._car_left_home = this.homey.flow.getDeviceTriggerCard('car_left_home');
        this._car_came_home = this.homey.flow.getDeviceTriggerCard('car_came_home');
        this._engine_started = this.homey.flow.getDeviceTriggerCard('engine_started');
        this._engine_stopped = this.homey.flow.getDeviceTriggerCard('engine_stopped');
        this._location_human_changed = this.homey.flow.getDeviceTriggerCard('location_human_changed');
        this._fuel_range_changed = this.homey.flow.getDeviceTriggerCard('fuel_range_changed');
        // cVehicle device type only trigger
        this._battery_range_changed = this.homey.flow.getDeviceTriggerCard('battery_range_changed');
        this._charge_system_status_changed = this.homey.flow.getDeviceTriggerCard('charge_system_status_changed');
        // Voc device type only triggers
        this._heater_started = this.homey.flow.getDeviceTriggerCard('heater_started');
        this._heater_stopped = this.homey.flow.getDeviceTriggerCard('heater_stopped');

        this._registerConditionFlows();
        this._registerVocOnlyActions();
        this._registerCVehicleOnlyActions();
    }

    setupGlobalFetch() {
        if (!global.fetch) {
            global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        }
        if (!global.AbortSignal.timeout) {
            global.AbortSignal.timeout = timeout => {
                const controller = new AbortController();
                const abort = setTimeout(() => {
                    controller.abort();
                }, timeout);
                return controller.signal;
            }
        }
    }

    getAppVersion() {
        return this.homey.manifest.version;
    }

    getChargingSystemStates() {
        let statusArray = [];
        Object.keys(chargingSystemStatus).forEach(key => {
            const val = String(chargingSystemStatus[key]).replace('CHARGING_SYSTEM_', '');
            statusArray.push({
                id: val,
                name: val
            })
        });

        statusArray.sort(function (a, b) {
            if (a.name > b.name) {
                return 1;
            }
            if (a.name < b.name) {
                return -1;
            }

            // names must be equal
            return 0;
        });

        return statusArray;
    }

    async triggerCarLeftHome(device) {
        await this._car_left_home.trigger(device, {}, {}).catch(this.error);
    }
    async triggerCarCameHome(device) {
        await this._car_came_home.trigger(device, {}, {}).catch(this.error);
    }
    async triggerEngineStarted(device) {
        await this._engine_started.trigger(device, {}, {}).catch(this.error);
    }
    async triggerEngineStopped(device, tokens) {
        await this._engine_stopped.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerLocationHumanChanged(device, tokens) {
        await this._location_human_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerFuelRangeChanged(device, tokens) {
        await this._fuel_range_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerBatteryRangeChanged(device, tokens) {
        await this._battery_range_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerChargeSystemStatusChanged(device, tokens) {
        await this._charge_system_status_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerHeaterStarted(device) {
        await this._heater_started.trigger(device, {}, {}).catch(this.error);
    }
    async triggerHeaterStopped(device) {
        await this._heater_stopped.trigger(device, {}, {}).catch(this.error);
    }


    _registerCVehicleOnlyActions() {
        const executeCommand = this.homey.flow.getActionCard('executeCommand');
        executeCommand.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'executeCommand' triggered`);
            this.log(`[${args.device.getName()}] Command name: '${args.command.name}'`);

            const client = args.device.createVolvoClient();
            const deviceId = args.device.getData().id;
            switch (args.command.name) {
                case commands.CLIMATIZATION_START:
                    return client.startClimatization(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.CLIMATIZATION_STOP:
                    return client.stopClimatization(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.FLASH:
                    return client.flash(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.HONK:
                    return client.honk(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.HONK_AND_FLASH:
                    return client.honkAndFlash(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.LOCK:
                    return client.lock(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.LOCK_REDUCED_GUARD:
                    return client.lockReducedGuard(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                case commands.UNLOCK:
                    return client.unlock(deviceId)
                        .then(result => {
                            return Promise.resolve(true);
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                // case commands.ENGINE_START:
                //     return client.startEngine(deviceId)
                //         .then(result => {
                //             return Promise.resolve(true);
                //         }).catch(reason => {
                //             return Promise.reject(reason);
                //         });
                // case commands.ENGINE_STOP:
                //     return client.stopEngine(deviceId)
                //         .then(result => {
                //             return Promise.resolve(true);
                //         }).catch(reason => {
                //             return Promise.reject(reason);
                //         });

                default:
                    const msg = `Unknown command '${args.command.name}'. The command is either erroneous or simply not implemented yet.`
                    this.log(msg);
                    return Promise.reject(new Error(msg));
            }
        });
        executeCommand.registerArgumentAutocompleteListener('command',
            async (query, args) => {
                return args.device.getAvailableCommands();
            }
        );
    }

    _registerVocOnlyActions() {

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
    }

    _registerConditionFlows() {
        this.log('Registering conditions');
        // Register conditions
        const engineState = this.homey.flow.getConditionCard('engineState');
        engineState.registerRunListener(async (args, state) => {
            this.log('Flow condition.engineState');
            const engineRunning = args.device.getCapabilityValue('engine');
            this.log(`- car.engine: ${engineRunning}`);
            return engineRunning;
        });

        const vehicleAtHome = this.homey.flow.getConditionCard('vehicleAtHome');
        vehicleAtHome.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleAtHome');
            const isCarAtHome = args.device.isCarAtHome();
            this.log(`- car.home: ${isCarAtHome}`);
            return isCarAtHome;
        });

        const vehicleLocked = this.homey.flow.getConditionCard('vehicleLocked');
        vehicleLocked.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleLocked');
            const locked = args.device.getCapabilityValue('locked');
            this.log(`- car.locked: ${locked}`);
            return locked;
        });

        const anyDoorOpen = this.homey.flow.getConditionCard('anyDoorOpen');
        anyDoorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.anyDoorOpen');
            const anyDoorOpen = args.device.isAnyDoorOpen();
            this.log(`- car.anyDoorOpen: ${anyDoorOpen}`);
            return anyDoorOpen;
        });

        const doorOpen = this.homey.flow.getConditionCard('doorOpen');
        doorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.doorOpen');
            this.log(`- args.door: '${args.door}'`);
            const doorOpen = args.device.isDoorOpen(args.door);
            this.log(`- doorOpen: ${doorOpen}`);
            return doorOpen;
        });

        // cVehicle device type only
        const chargeSystemStatus = this.homey.flow.getConditionCard('chargeSystemStatus');
        chargeSystemStatus.registerRunListener(async (args, state) => {
            this.log('Flow condition.chargeSystemStatus');
            this.log(`- args.status: '${args.status.name}'`);
            const status = args.device.getCapabilityValue('charging_system_status');
            this.log(`- car.status: '${status}'`);
            return status == args.status.name;
        });
        chargeSystemStatus.registerArgumentAutocompleteListener('status',
            async (query, args) => {
                return this.getChargingSystemStates();
            }
        );

        // Voc device type only
        const heaterState = this.homey.flow.getConditionCard('heaterState');
        heaterState.registerRunListener(async (args, state) => {
            this.log('Flow condition.heaterState');
            const heater = args.device.getCapabilityValue('heater');
            this.log(`- car.heater: ${heater}`);

            if (heater == 'On') {
                return true;
            } else {
                return false;
            }
        });
    }
}

module.exports = VOCApp;
