'use strict';
const Homey = require('homey');
const ConnectedVehicle = require('../../lib/cVehicle.js');
const TokenManager = require('../../lib/tokenManager');
const config = require('../../lib/const.js');
const Osm = require('../../lib/maps.js');
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';

const _AVAILABLE_COMMANDS_KEY = 'availableCommands';
const _TOKEN_KEY = 'token';
const _LOCATION_DATA = 'location';
const _LOCATION_ADDRESS = 'locationAddress';
const _LAST_TRIGGER_LOCATION = 'lastTriggerLocation';
const _RAW_DISTANCE_HOMEY = 'rawDistanceHomey';
const _DOOR_STATE = 'doorState';

class ConnectedVehicleDevice extends Homey.Device {

    async onInit() {
        this.logMessage('Connected Vehicle device initiated');
        this.pollIntervals = [];
        this.tokenManager = TokenManager;
        this._usernameSettingsKey = `cv.${this.getData().id}.username`;
        this._passwordSettingsKey = `cv.${this.getData().id}.password`;

        if (!this.homey.settings.get(this._usernameSettingsKey)) {
            // This is a newly added device, lets copy login details to homey settings
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        // Force renewal of token, if a user restarts the app a new token should be generated
        const token = await this.tokenManager.getToken(
            Homey.env.VCC_LOGIN_TOKEN,
            this.getUsername(),
            this.getPassword(),
            true
        );
        this.setToken(token);

        await this.setupCapabilityListeners();
        // Load static vehicle info
        await this.updateVehicleSettings();
        // Make sure the device has the right capabilities
        await this.setupCapabilities();
        // Get the list of commands available for this vehicle
        await this.updateAvailableCommands();
        // Refresh values immediately
        await this.refreshInformation();
        await this.refreshLocation();
        // Start all times that refreshes data
        this._initilializeTimers(
            this.getSetting('refresh_status_cloud'),
            this.getSetting('refresh_position')
        );
    }

    _initilializeTimers(refreshStatusCloud, refreshPosition) {
        this.logMessage(`Creating timers (${refreshStatusCloud}/${refreshPosition})`);

        this.pollIntervals.push(this.homey.setInterval(() => {
            this.refreshInformation();
        }, 60 * 1000 * Number(refreshStatusCloud)));

        this.pollIntervals.push(this.homey.setInterval(() => {
            this.refreshLocation();
        }, 60 * 1000 * Number(refreshPosition)));

        // Refresh access token, each 1 mins from tokenManager
        this.pollIntervals.push(this.homey.setInterval(() => {
            this.refreshAccessToken();
        }, 60 * 1000 * 1));
    }

    _deleteTimers() {
        // Kill interval object(s)
        this.log('Removing timers');
        this.pollIntervals.forEach(timer => {
            this.homey.clearInterval(timer);
        });
    }

    _reinitializeTimers(refreshStatusCloud, refreshPosition) {
        this._deleteTimers();
        this._initilializeTimers(refreshStatusCloud, refreshPosition);
    }

    async setupCapabilityListeners() {
        this.registerCapabilityListener('locked', async (lock) => {
            try {
                if (lock) {
                    await this.createVolvoClient().lock(this.getData().id);
                } else {
                    await this.createVolvoClient().unlock(this.getData().id);
                }
            } catch (error) {
                this.error(error);
                return Promise.reject(error);
            }
        });
    }

    async setupCapabilities() {
        this.logMessage('Setting up capabilities');
        const settings = this.getSettings();
        const type = settings.vehicleType;

        if (type == config.vehicleType.ICE) {
            this.logMessage(`ICE car, removing capabilities; 'measure_battery', 'range_battery', 'charge_cable_status'`);
            await this.removeCapabilityHelper('measure_battery');
            await this.removeCapabilityHelper('range_battery');
            await this.removeCapabilityHelper('charge_cable_status');

        } else if (type == config.vehicleType.ELECTRIC) {
            this.logMessage(`ELECTRIC car, removing capabilities; 'range'`);
            await this.removeCapabilityHelper('range');
        }

        await this.setupSensors();
    }

    async setupSensors(settings = this.getSettings()) {
        if (settings.odometerSensor === true) {
            await this.addCapabilityHelper('odometer');
        } else {
            await this.removeCapabilityHelper('odometer');
        }

        const warningSensors = [
            settings.tireWarningsSensor,
            settings.lightWarningsSensor,
            settings.serviceWarningsSensor,
            settings.engineWarningsSensor,
            settings.brakeWarningsSensor
        ].some(setting => setting === true);
        if (warningSensors === true) {
            await this.addCapabilityHelper('warnings_text');
            await this.addCapabilityHelper('alarm_warnings');
        } else {
            await this.removeCapabilityHelper('warnings_text');
            await this.removeCapabilityHelper('alarm_warnings');
        }
    }

    getAvailableCommands() {
        return this.getStoreValue(_AVAILABLE_COMMANDS_KEY);
    }

    isCommandAvailable(command) {
        const availableCommands = this.getStoreValue(_AVAILABLE_COMMANDS_KEY);
        const available = availableCommands.find(comm => comm.id == command);
        if (available) {
            return true;
        } else {
            return false;
        }
    }

    async updateAvailableCommands() {
        this.logMessage('Fetching available commands');
        const client = this.createVolvoClient();
        await client.listAvailableCommands(this.getData().id)
            .then(async (commands) => {
                const commandsArray = commands.data.map(async (command) => {
                    return {
                        id: command.command,
                        name: command.command
                    };
                });

                let availComm = await Promise.all(commandsArray);

                // Remove engine start and stop - the oauth scope is not allowed
                availComm = availComm.filter(comm => comm.name != config.commands.ENGINE_START &&
                    comm.name != config.commands.ENGINE_STOP);

                availComm.sort(function (a, b) {
                    if (a.name > b.name) {
                        return 1;
                    }
                    if (a.name < b.name) {
                        return -1;
                    }

                    // names must be equal
                    return 0;
                });

                await this.setStoreValue(_AVAILABLE_COMMANDS_KEY, availComm)
                    .catch(reason => {
                        this.error(reason);
                    });
            })
            .catch(reason => {
                this.error(`Failed to listAvailableCommands`, reason);
            });
    }

    async updateVehicleSettings() {

        const client = this.createVolvoClient();
        await client.getVehicleInfo(this.getData().id)
            .then(async (vehicleInfo) => {
                let vehicleType = config.vehicleType.ICE;
                if (vehicleInfo.data.fuelType == 'PETROL/ELECTRIC') {
                    vehicleType = config.vehicleType.HYBRID;
                } else if (vehicleInfo.data.fuelType == 'ELECTRIC') {
                    vehicleType = config.vehicleType.ELECTRIC;
                }

                await this.setSettings({
                    model: `${vehicleInfo.data.descriptions.model} / ${vehicleInfo.data.modelYear}`,
                    fuelType: vehicleInfo.data.fuelType,
                    vehicleType: vehicleType
                })
                    .catch(err => {
                        this.error(`Failed to update settings`, err);
                    });
            })
            .catch(reason => {
                this.error(`Failed to getVehicleInfo`, reason);
            });
    }

    async refreshLocation() {
        const client = this.createVolvoClient();
        const oldCoordinatesArray = this.getStoreValue(_LOCATION_DATA);
        let oldLongitude = 0, oldLatitude = 0;
        if (Array.isArray(oldCoordinatesArray) && oldCoordinatesArray.length >= 2) {
            oldLongitude = oldCoordinatesArray[0];
            oldLatitude = oldCoordinatesArray[1];
        }

        await client.getVehicleLocation(this.getData().id)
            .then(async (locationResponse) => {
                const newCoordinatesArray = locationResponse?.data?.geometry?.coordinates;
                if (Array.isArray(newCoordinatesArray) && newCoordinatesArray.length >= 2) {
                    const newLongitude = newCoordinatesArray[0] || 0;
                    const newLatitude = newCoordinatesArray[1] || 0;

                    if (oldLatitude.toFixed(5) != newLatitude.toFixed(5) &&
                        oldLongitude.toFixed(5) != newLongitude.toFixed(5)) {
                        this.logMessage('We got new location data');
                        await this.setStoreValue(_LOCATION_DATA, newCoordinatesArray)
                            .catch(reason => {
                                this.error(reason);
                            });

                        this._updateProperty('location_longitude', newLongitude)
                        this._updateProperty('location_latitude', newLatitude)

                        let distanceHomey = Osm.calculateDistance(
                            newLatitude,
                            newLongitude,
                            this.homey.geolocation.getLatitude(),
                            this.homey.geolocation.getLongitude()
                        ) || 0;

                        await this.setStoreValue(_RAW_DISTANCE_HOMEY, distanceHomey)
                            .catch(reason => {
                                this.error(reason);
                            });

                        distanceHomey = this.formatDistance(distanceHomey < 1 ? 0 : distanceHomey);
                        this._updateProperty('distance', distanceHomey);

                        const osm_location = await Osm.geocodeLatLng(newLatitude, newLongitude)
                            .catch(reason => {
                                this.error(reason);
                            });

                        this._updateProperty('location_human', `${osm_location.address}, ${osm_location.city}`);
                        await this.setStoreValue(_LOCATION_ADDRESS, osm_location)
                            .catch(reason => {
                                this.error(reason);
                            });
                    }

                    // Update the location timestamp even if location is the same
                    await this.updateTimestampSetting('locationTimestamp', locationResponse?.data?.properties?.timestamp);
                }
            })
            .catch(reason => {
                this.error(`Failed to getVehicleLocation`, reason);
            });
    }

    async refreshInformation() {
        const client = this.createVolvoClient();
        const settings = this.getSettings();
        const type = settings.vehicleType;

        await client.getVehicleStatistics(this.getData().id)
            .then(async (vehicleStats) => {
                if (type == config.vehicleType.HYBRID || type == config.vehicleType.ELECTRIC) {
                    // Hybrid or electric, get battery info
                    await client.getBatteryChargeLevel(this.getData().id)
                        .then(async (response) => {
                            this._updateProperty('measure_battery', response.chargeLevel || 0);
                            await this.updateTimestampSetting('batteryTimestamp', response.timestamp);

                            this._updateProperty('range_battery', vehicleStats?.data?.distanceToEmptyBattery?.value || 0);
                            await this.updateTimestampSetting('rangeBatteryTimestamp', vehicleStats?.data?.distanceToEmptyBattery?.timestamp);
                        })
                        .catch(reason => {
                            this.error(`Failed to getBatteryChargeLevel`, reason);
                        });

                    await client.getChargingSystemStatus(this.getData().id)
                        .then(async (chargingSystemState) => {
                            const chargingSystemStatus = String(chargingSystemState?.data?.chargingSystemStatus?.value || '').replace('CHARGING_SYSTEM_', '');
                            this._updateProperty('charging_system_status', chargingSystemStatus);
                            await this.updateTimestampSetting('chargingSystemTimestamp', chargingSystemState?.data?.chargingSystemStatus?.timestamp);
                        })
                        .catch(reason => {
                            this.error(`Failed to getChargingSystemStatus`, reason);
                        });
                }

                if (type == config.vehicleType.HYBRID || type == config.vehicleType.ICE) {
                    this._updateProperty('range', vehicleStats?.data?.distanceToEmptyTank?.value || 0);
                    await this.updateTimestampSetting('rangeFuelTimestamp', vehicleStats?.data?.distanceToEmptyTank?.timestamp);
                }
            })
            .catch(reason => {
                this.error(`Failed to getVehicleLocation`, reason);
            });

        await client.getDoorState(this.getData().id)
            .then(async (doorState) => {
                this._updateProperty('locked', doorState?.data?.centralLock?.value == 'LOCKED');

                await this.setStoreValue(_DOOR_STATE, doorState)
                    .catch(reason => {
                        this.error(reason);
                    });

                await this.updateTimestampSetting('lockTimestamp', doorState?.data?.centralLock?.timestamp);
            })
            .catch(reason => {
                this.error(`Failed to getDoorState`, reason);
            });

        await client.getEngineState(this.getData().id)
            .then(async (engineState) => {
                this._updateProperty('engine', engineState?.data?.engineStatus?.value == 'RUNNING');
                await this.updateTimestampSetting('engineTimestamp', engineState?.data?.engineStatus?.timestamp);
            })
            .catch(reason => {
                this.error(`Failed to getEngineState`, reason);
            });

        if(settings.odometerSensor === true){
            await client.getOdometerState(this.getData().id)
                .then(async (odometerState) => {
                    this._updateProperty('odometer', odometerState?.data?.odometer?.value)
                    await this.updateTimestampSetting('odometerTimestamp', odometerState?.data?.odometer?.timestamp);
                })
                .catch(reason => {
                    this.error(`Failed to getOdometerState`, reason);
                });
        }

        const warningPromises = [];
        if (settings.lightWarningsSensor === true) {
            warningPromises.push(client.getVehicleWarnings(this.getData().id));
        }
        if (settings.tireWarningsSensor === true) {
            warningPromises.push(client.getTyreState(this.getData().id));
        }
        if (settings.serviceWarningsSensor === true) {
            warningPromises.push(client.getVehicleDiagnostic(this.getData().id));
        }
        if (settings.engineWarningsSensor === true) {
            warningPromises.push(client.getEngineDiagnostic(this.getData().id));
        }
        if (settings.brakeWarningsSensor === true) {
            warningPromises.push(client.getBrakeDiagnostic(this.getData().id));
        }
        if(warningPromises.length > 1){
            await Promise.all(warningPromises)
            .then(async (data) => {
                let alarm = false;
                const mergedData = Object.assign({}, ...data.map(obj => obj?.data || {}));

                let warnings = Object.entries(mergedData)
                    .filter(([key, val]) => config.warningValues.includes(val.value))
                    .map(([key, val]) => `${key.replace('Warning', '').split(/(?=[A-Z])/).join(' ')}: ${val.value.replace('_',  ' ').toLowerCase()}`)

                if(warnings.length == 0) warnings.push('OK');
                else if(warnings.length > 0) alarm = true;

                this._updateProperty('warnings_text', warnings.join(', '));
                this._updateProperty('alarm_warnings', alarm);
            })
            .catch(reason => {
                this.error(`Failed to getVehicleWarnings or getTyreState`, reason);
            });
        }
    }

    async updateTimestampSetting(settingKey, timestamp) {
        if (timestamp) {
            timestamp = new Date(timestamp).toLocaleString('sv-se', { timeZone: this.homey.clock.getTimezone() })
            await this.setSettings({
                [settingKey]: timestamp
            })
                .catch(reason => {
                    this.error(reason);
                });
        }
    }

    refreshAccessToken() {
        this.tokenManager.getToken(
            Homey.env.VCC_LOGIN_TOKEN,
            this.getUsername(),
            this.getPassword(),
            false
        )
            .then(token => {
                if (this.getToken().access_token != token.access_token) {
                    this.logMessage('We have a new access token from TokenManager');
                }
                this.setToken(token);
            }).catch(reason => {
                this.error(reason);
            });
    }

    createVolvoClient() {
        let options = {
            accessToken: this.getToken().access_token,
            vccApiKey: this.getSetting('vccApiKey'),
            device: this
        };
        const cv = new ConnectedVehicle(options);

        var self = this;
        cv.on('error', (jsonError) => {
            self.error(`[${self.getName()}] Houston we have a problem`, jsonError);
            let message = '';
            try {
                message = JSON.stringify(jsonError, null, "  ");
            } catch (e) {
                self.log('Failed to stringify object', e);
                // message = error.toString();
            }

            const dateTime = new Date().toLocaleString('sv-se', { timeZone: this.homey.clock.getTimezone() }); // new Date().toISOString();
            self.setSettings({ last_error: dateTime + '\n' + message })
                .catch(err => {
                    self.error('Failed to update settings last_error', err);
                });
        });

        return cv;
    }

    getToken() {
        return this.getStoreValue(_TOKEN_KEY);
    }

    setToken(token) {
        this.setStoreValue(_TOKEN_KEY, token)
            .catch(reason => {
                this.error(reason);
            });
    }

    storeCredentialsEncrypted(plainUser, plainPassword) {
        this.logMessage(`Storing encrypted credentials for user '${plainUser}'`);
        this.homey.settings.set(this._usernameSettingsKey, this.encryptText(plainUser));
        this.homey.settings.set(this._passwordSettingsKey, this.encryptText(plainPassword));

        // Remove unencrypted credentials passed from driver
        this.unsetStoreValue('username');
        this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(this.homey.settings.get(this._usernameSettingsKey));
    }

    getPassword() {
        return this.decryptText(this.homey.settings.get(this._passwordSettingsKey));
    }

    encryptText(text) {
        let iv = crypto.randomBytes(16);
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    }

    decryptText(text) {
        let iv = Buffer.from(text.iv, 'hex');
        let encryptedText = Buffer.from(text.encryptedData, 'hex');
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
    }

    async removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Remove existing capability '${capability}'`);
                await this.removeCapability(capability);
            } catch (reason) {
                this.error(`Failed to removed capability '${capability}'`);
                this.error(reason);
            }
        }
    }
    async addCapabilityHelper(capability) {
        if (!this.hasCapability(capability)) {
            try {
                this.logMessage(`Adding missing capability '${capability}'`);
                await this.addCapability(capability);
            } catch (reason) {
                this.error(`Failed to add capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    async updateCapabilityOptions(capability, options) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Updating capability options '${capability}'`);
                await this.setCapabilityOptions(capability, options);
            } catch (reason) {
                this.error(`Failed to update capability options for '${capability}'`);
                this.error(reason);
            }
        }
    }

    fetchCapabilityOptions(capability) {
        let options = {};
        if (this.hasCapability(capability)) {
            try {
                //this.logMessage(`Trying to fetch capability options for '${capability}'`);
                options = this.getCapabilityOptions(capability);
            } catch (reason) {
                this.error(`Failed to fetch capability options for '${capability}', even if it exists!!!`);
                this.error(reason);
            }
        }
        return options;
    }

    isCarAtHome() {
        if (!isNaN(this.getStoreValue(_RAW_DISTANCE_HOMEY))
            && this.getStoreValue(_RAW_DISTANCE_HOMEY) < this.getSetting('proximity_home')) {
            return true;
        } else {
            return false;
        }
    }

    isAnyDoorOpen() {
        const doorState = this.getStoreValue(_DOOR_STATE);
        if (doorState) {
            if (doorState?.data?.frontLeftDoor?.value == 'OPEN' ||
                doorState?.data?.frontRightDoor?.value == 'OPEN' ||
                doorState?.data?.rearLeftDoor?.value == 'OPEN' ||
                doorState?.data?.rearRightDoor?.value == 'OPEN' ||
                doorState?.data?.tailgate?.value == 'OPEN' ||
                doorState?.data?.hood?.value == 'OPEN') {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    isDoorOpen(doorName) {
        const doorState = this.getStoreValue(_DOOR_STATE);
        if (doorState) {
            switch (doorName) {
                case 'tailgateOpen':
                    return doorState?.data?.tailgate?.value == 'OPEN';
                case 'rearRightDoorOpen':
                    return doorState?.data?.rearRightDoor?.value == 'OPEN';
                case 'rearLeftDoorOpen':
                    return doorState?.data?.rearLeftDoor?.value == 'OPEN';
                case 'frontRightDoorOpen':
                    return doorState?.data?.frontRightDoor?.value == 'OPEN';
                case 'frontLeftDoorOpen':
                    return doorState?.data?.frontLeftDoor?.value == 'OPEN';
                case 'hoodOpen':
                    return doorState?.data?.hood?.value == 'OPEN';
                default:
                    return false;
            }
        } else {
            return false;
        }
    }

    _updateProperty(key, newValue) {
        let self = this;
        if (self.hasCapability(key)) {
            if (self.isCapabilityValueChanged(key, newValue)) {
                self.setCapabilityValue(key, newValue)
                    .then(async () => {
                        if (key === 'engine') {
                            if (newValue) {
                                await self.homey.app.triggerEngineStarted(self);
                            } else {
                                const tokens = {
                                    average_fuel_consumption: self.car.status.averageFuelConsumption || 0
                                }
                                await self.homey.app.triggerEngineStopped(self, tokens);
                            }

                        } else if (key === 'distance'
                            && !self.isCarAtHome()
                            && (!self.getStoreValue(_LAST_TRIGGER_LOCATION) || self.getStoreValue(_LAST_TRIGGER_LOCATION) == config.location.HOME)) {

                            self.logMessage(`'${key}' changed. At home: '${self.isCarAtHome()}'. Last trigger location: '${self.getStoreValue(_LAST_TRIGGER_LOCATION)}'`);
                            await self.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.AWAY).catch(reason => { self.error(reason); });
                            await self.homey.app.triggerCarLeftHome(self);

                        } else if (key === 'distance'
                            && self.isCarAtHome()
                            && (!self.getStoreValue(_LAST_TRIGGER_LOCATION) || self.getStoreValue(_LAST_TRIGGER_LOCATION) == config.location.AWAY)) {

                            self.logMessage(`'${key}' changed. At home: '${self.isCarAtHome()}'. Last trigger location: '${self.getStoreValue(_LAST_TRIGGER_LOCATION)}'`);
                            await self.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.HOME).catch(reason => { self.error(reason); });
                            await self.homey.app.triggerCarCameHome(self);

                        } else if (['location_human', 'location_longitude', 'location_latitude'].includes(key)) {
                            const location = self.getStoreValue(_LOCATION_ADDRESS);
                            const coordinatesArray = this.getStoreValue(_LOCATION_DATA);
                            let longitude = 0, latitude = 0;
                            if (Array.isArray(coordinatesArray) && coordinatesArray.length >= 2) {
                                longitude = coordinatesArray[0];
                                latitude = coordinatesArray[1];
                            }
                            const tokens = {
                                car_location_address: location?.address || '',
                                car_location_city: location?.city || '',
                                car_location_postcode: location?.postcode || '',
                                car_location_county: location?.county || '',
                                car_location_country: location?.country || '',
                                car_location_longitude: longitude,
                                car_location_latitude: latitude
                            }
                            await self.homey.app.triggerLocationHumanChanged(self, tokens);

                        } else if (key === 'range') {
                            const tokens = {
                                fuel_range: newValue
                            }
                            await self.homey.app.triggerFuelRangeChanged(self, tokens);

                        } else if (key === 'battery_range') {
                            const tokens = {
                                battery_range: newValue
                            }
                            await self.homey.app.triggerBatteryRangeChanged(self, tokens);

                        } else if (key === 'charging_system_status') {
                            const tokens = {
                                status: newValue
                            }
                            await self.homey.app.triggerChargeSystemStatusChanged(self, tokens);

                        } else if (key === 'odometer') {
                            const tokens = {
                                odometer: newValue
                            }
                            await self.homey.app.triggerOdometerChanged(self, tokens);

                        } else if (key == 'alarm_warnings') {
                            if(newValue ==  true){
                                self.updateCapabilityOptions('warnings_text', { uiComponent: 'sensor' })
                            }
                            else {
                                self.updateCapabilityOptions('warnings_text', { uiComponent: null })
                            }

                        } else if (key == 'warnings_text') {
                            const tokens = {
                                alarm_warnings: self.getCapabilityValue('alarm_warnings'),
                                warnings_text: newValue 
                            }
                            await self.homey.app.triggerCarWarningsChanged(self, tokens);

                        }

                    }).catch(reason => {
                        self.error(reason);
                    });
            } else {
                self.setCapabilityValue(key, newValue)
                    .catch(reason => {
                        self.error(reason);
                    });
            }

        }
    }

    isCapabilityValueChanged(key, newValue) {
        let oldValue = this.getCapabilityValue(key);
        // If oldValue===null then it is a newly added device, lets not trigger flows on that
        if (oldValue !== null && oldValue != newValue) {
            return true;
        } else {
            return false;
        }
    }

    onDeleted() {
        this.logMessage(`Deleting cVehicle device from Homey`);
        this._deleteTimers();

        this.homey.settings.unset(this._usernameSettingsKey);
        this.homey.settings.unset(this._passwordSettingsKey);
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        let change = false;
        let refresh_status_cloud = oldSettings.refresh_status_cloud;
        let refresh_position = oldSettings.refresh_position;
        const changedSensorSettings = changedKeys.filter(key => key.includes('Sensor'))

        if (changedKeys.indexOf("refresh_status_cloud") > -1) {
            this.log('Refresh status cloud value was change to:', newSettings.refresh_status_cloud);
            refresh_status_cloud = newSettings.refresh_status_cloud;
            change = true;
        }
        if (changedKeys.indexOf("refresh_position") > -1) {
            this.log('Refresh position value was change to:', newSettings.refresh_position);
            refresh_position = newSettings.refresh_position;
            change = true;
        }

        if (changedKeys.indexOf("proximity_home") > -1) {
            this.log('Proximity home value was change to:', newSettings.proximity_home);
        }

        if (changedKeys.indexOf("vccApiKey") > -1) {
            this.log('VCC API key value was change to:', newSettings.vccApiKey);
        }

        if(changedSensorSettings.length > 0) {
            for(const sensor of changedSensorSettings){
                this.log(`${sensor} setting was changed to: ${newSettings[sensor]}`)
            }
            await this.setupSensors(newSettings);
        }

        if (change) {
            //We also need to re-initialize the timer
            this._reinitializeTimers(refresh_status_cloud, refresh_position);
        }
    }

    formatDistance(distance) {
        if (distance < 1000) return this.formatValue(distance) + ' m'
        return this.formatValue(distance / 1000) + ' km'
    }

    formatValue(t) {
        return Math.round(t.toFixed(1) * 10) / 10
    }
}
module.exports = ConnectedVehicleDevice;
