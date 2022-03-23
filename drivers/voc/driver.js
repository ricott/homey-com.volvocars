'use strict';

const Homey = require('homey');
const { v4: uuidv4 } = require('uuid');
const VOC = require('../../lib/voc.js');

class VOCDriver extends Homey.Driver {

	onInit() {
		this.log('VOC driver has been initialized');
		//Lets set Europe as default region
		if (!Homey.ManagerSettings.get('region')) {
			Homey.ManagerSettings.set('region', 'eu');
		}

		this.deviceUUID = uuidv4().toUpperCase();
		this.log(`Generating device uuid '${this.deviceUUID}'`);
		this.flowCards = {};
		this._registerFlows();
	}

	_registerFlows() {
		this.log('Registering flows');

		// Register device triggers
		let triggers = [
			'car_left_home',
			'car_came_home',
			'engine_started',
			'engine_stopped',
			'heater_started',
			'heater_stopped',
			'charge_cable_status_changed',
			'location_human_changed',
			'fuel_range_changed'
		];
		this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);

		//Register actions
		triggers = [
			'heaterControl',
			'lockControl',
			'engineControl',
			'blinkLightsControl',
			'honkHornControl',
			'honkHornAndBlinkLightsControl',
			'startCharging',
			'delayCharging'
		];
		this._registerFlow('action', triggers, Homey.FlowCardAction);

		this.flowCards['action.heaterControl'].registerRunListener((args, state) => {
			this.log('----- Heater action triggered');
			this.log(`Action: '${args.heaterAction}'`);
			if (args.device.car.attributes.remoteHeaterSupported ||
				args.device.car.attributes.preclimatizationSupported) {
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

		this.flowCards['action.lockControl'].registerRunListener((args, state) => {
			this.log('----- Lock action triggered');
			this.log(`Action: '${args.lockAction}'`);
			if (args.lockAction === 'LOCK') {
				if (args.device.car.attributes.lockSupported) {

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
				if (args.device.car.attributes.unlockSupported) {

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

		this.flowCards['action.blinkLightsControl'].registerRunListener((args, state) => {
			this.log('----- Blink lights action triggered');
			if (args.device.car.attributes.honkAndBlinkSupported) {

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

		this.flowCards['action.honkHornControl'].registerRunListener((args, state) => {
			this.log('----- Honk horn action triggered');
			if (args.device.car.attributes.honkAndBlinkSupported) {

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

		this.flowCards['action.honkHornAndBlinkLightsControl'].registerRunListener((args, state) => {
			this.log('----- Honk horn and blink lights action triggered');
			if (args.device.car.attributes.honkAndBlinkSupported) {

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

		this.flowCards['action.engineControl'].registerRunListener((args, state) => {
			this.log('----- Engine action triggered');
			this.log(`Action: '${args.engineAction}' with param '${args.engineDuration}'`);

			//If Engine Remote Start (ERS) section is missing from status API - then no support for ERS
			if (args.device.car.attributes.engineStartSupported && args.device.car.status.ERS) {
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

		this.flowCards['action.startCharging'].registerRunListener((args, state) => {
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

		this.flowCards['action.delayCharging'].registerRunListener((args, state) => {
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
		})
			.getArgument('chargeLocation')
			.registerAutocompleteListener((query, args) => {
				return Promise.resolve(args.device.car.chargeLocations);
			});

		//Register conditions
		triggers = [
			'heaterState',
			'engineState',
			'vehicleAtHome',
			'vehicleLocked',
			'anyDoorOpen',
			'doorOpen'
		];
		this._registerFlow('condition', triggers, Homey.FlowCardCondition);

		this.flowCards['condition.heaterState']
			.registerRunListener((args, state, callback) => {
				this.log('Flow condition.heaterState');
				this.log(`- car.heater: ${args.device.getCapabilityValue('heater')}`);

				if (args.device.getCapabilityValue('heater') === 'On') {
					return true;
				} else {
					return false;
				}
			});

		this.flowCards['condition.engineState']
			.registerRunListener((args, state, callback) => {
				this.log('Flow condition.engineState');
				this.log(`- car.engine: ${args.device.getCapabilityValue('engine')}`);

				if (args.device.getCapabilityValue('engine')) {
					return true;
				} else {
					return false;
				}
			});

		this.flowCards['condition.vehicleAtHome']
			.registerRunListener((args, state, callback) => {
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

		this.flowCards['condition.vehicleLocked']
			.registerRunListener((args, state, callback) => {
				this.log('Flow condition.vehicleLocked');
				this.log(`- car.locked: ${args.device.getCapabilityValue('locked')}`);

				if (args.device.getCapabilityValue('locked')) {
					return true;
				} else {
					return false;
				}
			});

		this.flowCards['condition.anyDoorOpen']
			.registerRunListener((args, state, callback) => {
				this.log('Flow condition.anyDoorOpen');
				let anyDoorOpen = args.device.isAnyDoorOpen();
				this.log(`- anyDoorOpen: ${anyDoorOpen}`);

				if (anyDoorOpen) {
					return true;
				} else {
					return false;
				}
			});

		this.flowCards['condition.doorOpen']
			.registerRunListener((args, state, callback) => {
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

	_registerFlow(type, keys, cls) {
		keys.forEach(key => {
			this.log(`- flow '${type}.${key}'`);
			this.flowCards[`${type}.${key}`] = new cls(key).register();
		});
	}

	triggerFlow(flow, tokens, device) {
		this.log(`Triggering flow '${flow}' with tokens`, tokens);
		// this.log(this.flowCards[flow])
		if (this.flowCards[flow] instanceof Homey.FlowCardTriggerDevice) {
			this.log('- device trigger for ', device.getName());
			this.flowCards[flow].trigger(device, tokens);
		}
		else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
			this.log('- regular trigger');
			this.flowCards[flow].trigger(tokens);
		}
	}

	onPair(socket) {
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
				region: Homey.ManagerSettings.get('region'),
				uuid: this.deviceUUID
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
