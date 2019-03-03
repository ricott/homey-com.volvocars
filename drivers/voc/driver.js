'use strict';

const Homey	= require('homey');
const VOC = require('../../lib/voc.js')

class VOCDriver extends Homey.Driver {

	onInit() {
		this.log('VOC driver has been initialized');
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
			'heater_started'
		];
		this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);

		//Register actions
		triggers = [
			'heaterControl',
			'lockControl',
			'engineControl',
			'blinkLightsControl',
			'honkHornControl',
			'honkHornAndBlinkLightsControl'
		];
		this._registerFlow('action', triggers, Homey.FlowCardAction);

		this.flowCards['action.heaterControl'].registerRunListener(( args, state ) => {
			this.log('----- Heater action triggered');
			this.log(`Action: '${args.heaterAction}'`);
			if (args.heaterAction === 'ON') {
				args.device.startHeater();
			} else if (args.heaterAction === 'OFF') {
				args.device.stopHeater();
			}
			return true;
		});

		this.flowCards['action.lockControl'].registerRunListener(( args, state ) => {
			this.log('----- Lock action triggered');
			this.log(`Action: '${args.lockAction}'`);
			if (args.lockAction === 'LOCK') {
				args.device.lock();
			} else if (args.lockAction === 'UNLOCK') {
				args.device.unlock();
			}
			return true;
		});

		this.flowCards['action.blinkLightsControl'].registerRunListener(( args, state ) => {
			this.log('----- Blink lights action triggered');
			args.device.blinkLights();
			return true;
		});
		this.flowCards['action.honkHornControl'].registerRunListener(( args, state ) => {
			this.log('----- Honk horn action triggered');
			args.device.honkHorn();
			return true;
		});
		this.flowCards['action.honkHornAndBlinkLightsControl'].registerRunListener(( args, state ) => {
			this.log('----- Honk horn and blink lights action triggered');
			args.device.honkHornAndBlinkLights();
			return true;
		});

		this.flowCards['action.engineControl'].registerRunListener(( args, state ) => {
			this.log('----- Engine action triggered');
			this.log(`Action: '${args.engineAction}' with param '${args.engineDuration}'`);
			this.log(`Current ERS state: '${args.device.car.status.ERS.status}'`);
			this.log(`Current engine state: '${args.device.car.status.engineRunning}'`);
			this.log(`Current warning: '${args.device.car.status.ERS.engineStartWarning}'`);

			if (args.engineAction === 'START') {
				//Cant start engine if already started
				if (args.device.car.status.engineRunning) {
					this.log('Engine already running!');
					return false;
				} else if (args.device.car.status.ERS.status !== 'off') {
					this.log('Engine remote start (ERS) already running!');
					return false;
				} else if (args.device.car.status.ERS.engineStartWarning !== 'None') {
					this.log(`Can't remote start engine, warning: '${args.device.car.status.ERS.engineStartWarning}'`);
					return false;
				}

				args.device.startEngine(args.engineDuration);

			} else if (args.engineAction === 'STOP') {
				//Cant stop engine if already stopped
				if (args.device.car.status.ERS.status === 'off') {
					this.log('Engine remote start (ERS) already stopped!');
					return false;
				}

				args.device.stopEngine();
			}
			return true;
		});

		//Register conditions
		triggers = [
			'heaterState',
			'engineState',
			'vehicleAtHome'
		];
		this._registerFlow('condition', triggers, Homey.FlowCardCondition);

		this.flowCards['condition.heaterState']
			.registerRunListener((args, state, callback) => {
					this.log('Flow condition.heaterState');
					this.log(`- device.heater: ${args.device.getCapabilityValue('heater')}`);

					if (args.device.getCapabilityValue('heater') === 'On') {
						return true;
					} else {
						return false;
					}
			});

			this.flowCards['condition.engineState']
				.registerRunListener((args, state, callback) => {
						this.log('Flow condition.engineState');
						this.log(`- device.engine: ${args.device.getCapabilityValue('engine')}`);

						if (args.device.getCapabilityValue('engine')) {
							return true;
						} else {
							return false;
						}
				});

			this.flowCards['condition.vehicleAtHome']
				.registerRunListener((args, state, callback) => {
						this.log('Flow condition.vehicleAtHome');
						this.log(`- device.distance: ${args.device.car.distanceFromHome}`);

						if (args.device.carAtHome()) {
							this.log('Car is at home');
							return true;
						} else {
							this.log('Car is not at home');
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
				this.flowCards[flow].trigger(device, tokens, device.state);
		}
		else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
				this.log('- regular trigger');
				this.flowCards[flow].trigger(tokens);
		}
	}

	// alternatively, use the shorthand method
  onPairListDevices(data, callback) {

		let vocSession = new VOC({
		  username: Homey.ManagerSettings.get('username'),
		  password: Homey.ManagerSettings.get('password'),
		  region: Homey.ManagerSettings.get('region')
		});

		let devices = vocSession.listVehiclesOnAccount();
		vocSession.on('account_devices_found', vehicles => {
			callback(null, vehicles);
		});

  }

}

module.exports = VOCDriver;
