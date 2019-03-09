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

		this.flowCards = {};
		this._registerFlows();
	}

	_registerFlows() {
    this.log('Registering flows');

		// Register device triggers
		let triggers = [
			'car_left_home_v2',
			'car_came_home_v2',
			'engine_started_v2',
			'heater_started_v2'
		];
		this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);

		//Register actions
		triggers = [
			'heaterControl_v2',
			'lockControl_v2',
			'engineControl_v2',
			'blinkLightsControl_v2',
			'honkHornControl_v2',
			'honkHornAndBlinkLightsControl_v2'
		];
		this._registerFlow('action', triggers, Homey.FlowCardAction);

		this.flowCards['action.heaterControl_v2'].registerRunListener(( args, state ) => {
			this.log('----- Heater action triggered');
			this.log(`Action: '${args.heaterAction}'`);
			if (args.heaterAction === 'ON') {
				args.device.startHeater();
			} else if (args.heaterAction === 'OFF') {
				args.device.stopHeater();
			}
			return true;
		});

		this.flowCards['action.lockControl_v2'].registerRunListener(( args, state ) => {
			this.log('----- Lock action triggered');
			this.log(`Action: '${args.lockAction}'`);
			if (args.lockAction === 'LOCK') {
				args.device.lock();
			} else if (args.lockAction === 'UNLOCK') {
				args.device.unlock();
			}
			return true;
		});

		this.flowCards['action.blinkLightsControl_v2'].registerRunListener(( args, state ) => {
			this.log('----- Blink lights action triggered');
			args.device.blinkLights();
			return true;
		});
		this.flowCards['action.honkHornControl_v2'].registerRunListener(( args, state ) => {
			this.log('----- Honk horn action triggered');
			args.device.honkHorn();
			return true;
		});
		this.flowCards['action.honkHornAndBlinkLightsControl_v2'].registerRunListener(( args, state ) => {
			this.log('----- Honk horn and blink lights action triggered');
			args.device.honkHornAndBlinkLights();
			return true;
		});

		this.flowCards['action.engineControl_v2'].registerRunListener(( args, state ) => {
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
			'heaterState_v2',
			'engineState_v2',
			'vehicleAtHome_v2'
		];
		this._registerFlow('condition', triggers, Homey.FlowCardCondition);

		this.flowCards['condition.heaterState_v2']
			.registerRunListener((args, state, callback) => {
					this.log('Flow condition.heaterState');
					this.log(`- device.heater: ${args.device.getCapabilityValue('heater')}`);

					if (args.device.getCapabilityValue('heater') === 'On') {
						return true;
					} else {
						return false;
					}
			});

		this.flowCards['condition.engineState_v2']
			.registerRunListener((args, state, callback) => {
					this.log('Flow condition.engineState');
					this.log(`- device.engine: ${args.device.getCapabilityValue('engine')}`);

					if (args.device.getCapabilityValue('engine')) {
						return true;
					} else {
						return false;
					}
			});

		this.flowCards['condition.vehicleAtHome_v2']
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
