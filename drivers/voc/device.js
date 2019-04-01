'use strict';

const Homey = require('homey');
const VOC = require('../../lib/voc.js');
const Osm = require('../../lib/maps.js');

class VOCDevice extends Homey.Device {

  onInit() {
    this.log('VOC car initiated', this.getName());

    this.homeyActions = {};
    this.pollIntervals = [];
    this.refresh_position = this.getSettings().refresh_position || 10;
    this.refresh_status = this.getSettings().refresh_status || 2;
    this.proximity_home = this.getSettings().proximity_home || 50;
    this.lastTriggerLocation = 'unknown';

    this.car = {
      vin: this.getData().id,
      name: this.getName(),
      phev: false,
      attributes: null,
      status: null,
      position: null,
      distanceFromHome: 0,
      vocApi: null
    };

    if (!Homey.ManagerSettings.get(`${this.getData().id}.username`)) {
			//This is a newly added device, lets copy login details to homey settings
      this.log(`Setting login details for user '${this.getData().username}'`);

      Homey.ManagerSettings.set(`${this.getData().id}.username`, this.getData().username);
  		Homey.ManagerSettings.set(`${this.getData().id}.password`, this.getData().password);

      //Remove password from device data
      this.getData().password = null;
		}

    //Clear last error on app restart
    this.setSettings({voc_last_error: ''})
      .catch(err => {
        this.error('Failed to update settings', err);
      });

    this.car.vocApi = new VOC({
      username: Homey.ManagerSettings.get(`${this.getData().id}.username`),
		  password: Homey.ManagerSettings.get(`${this.getData().id}.password`),
		  region: Homey.ManagerSettings.get('region'),
      uuid: this.getDriver().deviceUUID
    });

    //Initialize static attributes
    this._initializeEventListeners();
    this.initializeVehicleAttributes();
    this.refreshVehicleStatus();
    this.refreshVehiclePosition();

    this._initilializeTimers();

  }

  _initilializeTimers() {
    this.log('Adding timers');
    // Start a poller, to check the device status
    this.pollIntervals.push(setInterval(() => {
        this.refreshVehicleStatus();
    }, 60 * 1000 * this.refresh_status));

    this.pollIntervals.push(setInterval(() => {
        this.refreshVehiclePosition();
    }, 60 * 1000 * this.refresh_position));
  }

  _deleteTimers() {
    //Kill interval object(s)
    this.log('Removing timers');
    this.pollIntervals.forEach(timer => {
        clearInterval(timer);
    });
  }

  _reinitializeTimers() {
    this._deleteTimers();
    this._initilializeTimers();
  }

  _initializeEventListeners() {

    this.car.vocApi.on('car_refreshed_status', status => {
      if (status) {
        this.log('Successful refresh of vehicle status to VOC');
        //We have done a successful refresh from vehicle to voc vehicle cloud
        //lets refresh the values in Homey
        this.car.vocApi.getVehicleStatus(this.car.vin);
      }
    });

    this.car.vocApi.on('car_action_status', response => {
      this.log(`Action '${response.action}' with result '${response.result}'`);
      //if (response.result)
      if (response.action !== 'blinkLights' && response.action !== 'honkHorn' &&
            response.action !== 'honkHornAndBlinkLights') {
        //We successfully invoked and action, lets refresh status so it shows that
        this.car.vocApi.refreshVehicleStatus(this.car.vin);
      }
    });

    //refreshVehicleStatus
    this.car.vocApi.on('car_status_update', vehicle => {
      this.log('Refreshing status from VOC');
      this.car.status = vehicle;
      this.setSettings({voc_status: JSON.stringify(this.car.status, null, "  ")})
        .catch(err => {
          this.error('Failed to update settings', err);
        });

      this._updateProperty('range', vehicle.distanceToEmpty);
      this._updateProperty('locked', vehicle.carLocked);

      let engineRunning = false;
      //Either engine is running or ERS is running
      if (vehicle.engineRunning) {
        engineRunning = true;
      } else if (this.car.attributes.engineStartSupported) {
        if (vehicle.ERS) {
          let ersStatus = vehicle.ERS.status || 'off';
          if (ersStatus.indexOf('on') > -1) {
            engineRunning = true;
          }
        }
      }
      this._updateProperty('engine', engineRunning);

      let heaterStatus = 'Off';
      if (vehicle.heater && vehicle.heater.status !== 'off') {
        heaterStatus = 'On';
      }
      this._updateProperty('heater', heaterStatus);

      //Only update battery status if car is a phev, e.g. highVoltageBatterySupported=true
      if (this.car.phev && vehicle.hvBattery) {
        this._updateProperty('measure_battery', vehicle.hvBattery.hvBatteryLevel);
      }
      //Connection status means charge cable status
      let chargeCableStatus = Homey.__('device.chargeCableStatus_disabled');
      if (vehicle.connectionStatus) {
          if (vehicle.connectionStatus === 'Disconnected') {
            chargeCableStatus = Homey.__('device.chargeCableStatus_disconnected');
          } else if (vehicle.connectionStatus === 'ConnectedWithoutPower') {
            chargeCableStatus = Homey.__('device.chargeCableStatus_ConnectedNoPower');
          } else if (vehicle.connectionStatus === 'ConnectedWithPower') {
            chargeCableStatus = Homey.__('device.chargeCableStatus_ConnectedWithPower');
          } else {
            chargeCableStatus = vehicle.connectionStatus;
          }
      }
      if (this.hasCapability('charge_cable_status')) {
        this._updateProperty('charge_cable_status', chargeCableStatus);
      }

    });

    //refreshVehiclePosition
    this.car.vocApi.on('car_position_update', position => {
      if (!this.car.position ||
        (Date.parse(position.timestamp) > Date.parse(this.car.position.timestamp) &&
        this.car.position.latitude.toFixed(5) != position.latitude.toFixed(5) &&
        this.car.position.longitude.toFixed(5) != position.longitude.toFixed(5))) {

        this.log('We got new position data');
        this.car.position = position;

        let distanceHomey = Osm.calculateDistance(position.latitude,
                                                  position.longitude,
                                                  Homey.ManagerGeolocation.getLatitude(),
                                                  Homey.ManagerGeolocation.getLongitude()) || 0;
        this.car.distanceFromHome = distanceHomey;
        distanceHomey = this.formatDistance(distanceHomey < 1 ? 0 : distanceHomey);
        this._updateProperty('distance', distanceHomey);

        if (this.lastTriggerLocation === 'unknown') {
          if (this.carAtHome()) {
            this.lastTriggerLocation = 'home';
          } else {
            this.lastTriggerLocation = 'away';
          }
        }

        Osm.geocodeLatLng(position.latitude, position.longitude).then((address) => {
           this._updateProperty('location_human', `${address.place}, ${address.city}`);
        });
      }
    });

    //initializeVehicleAttributes
    this.car.vocApi.on('car_attributes_update', attributes => {

      this.car.phev = attributes.highVoltageBatterySupported;

      this.car.attributes = attributes;
      let subscrEndDate = new Date(attributes.subscriptionEndDate)
              .toLocaleDateString('en-US', {day : 'numeric',month : 'short',year : 'numeric'});

      //Update Homey settings in advanced tab
      this.setSettings({license_plate: attributes.registrationNumber,
                        model: `${attributes.vehicleType}, ${attributes.modelYear}`,
                        fuelType: `${attributes.fuelType}, ${attributes.fuelTankVolume}l`,
                        subscriptionEndDate: subscrEndDate,
                        voc_attributes: JSON.stringify(this.car.attributes, null, "  ")})
        .catch(err => {
          this.error('Failed to update settings', err);
        });
    });

    this.car.vocApi.on('voc_api_error', error => {
      this.error('Houston we have a problem', error);

      let message = '';
      if (this.isError(error)) {
        message = error.stack;
      } else {
        try {
          message = JSON.stringify(error, null, "  ");
        } catch(e) {
          this.log('Failed to stringify object', e);
          message = error.toString();
        }
      }
      let dateTime = new Date().toISOString(); //.replace(/T/, ' ').replace(/\..+/, '');
      this.setSettings({voc_last_error: dateTime + '\n' + message})
        .catch(err => {
          this.error('Failed to update settings', err);
        });

    });

  }

  initializeVehicleAttributes() {
    this.car.vocApi.getVehicleAttributes(this.car.vin);
  }
  refreshVehicleStatus() {
    this.car.vocApi.refreshVehicleStatus(this.car.vin);
  }
  refreshVehiclePosition() {
    this.car.vocApi.getVehiclePosition(this.car.vin);
  }
  startHeater() {
    if (this.car.attributes.remoteHeaterSupported) {
      this.log('Heater supported, using heater/start');
      return this.car.vocApi.startHeater(this.car.vin);

    } else if (this.car.attributes.preclimatizationSupported) {
      this.log('Pre climatization supported, using preclimatization/start');
      return this.car.vocApi.startPreClimatization(this.car.vin);

    } else {
      this.log('No heater or preclimatization support.');
      return false;
    }
  }
  stopHeater() {
    if (this.car.attributes.remoteHeaterSupported) {
      this.log('heater/stop');
      return this.car.vocApi.stopHeater(this.car.vin);

    } else if (this.car.attributes.preclimatizationSupported) {
      this.log('preclimatization/stop');
      return this.car.vocApi.stopPreClimatization(this.car.vin);

    } else {
      this.log('No heater or preclimatization support.');
      return false;
    }
  }
  lock() {
    if (this.car.attributes.lockSupported) {
      return this.car.vocApi.lock(this.car.vin);
    } else {
      this.log('Lock not supported!');
      return false;
    }
  }
  unlock() {
    if (this.car.attributes.unlockSupported) {
      return this.car.vocApi.unlock(this.car.vin);
    } else {
      this.log('Unlock not supported!');
      return false;
    }
  }
  startEngine(duration) {
    if (this.car.attributes.engineStartSupported) {
      return this.car.vocApi.startEngine(this.car.vin, duration);
    } else {
      this.log('Engine Remote Start (ERS) not supported!');
      return false;
    }
  }
  stopEngine() {
    if (this.car.attributes.engineStartSupported) {
      return this.car.vocApi.stopEngine(this.car.vin);
    } else {
      this.log('Engine Remote Start (ERS) not supported!');
      return false;
    }
  }
  blinkLights() {
    if (this.car.attributes.honkAndBlinkSupported) {
      return this.car.vocApi.blinkLights(this.car.vin,
                                    this.car.position.latitude,
                                    this.car.position.longitude);
    } else {
      this.log('Honk and blink not supported!');
      return false;
    }
  }
  honkHorn() {
    if (this.car.attributes.honkAndBlinkSupported) {
      return this.car.vocApi.honkHorn(this.car.vin,
                                    this.car.position.latitude,
                                    this.car.position.longitude);
    } else {
      this.log('Honk and blink not supported!');
      return false;
    }
  }
  honkHornAndBlinkLights() {
    if (this.car.attributes.honkAndBlinkSupported) {
      return this.car.vocApi.honkHornAndBlinkLights(this.car.vin,
                                    this.car.position.latitude,
                                    this.car.position.longitude);
    } else {
      this.log('Honk and blink not supported!');
      return false;
    }
  }

  carAtHome() {
    if (this.car.distanceFromHome < this.proximity_home) {
      return true;
    } else {
      return false;
    }
  }

  _updateProperty(key, value) {
    let oldValue = this.getCapabilityValue(key);
    //If oldValue===null then it is a newly added device, lets not trigger flows on that
    if (oldValue !== null && oldValue != value) {
        this.log(`[${this.getName()}] Updating capability '${key}' from '${oldValue}' to '${value}'`);
        this.setCapabilityValue(key, value);

        if (key === 'heater' && value === 'On') {
          this.getDriver().triggerFlow('trigger.heater_started_v2', {}, this);

        } else if (key === 'engine' && value) {
          this.getDriver().triggerFlow('trigger.engine_started_v2', {}, this);

        } else if (key === 'distance' && !this.carAtHome() && this.lastTriggerLocation === 'home') {

          this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
          this.lastTriggerLocation = 'away';
          this.getDriver().triggerFlow('trigger.car_left_home_v2', {}, this);

        } else if (key === 'distance' && this.carAtHome() && this.lastTriggerLocation === 'away') {

          this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
          this.lastTriggerLocation = 'home';
          this.getDriver().triggerFlow('trigger.car_came_home_v2', {}, this);
        } else if (key === 'charge_cable_status') {
          let tokens = {
            charge_cable_status: this.car.status.connectionStatus || 'n/a'
          }
          this.getDriver().triggerFlow('trigger.charge_cable_status_changed', tokens, this);
        }

    } else {
      //Update value to show we are doing it in app
      //this.log(`[${this.getName()}] (NoDiff) Updating capability '${key}' from '${oldValue}' to '${value}'`);
      this.setCapabilityValue(key, value);
    }
  }

  onDeleted() {
    this.log(`Deleting VOC car '${this.getName()}' from Homey.`);
    this._deleteTimers();
    this.car = null;

    Homey.ManagerSettings.unset(`${this.getData().id}.username`);
    Homey.ManagerSettings.unset(`${this.getData().id}.password`);
  }

  onRenamed (name) {
    this.log(`Renaming car from '${this.car.name}' to '${name}'`)
    this.car.name = name;
  }

	async onSettings(oldSettings, newSettings, changedKeysArr) {
    let change = false;
		if (changedKeysArr.indexOf("refresh_position") > -1) {
			this.log('Refresh position value was change to:', newSettings.refresh_position);
      this.refresh_position = newSettings.refresh_position;
      change = true;
		}
    if (changedKeysArr.indexOf("refresh_status") > -1) {
			this.log('Refresh status value was change to:', newSettings.refresh_status);
      this.refresh_status = newSettings.refresh_status;
      change = true;
		}
    if (changedKeysArr.indexOf("proximity_home") > -1) {
			this.log('Proximity home value was change to:', newSettings.proximity_home);
      this.proximity_home = newSettings.proximity_home;
		}

    if (change) {
      //We also need to re-initialize the timer
      this._reinitializeTimers();
    }

	}

  formatDistance (distance) {
    if (distance < 1000) return this.formatValue(distance) + ' m'
    return this.formatValue(distance / 1000) + ' km'
  }
  formatValue (t) {
    return Math.round(t.toFixed(1) * 10) / 10
  }

  isError(err) {
    return (err && err.stack && err.message);
  }

}

module.exports = VOCDevice;
