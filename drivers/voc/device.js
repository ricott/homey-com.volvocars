'use strict';
const Homey = require('homey');
const VOC = require('../../lib/voc.js');
const Osm = require('../../lib/maps.js');
//Encryption settings
const crypto = require('crypto');
const crypto_algorithm = 'aes-256-ctr';

class VOCDevice extends Homey.Device {

    async onInit() {
        this.log('VOC car initiated', this.getName());

        this.homeyActions = {};
        this.pollIntervals = [];
        this.refresh_position = this.getSetting('refresh_position') || 5;
        this.refresh_status_car = this.getSetting('refresh_status_car') || 120;
        this.refresh_status_cloud = this.getSetting('refresh_status_cloud') || 5;
        this.proximity_home = this.getSetting('proximity_home') || 50;
        this.lastTriggerLocation = 'unknown';

        this.car = {
            status: null,
            position: null,
            location: null,
            distanceFromHome: 0,
            vocApi: null,
            chargeLocations: []
        };

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.log(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        //Check if settings are encrypted, if not encrypt them
        //Triggered on all existing devices
        let userJson = this.homey.settings.get(`${this.getData().id}.username`);
        if (!userJson.iv) {
            //Data is not encrypted, lets
            this.storeCredentialsEncrypted(userJson, this.homey.settings.get(`${this.getData().id}.password`));
        }

        //Clear last error on app restart
        this.setSettings({ voc_last_error: '' })
            .catch(err => {
                this.error('Failed to update settings', err);
            });

        this.car.vocApi = new VOC({
            username: this.getUsername(),
            password: this.getPassword(),
            region: this.homey.settings.get('region'),
            uuid: this.driver.deviceUUID
        });

        //Initialize static attributes
        this._initializeEventListeners();
        this.initializeVehicleAttributes();
        this.getVehicleStatusFromCloud();
        this.refreshVehiclePosition();
        await this.registerFlowTokens();

        this._initilializeTimers();
    }

    getVehicleAttributeValue(objectPath) {
        const attributes = this.getStoreValue('attributes') || {};
        return getJSONValueSafely(objectPath, attributes);
    }

    async registerFlowTokens() {
        this.log('Creating flow tokens');
        this.vocStatusFlowToken = await this.homey.flow.createToken(`${this.getData().id}.statusToken`,
            {
                type: 'string',
                title: `${this.getName()} VOC Status`
            });
    }

    unregisterFlowTokens() {
        this.log('Deleting flow tokens');
        this.homey.flow.unregisterToken(this.vocStatusFlowToken);
    }

    _initilializeTimers() {
        this.log('Adding timers');
        // Request car to push update to cloud
        this.pollIntervals.push(setInterval(() => {
            this.refreshVehicleStatusFromCar();
        }, 60 * 1000 * this.refresh_status_car));

        //Get updates from cloud
        this.pollIntervals.push(setInterval(() => {
            this.getVehicleStatusFromCloud();
        }, 60 * 1000 * this.refresh_status_cloud));

        //Get position update from cloud
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
                this.getVehicleStatusFromCloud();
            }
        });

        this.car.vocApi.on('car_action_status', response => {
            if (typeof response.result === "boolean") {
                this.log(`Action '${response.action}' with result '${response.result}'`);
            } else {
                this.log(`Action '${response.action}' with result:`);
                this.log(response.result);
            }

            if (response.action !== 'blinkLights' && response.action !== 'honkHorn' &&
                response.action !== 'honkHornAndBlinkLights') {
                //We successfully invoked and action, lets refresh status so it shows that
                this.refreshVehicleStatusFromCar();
            }
        });

        this.car.vocApi.on('car_status_update', vehicle => {
            //Somehow we get invalid json at times, lets skip those events
            if (vehicle && vehicle.distanceToEmpty && vehicle.carLocked) {
                this.log('Refreshing status from VOC');
                this.car.status = vehicle;
                this.setSettings({ voc_status: JSON.stringify(vehicle, null, "  ") })
                    .catch(err => {
                        this.error('Failed to update settings', err);
                    });

                //Make VOC status available in any flow
                try {
                    this.vocStatusFlowToken.setValue(JSON.stringify(vehicle));
                } catch (error) {
                    this.error('Failed to set the status flow token', error);
                }

                this._updateProperty('range', vehicle.distanceToEmpty);
                this._updateProperty('locked', vehicle.carLocked);

                let engineRunning = false;
                //Either engine is running or ERS is running
                if (vehicle.engineRunning) {
                    engineRunning = true;
                } else if (this.getVehicleAttributeValue(['engineStartSupported'])) {
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
                if (vehicle.hvBattery) {
                    this._updateProperty('measure_battery', vehicle.hvBattery.hvBatteryLevel);

                    //Connection status means charge cable status
                    let chargeCableStatus = this.homey.__('device.chargeCableStatus_disabled');
                    if (vehicle.connectionStatus) {
                        if (vehicle.connectionStatus === 'Disconnected') {
                            chargeCableStatus = this.homey.__('device.chargeCableStatus_disconnected');
                        } else if (vehicle.connectionStatus === 'ConnectedWithoutPower') {
                            chargeCableStatus = this.homey.__('device.chargeCableStatus_ConnectedNoPower');
                        } else if (vehicle.connectionStatus === 'ConnectedWithPower') {
                            chargeCableStatus = this.homey.__('device.chargeCableStatus_ConnectedWithPower');
                        } else {
                            chargeCableStatus = vehicle.connectionStatus;
                        }
                    }
                    this._updateProperty('charge_cable_status', chargeCableStatus);
                } else {
                    this.log('ICE car, no cable or hw battery');
                }
            }
        });

        //refreshVehiclePosition
        this.car.vocApi.on('car_position_update', position => {

            //Somehow we get invalid json at times, lets skip those events
            if (position && position.latitude && position.longitude && position.timestamp) {
                if (!this.car.position ||
                    (Date.parse(position.timestamp) > Date.parse(this.car.position.timestamp) &&
                        this.car.position.latitude.toFixed(5) != position.latitude.toFixed(5) &&
                        this.car.position.longitude.toFixed(5) != position.longitude.toFixed(5))) {

                    this.log('We got new position data');
                    this.car.position = position;
                    this.setSettings({ voc_position: JSON.stringify(this.car.position, null, "  ") })
                        .catch(err => {
                            this.error('Failed to update settings', err);
                        });

                    let distanceHomey = Osm.calculateDistance(position.latitude,
                        position.longitude,
                        this.homey.geolocation.getLatitude(),
                        this.homey.geolocation.getLongitude()) || 0;
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

                    Osm.geocodeLatLng(position.latitude, position.longitude).then((osm_location) => {
                        this.car.location = osm_location;
                        this._updateProperty('location_human', `${osm_location.address}, ${osm_location.city}`);
                    });
                }
            }
        });

        //initializeVehicleAttributes
        this.car.vocApi.on('car_attributes_update', attributes => {
            this.log('Refreshing vehicle attributes');
            const phev = attributes.highVoltageBatterySupported;

            if (!phev && this.hasCapability('measure_battery')) {
                this.log(`ICE car, removing capabilities; 'measure_battery', 'charge_cable_status'`);
                this.removeCapability('measure_battery');
                this.removeCapability('charge_cable_status');
            }

            //Store a copy of the json
            this.setStoreValue('attributes', attributes);

            let subscrEndDate = new Date(attributes.subscriptionEndDate)
                .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

            //Update Homey settings in advanced tab
            this.setSettings({
                license_plate: attributes.registrationNumber,
                model: `${attributes.vehicleType}, ${attributes.modelYear}`,
                fuelType: `${attributes.fuelType}, ${attributes.fuelTankVolume}l`,
                subscriptionEndDate: subscrEndDate,
                voc_attributes: JSON.stringify(attributes, null, "  "),
                isPHEV: String(phev)
            })
                .catch(err => {
                    this.error('Failed to update settings', err);
                });

            if (phev) {
                //We have a phev, lets get charge locations
                this.log(`PHEV, fetching charging locations`);
                this.getVehicleChargeLocations();
            }
        });

        this.car.vocApi.on('car_charge_locations', locations => {
            let chargeLocations = [];
            if (locations != null && locations.length > 0) {
                locations.forEach(location => {
                    let locationName = '';
                    if (!location.name) {
                        //No name for location
                        locationName = `${location.position.streetAddress}, ${location.position.postalCode} ${location.position.city}`
                    } else {
                        locationName = `${location.name}, ${location.position.streetAddress}`
                    }

                    chargeLocations.push({
                        id: location.chargeLocation.substring(location.chargeLocation.lastIndexOf('/') + 1),
                        name: locationName
                    });
                });
            }
            this.car.chargeLocations = chargeLocations;
        });

        this.car.vocApi.on('voc_api_error', error => {
            this.error('Houston we have a problem', error);

            let message = '';
            if (this.isError(error)) {
                message = error.stack;
            } else {
                try {
                    message = JSON.stringify(error, null, "  ");
                } catch (e) {
                    this.log('Failed to stringify object', e);
                    message = error.toString();
                }
            }

            let dateTime = new Date().toISOString();
            this.setSettings({ voc_last_error: dateTime + '\n' + message })
                .catch(err => {
                    this.error('Failed to update voc_api_error settings', err);
                });
        });

    }

    initializeVehicleAttributes() {
        this.car.vocApi.getVehicleAttributes(this.getData().id);
    }
    refreshVehicleStatusFromCar() {
        this.car.vocApi.refreshVehicleStatusFromCar(this.getData().id);
    }
    getVehicleStatusFromCloud() {
        this.car.vocApi.getVehicleStatusFromCloud(this.getData().id);
    }
    refreshVehiclePosition() {
        this.car.vocApi.getVehiclePosition(this.getData().id);
    }
    getVehicleChargeLocations() {
        this.car.vocApi.getVehicleChargeLocations(this.getData().id);
    }
    startHeater() {
        if (this.getVehicleAttributeValue(['remoteHeaterSupported'])) {
            this.log('Heater supported, using heater/start');
            return this.car.vocApi.startHeater(this.getData().id);

        } else if (this.getVehicleAttributeValue(['preclimatizationSupported'])) {
            this.log('Pre climatization supported, using preclimatization/start');
            return this.car.vocApi.startPreClimatization(this.getData().id);

        } else {
            this.log('No heater or preclimatization support.');
            return false;
        }
    }
    stopHeater() {
        if (this.getVehicleAttributeValue(['remoteHeaterSupported'])) {
            this.log('heater/stop');
            return this.car.vocApi.stopHeater(this.getData().id);

        } else if (this.getVehicleAttributeValue(['preclimatizationSupported'])) {
            this.log('preclimatization/stop');
            return this.car.vocApi.stopPreClimatization(this.getData().id);

        } else {
            this.log('No heater or preclimatization support.');
            return false;
        }
    }
    lock() {
        if (this.getVehicleAttributeValue(['lockSupported'])) {
            return this.car.vocApi.lock(this.getData().id);
        } else {
            this.log('Lock not supported!');
            return false;
        }
    }
    unlock() {
        if (this.getVehicleAttributeValue(['unlockSupported'])) {
            return this.car.vocApi.unlock(this.getData().id);
        } else {
            this.log('Unlock not supported!');
            return false;
        }
    }
    startEngine(duration) {
        if (this.getVehicleAttributeValue(['engineStartSupported'])) {
            return this.car.vocApi.startEngine(this.getData().id, duration);
        } else {
            this.log('Engine Remote Start (ERS) not supported!');
            return false;
        }
    }
    stopEngine() {
        if (this.getVehicleAttributeValue(['engineStartSupported'])) {
            return this.car.vocApi.stopEngine(this.getData().id);
        } else {
            this.log('Engine Remote Start (ERS) not supported!');
            return false;
        }
    }
    blinkLights() {
        if (this.getVehicleAttributeValue(['honkAndBlinkSupported'])) {
            return this.car.vocApi.blinkLights(this.getData().id,
                this.car.position.latitude,
                this.car.position.longitude);
        } else {
            this.log('Honk and blink not supported!');
            return false;
        }
    }
    honkHorn() {
        if (this.getVehicleAttributeValue(['honkAndBlinkSupported'])) {
            return this.car.vocApi.honkHorn(this.getData().id,
                this.car.position.latitude,
                this.car.position.longitude);
        } else {
            this.log('Honk and blink not supported!');
            return false;
        }
    }
    honkHornAndBlinkLights() {
        if (this.getVehicleAttributeValue(['honkAndBlinkSupported'])) {
            return this.car.vocApi.honkHornAndBlinkLights(this.getData().id,
                this.car.position.latitude,
                this.car.position.longitude);
        } else {
            this.log('Honk and blink not supported!');
            return false;
        }
    }
    startCharging() {
        if (this.getSetting('isPHEV') == 'true') {
            return this.car.vocApi.startCharging(this.getData().id);
        } else {
            this.log('Start charging not supported on ICE vehicles!');
            return false;
        }
    }
    delayCharging(chargeLocationId, delayedCharging, startTime, endTime) {
        if (this.getSetting('isPHEV') == 'true') {
            let json = `{"status": "Accepted", "delayCharging":{"enabled":${delayedCharging},"startTime":"${startTime}","stopTime":"${endTime}"}}`;
            let jsonObj = JSON.parse(json);
            return this.car.vocApi.delayCharging(this.getData().id, chargeLocationId, jsonObj);
        } else {
            this.log('Delay charging not supported on ICE vehicles!');
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

    isAnyDoorOpen() {
        if (this.car.status.doors) {
            if (this.car.status.doors.tailgateOpen ||
                this.car.status.doors.hoodOpen ||
                this.car.status.doors.rearRightDoorOpen ||
                this.car.status.doors.rearLeftDoorOpen ||
                this.car.status.doors.frontRightDoorOpen ||
                this.car.status.doors.frontLeftDoorOpen) {
                return true;
            } else {
                return false;
            }
        } else {
            //Doors object should never be null
            return false;
        }
    }

    isDoorOpen(doorName) {
        if (this.car.status.doors) {
            if (this.car.status.doors[doorName]) {
                return true;
            } else {
                return false;
            }
        } else {
            //Doors object should never be null
            return false;
        }
    }

    _updateProperty(key, value) {
        //Check if device has the capability
        if (!this.hasCapability(key)) {
            return;
        }

        let oldValue = this.getCapabilityValue(key);
        //If oldValue===null then it is a newly added device, lets not trigger flows on that
        if (oldValue !== null && oldValue != value) {
            this.log(`[${this.getName()}] Updating capability '${key}' from '${oldValue}' to '${value}'`);
            this.setCapabilityValue(key, value);

            if (key === 'heater') {
                if (value === 'On') {
                    this.driver.triggerDeviceFlow('heater_started', {}, this);
                } else {
                    this.driver.triggerDeviceFlow('heater_stopped', {}, this);
                }

            } else if (key === 'engine') {
                if (value) {
                    this.driver.triggerDeviceFlow('engine_started', {}, this);
                } else {
                    let tokens = {
                        average_fuel_consumption: this.car.status.averageFuelConsumption || 'n/a'
                    }
                    this.driver.triggerDeviceFlow('engine_stopped', tokens, this);
                }

            } else if (key === 'distance' && !this.carAtHome() && this.lastTriggerLocation === 'home') {

                this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
                this.lastTriggerLocation = 'away';
                this.driver.triggerDeviceFlow('car_left_home', {}, this);

            } else if (key === 'distance' && this.carAtHome() && this.lastTriggerLocation === 'away') {

                this.log(`'${key}' changed. At home: '${this.carAtHome()}'. Last trigger location: '${this.lastTriggerLocation}'`);
                this.lastTriggerLocation = 'home';
                this.driver.triggerDeviceFlow('car_came_home', {}, this);
                /*      } else if (key === 'charge_cable_status') {
                        let tokens = {
                          //charge_cable_status: this.car.status.connectionStatus || 'n/a'
                          charge_cable_status: value
                        }
                        this.driver.triggerDeviceFlow('charge_cable_status_changed', tokens, this);
                */
            } else if (key === 'location_human') {
                let tokens = {
                    car_location_address: this.car.location.address || '',
                    car_location_city: this.car.location.city || '',
                    car_location_postcode: this.car.location.postcode || '',
                    car_location_county: this.car.location.county || '',
                    car_location_country: this.car.location.country || ''
                }
                this.driver.triggerDeviceFlow('location_human_changed', tokens, this);
            } else if (key === 'range') {
                let tokens = {
                    fuel_range: value
                }
                this.driver.triggerDeviceFlow('fuel_range_changed', tokens, this);
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
        this.unregisterFlowTokens();

        this.homey.settings.unset(`${this.getData().id}.username`);
        this.homey.settings.unset(`${this.getData().id}.password`);
        this.car = null;
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        let change = false;
        if (changedKeys.indexOf("refresh_position") > -1) {
            this.log('Refresh position value was change to:', newSettings.refresh_position);
            this.refresh_position = newSettings.refresh_position;
            change = true;
        }
        if (changedKeys.indexOf("refresh_status_car") > -1) {
            this.log('Refresh status car value was change to:', newSettings.refresh_status_car);
            this.refresh_status_car = newSettings.refresh_status_car;
            change = true;
        }
        if (changedKeys.indexOf("refresh_status_cloud") > -1) {
            this.log('Refresh status cloud value was change to:', newSettings.refresh_status_cloud);
            this.refresh_status_cloud = newSettings.refresh_status_cloud;
            change = true;
        }
        if (changedKeys.indexOf("proximity_home") > -1) {
            this.log('Proximity home value was change to:', newSettings.proximity_home);
            this.proximity_home = newSettings.proximity_home;
        }

        if (change) {
            //We also need to re-initialize the timer
            this._reinitializeTimers();
        }
    }

    formatDistance(distance) {
        if (distance < 1000) return this.formatValue(distance) + ' m'
        return this.formatValue(distance / 1000) + ' km'
    }
    formatValue(t) {
        return Math.round(t.toFixed(1) * 10) / 10
    }

    isError(err) {
        return (err && err.stack && err.message);
    }

    storeCredentialsEncrypted(plainUser, plainPassword) {
        this.log(`Encrypting credentials for user '${plainUser}'`);
        this.homey.settings.set(`${this.getData().id}.username`, this.encryptText(plainUser));
        this.homey.settings.set(`${this.getData().id}.password`, this.encryptText(plainPassword));

        //Remove unencrypted credentials passed from driver
        this.unsetStoreValue('username');
        this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.username`));
    }

    getPassword() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.password`));
    }

    encryptText(plainText) {
        //Failsafe if encryption key is not found
        if (!Homey.env.ENCRYPTION_KEY || Homey.env.ENCRYPTION_KEY === "") {
            this.log(`Encryption key not found!!`);
            return plainText;
        }

        let iv = crypto.randomBytes(16);
        let cipher = crypto.createCipheriv(crypto_algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(plainText);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    }

    decryptText(encryptedJson) {
        if (!encryptedJson.iv) {
            return encryptedJson;
        }

        let iv = Buffer.from(encryptedJson.iv, 'hex');
        let encryptedText = Buffer.from(encryptedJson.encryptedData, 'hex');
        let decipher = crypto.createDecipheriv(crypto_algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

}

const getJSONValueSafely = (p, o) => p.reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, o);

module.exports = VOCDevice;
