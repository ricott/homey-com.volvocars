'use strict';

const Homey = require('homey');
const VOC = require('../../lib/voc.js');
const Osm = require('../../lib/maps.js');

class voc_ice extends Homey.Device {

  onInit() {
    this.log('VOC ICE initiated', this.getName());

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

    this.car.vocApi = new VOC({
      username: Homey.ManagerSettings.get(`${this.getData().id}.username`),
		  password: Homey.ManagerSettings.get(`${this.getData().id}.password`),
		  region: Homey.ManagerSettings.get('region')
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
      if (response.result &&
            response.action !== 'blinkLights' &&
            response.action !== 'honkHorn' &&
            response.action !== 'honkHornAndBlinkLights') {
        //We successfully invoked and action, lets refresh status so it shows that
        this.car.vocApi.refreshVehicleStatus(this.car.vin);
      }
    });

    //refreshVehicleStatus
    this.car.vocApi.on('car_status_update', vehicle => {
      this.log('Refreshing status from VOC');
      this.car.status = vehicle;

      //Update capabilities of cloud device
      this._updateProperty('range', vehicle.distanceToEmpty);
      this._updateProperty('locked', vehicle.carLocked);

      if (vehicle.engineRunning || vehicle.ERS.status !== 'off') {
        this._updateProperty('engine', true);
      } else {
        this._updateProperty('engine', false);
      }

      let heaterStatus = 'Off';
      if (vehicle.heater.status!=='off' ||
          (vehicle.remoteClimatizationStatus !== null && vehicle.remoteClimatizationStatus !== 'off')) {
        heaterStatus = 'On';
      }
      this._updateProperty('heater', heaterStatus);

      if (this.car.phev && vehicle.hvBattery) {
        this._updateProperty('measure_battery', vehicle.hvBattery.hvBatteryLevel);
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
                        subscriptionEndDate: subscrEndDate})
        .catch(err => {
          this.error('Failed to update settings', err);
        });
    });

    this.car.vocApi.on('voc_api_error', error => {
      this.error('Houston we have a problem', error);

    });

  }

  startHeater() {
    if (this.car.attributes.remoteHeaterSupported) {
      this.log('Heater supported, using heater/start');
      this.car.vocApi.startHeater(this.car.vin);

    } else if (this.car.attributes.preclimatizationSupported) {
      this.log('Pre climatization supported, using preclimatization/start');

      this.car.vocApi.startPreClimatization(this.car.vin);

    } else {
      this.log('No heater or preclimatization support.');
      //TOOD device.setWarning();
    }
  }

  stopHeater() {
    if (this.car.attributes.remoteHeaterSupported) {
      this.log('heater/stop');
      this.car.vocApi.stopHeater(this.car.vin);

    } else if (this.car.attributes.preclimatizationSupported) {
      this.log('preclimatization/stop');

      this.car.vocApi.stopPreClimatization(this.car.vin);

    } else {
      this.log('No heater or preclimatization support.');
    }
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

  lock() {
    this.car.vocApi.lock(this.car.vin);
  }
  unlock() {
    this.car.vocApi.unlock(this.car.vin);
  }
  startEngine(duration) {
    this.car.vocApi.startEngine(this.car.vin, duration);
  }
  stopEngine() {
    this.car.vocApi.stopEngine(this.car.vin);
  }
  blinkLights() {
    this.car.vocApi.blinkLights(this.car.vin,
                                  this.car.position.latitude,
                                  this.car.position.longitude);
  }
  honkHorn() {
    this.car.vocApi.honkHorn(this.car.vin,
                                  this.car.position.latitude,
                                  this.car.position.longitude);
  }
  honkHornAndBlinkLights() {
    this.car.vocApi.honkHornAndBlinkLights(this.car.vin,
                                  this.car.position.latitude,
                                  this.car.position.longitude);
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

        if (key == 'heater' && value === 'On') {
          this.getDriver().triggerFlow('trigger.heater_started_v2', {}, this);

        } else if (key == 'engine' && value) {
          this.getDriver().triggerFlow('trigger.engine_started_v2', {}, this);

        } else if (key == 'distance' && !this.carAtHome() &&
                        this.lastTriggerLocation === 'home') {

          this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
          this.lastTriggerLocation = 'away';
          this.getDriver().triggerFlow('trigger.car_left_home_v2', {}, this);

        } else if (key == 'distance' && this.carAtHome() &&
                        this.lastTriggerLocation === 'away') {

          this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
          this.lastTriggerLocation = 'home';
          this.getDriver().triggerFlow('trigger.car_came_home_v2', {}, this);
        }

    } else {
      //Update value to show we are doing it in app
      //this.log(`[${this.getName()}] (NoDiff) Updating capability '${key}' from '${oldValue}' to '${value}'`);
      this.setCapabilityValue(key, value);
    }
  }

  onDeleted() {
    this.log(`Deleting VOC ICE '${this.getName()}' from Homey.`);
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

}

module.exports = voc_ice;
