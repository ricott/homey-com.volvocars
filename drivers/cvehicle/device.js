'use strict';
const Homey = require('homey');
const ConnectedVehicle = require('../../lib/connectedVehicle.js');
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
const _DEVICE_CLASS = 'car';

class ConnectedVehicleDevice extends Homey.Device {

    #pollIntervals = [];

    async onInit() {
        this.logMessage('Connected Vehicle device initiated');

        // Change device class to car if not already
        if (this.getClass() !== _DEVICE_CLASS) {
            await this.setClass(_DEVICE_CLASS);
        }

        this.tokenManager = TokenManager;
        this._usernameSettingsKey = `cv.${this.getData().id}.username`;
        this._passwordSettingsKey = `cv.${this.getData().id}.password`;

        if (!this.homey.settings.get(this._usernameSettingsKey)) {
            // This is a newly added device, lets copy login details to homey settings
            await this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        // Force renewal of token, if a user restarts the app a new token should be generated
        await this.refreshAccessToken();

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

        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.refreshInformation();
        }, 60 * 1000 * Number(refreshStatusCloud)));

        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.refreshLocation();
        }, 60 * 1000 * Number(refreshPosition)));

        // Refresh access token, each 1 mins from tokenManager
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                this.error(error);
            }
        }, 60 * 1000 * 1));
    }

    _deleteTimers() {
        // Kill interval object(s)
        this.log('Removing timers');
        this.#pollIntervals.forEach(timer => {
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
        const type = this.getSetting('vehicleType');

        this.logMessage(`${type} car, checking that we have correct capabilities defined ...`);
        if (type == config.vehicleType.ICE) {
            await this.removeCapabilityHelper('measure_battery');
            await this.removeCapabilityHelper('range_battery');
            await this.removeCapabilityHelper('charging_system_status');
            await this.removeCapabilityHelper('ev_charging_state');
            // Make sure range is there
            await this.addCapabilityHelper('range');

        } else if (type == config.vehicleType.ELECTRIC) {
            await this.removeCapabilityHelper('range');
            // Make sure electric capabilites are there
            await this.addCapabilityHelper('measure_battery');
            await this.addCapabilityHelper('range_battery');
            await this.addCapabilityHelper('charging_system_status');
            await this.addCapabilityHelper('ev_charging_state');

            await this.setEnergy({ electricCar: true });

        } else if (type == config.vehicleType.HYBRID) {
            await this.addCapabilityHelper('range');
            await this.addCapabilityHelper('measure_battery');
            await this.addCapabilityHelper('range_battery');
            await this.addCapabilityHelper('charging_system_status');
            await this.addCapabilityHelper('ev_charging_state');

            await this.setEnergy({ electricCar: true });
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

        try {
            const commands = await client.listAvailableCommands(this.getData().id);

            // Map commands to our format (no need for async here)
            let availComm = commands.data.map(command => ({
                id: command.command,
                name: command.command
            }));

            // Remove engine start and stop - the oauth scope is not allowed
            availComm = availComm.filter(comm =>
                comm.name !== config.commands.ENGINE_START &&
                comm.name !== config.commands.ENGINE_STOP
            );

            // Sort commands alphabetically
            availComm.sort((a, b) => a.name.localeCompare(b.name));

            try {
                await this.setStoreValue(_AVAILABLE_COMMANDS_KEY, availComm);
            } catch (error) {
                this.error('Failed to store available commands:', error);
            }
        } catch (error) {
            this.error('Failed to list available commands:', error);
        }
    }

    async updateVehicleSettings() {
        const client = this.createVolvoClient();

        try {
            const vehicleInfo = await client.getVehicleInfo(this.getData().id);
            const vehicleType = this._determineVehicleType(vehicleInfo.data.fuelType);
            const supportsEnergyAPI = await this._checkEnergyAPISupport(client, vehicleType);

            await this.setSettings({
                model: `${vehicleInfo.data.descriptions.model} / ${vehicleInfo.data.modelYear}`,
                fuelType: vehicleInfo.data.fuelType,
                vehicleType: vehicleType,
                supportsEnergyAPI: supportsEnergyAPI
            });

            this.logMessage(`Vehicle settings updated - Type: ${vehicleType}, Energy API: ${supportsEnergyAPI}`);
        } catch (error) {
            this.error('Failed to update vehicle settings:', error);
            throw error;
        }
    }

    _determineVehicleType(fuelType) {
        if (fuelType === 'PETROL/ELECTRIC') {
            return config.vehicleType.HYBRID;
        } else if (fuelType === 'ELECTRIC' || fuelType === 'NONE') {
            return config.vehicleType.ELECTRIC;
        }
        // PETROL, DIESEL
        return config.vehicleType.ICE;
    }

    async _checkEnergyAPISupport(client, vehicleType) {
        if (vehicleType !== config.vehicleType.HYBRID && vehicleType !== config.vehicleType.ELECTRIC) {
            return 'No';
        }

        try {
            const energyCapabilities = await client.getEnergyCapabilities(this.getData().id);
            if (energyCapabilities?.getEnergyState?.isSupported == true) {
                return 'Yes';
            } else {
                return 'No';
            }
        } catch (error) {
            if (error.message?.includes('404')) {
                return 'No';
            }
            throw error;
        }
    }

    async refreshLocation() {
        const client = this.createVolvoClient();
        const oldCoordinates = this.getStoreValue(_LOCATION_DATA) || [0, 0];
        const [oldLongitude = 0, oldLatitude = 0] = oldCoordinates;

        try {
            const locationResponse = await client.getVehicleLocation(this.getData().id);
            const newCoordinates = locationResponse?.data?.geometry?.coordinates || [0, 0];

            if (!Array.isArray(newCoordinates) || newCoordinates.length < 2) {
                throw new Error('Invalid coordinates received from API');
            }

            const [newLongitude = 0, newLatitude = 0] = newCoordinates;

            // Only update if location has changed significantly
            if (this._hasLocationChanged(oldLatitude, oldLongitude, newLatitude, newLongitude)) {
                await this._updateLocationData(newCoordinates, newLatitude, newLongitude);
            }

            // Always update timestamp
            await this.updateTimestampSetting('locationTimestamp', locationResponse?.data?.properties?.timestamp);
        } catch (error) {
            this.error('Failed to refresh vehicle location:', error);
        }
    }

    _hasLocationChanged(oldLat, oldLong, newLat, newLong) {
        return oldLat.toFixed(5) !== newLat.toFixed(5) ||
            oldLong.toFixed(5) !== newLong.toFixed(5);
    }

    async _updateLocationData(coordinates, latitude, longitude) {
        this.logMessage('Updating location data');

        try {
            // Store raw coordinates
            await this.setStoreValue(_LOCATION_DATA, coordinates);

            // Update device properties
            await this._updateProperty('location_longitude', longitude);
            await this._updateProperty('location_latitude', latitude);

            // Calculate and store distance to Homey
            const distanceHomey = await this._calculateDistanceToHomey(latitude, longitude);
            await this._updateDistanceProperties(distanceHomey);

            // Get and store human-readable location
            await this._updateHumanReadableLocation(latitude, longitude);
        } catch (error) {
            this.error('Failed to update location data:', error);
            throw error;
        }
    }

    async _calculateDistanceToHomey(latitude, longitude) {
        const distance = Osm.calculateDistance(
            latitude,
            longitude,
            this.homey.geolocation.getLatitude(),
            this.homey.geolocation.getLongitude()
        ) || 0;

        await this.setStoreValue(_RAW_DISTANCE_HOMEY, distance);
        return distance;
    }

    async _updateDistanceProperties(distanceHomey) {
        const formattedDistance = this.formatDistance(distanceHomey < 1 ? 0 : distanceHomey);
        await this._updateProperty('distance', formattedDistance);
    }

    async _updateHumanReadableLocation(latitude, longitude) {
        try {
            const osm_location = await Osm.geocodeLatLng(latitude, longitude);
            const locationString = `${osm_location.address}, ${osm_location.city}`;

            await this._updateProperty('location_human', locationString);
            await this.setStoreValue(_LOCATION_ADDRESS, osm_location);
        } catch (error) {
            this.error('Failed to update human readable location:', error);
        }
    }

    async refreshInformation() {
        const client = this.createVolvoClient();

        await this._refreshVehicleStatistics(client);
        await this._refreshDoorState(client);
        await this._refreshEngineState(client);
    }

    async _refreshVehicleStatistics(client) {
        try {
            // Handle energy information for hybrid and electric vehicles
            const type = this.getSetting('vehicleType');
            if ((type === config.vehicleType.HYBRID || type === config.vehicleType.ELECTRIC) &&
                this.getSetting('supportsEnergyAPI') === 'Yes') {

                await this._refreshEnergyInformation(client);
            }

            // Handle fuel range for hybrid and ICE vehicles
            if (type === config.vehicleType.HYBRID || type === config.vehicleType.ICE) {

                const vehicleStats = await client.getVehicleStatistics(this.getData().id);
                await this._updateProperty('range', vehicleStats?.data?.distanceToEmptyTank?.value || 0);
                await this.updateTimestampSetting('rangeFuelTimestamp', vehicleStats?.data?.distanceToEmptyTank?.timestamp);
            }
        } catch (error) {
            this.error('Failed to get vehicle statistics:', error);
        }
    }

    async _refreshEnergyInformation(client) {
        try {
            const energyState = await client.getEnergyState(this.getData().id);

            await this._updateProperty('measure_battery', energyState?.batteryChargeLevel?.value || 0);
            await this.updateTimestampSetting('batteryTimestamp', energyState?.batteryChargeLevel?.updatedAt);

            await this._updateProperty('range_battery', energyState?.electricRange?.value || 0);
            await this.updateTimestampSetting('rangeBatteryTimestamp', energyState?.electricRange?.updatedAt);

            const chargingSystemStatus = energyState?.chargingStatus?.value;
            await this._updateProperty('charging_system_status', chargingSystemStatus);
            await this.updateTimestampSetting('chargingSystemTimestamp', energyState?.chargingStatus?.updatedAt);

            await this._updateProperty('ev_charging_state', this.mapChargingSystemStatus(chargingSystemStatus));

        } catch (error) {
            this.error('Failed to refresh energy information:', error);
        }
    }

    async _refreshDoorState(client) {
        try {
            const doorState = await client.getDoorState(this.getData().id);
            await this._updateProperty('locked', doorState?.data?.centralLock?.value === 'LOCKED');
            await this.updateTimestampSetting('lockTimestamp', doorState?.data?.centralLock?.timestamp);

        } catch (error) {
            this.error('Failed to get door state:', error);
        }
    }

    async _refreshEngineState(client) {
        try {
            const engineState = await client.getEngineState(this.getData().id);
            await this._updateProperty('engine', engineState?.data?.engineStatus?.value === 'RUNNING');
            await this.updateTimestampSetting('engineTimestamp', engineState?.data?.engineStatus?.timestamp);
        } catch (error) {
            this.error('Failed to get engine state:', error);
        }
    }

    async updateTimestampSetting(settingKey, timestamp) {
        if (timestamp) {
            timestamp = new Date(timestamp).toLocaleString('sv-se', { timeZone: this.homey.clock.getTimezone() });
            try {
                await this.setSettings({ [settingKey]: timestamp });
            } catch (error) {
                this.error(`Failed to update timestamp setting ${settingKey}`, error);
            }
        }
    }

    async refreshAccessToken() {
        try {
            const token = await this.tokenManager.getToken(
                Homey.env.VCC_LOGIN_TOKEN,
                this.getUsername(),
                this.getPassword(),
                this.getToken(),
                this
            );

            if (this.getToken().access_token !== token.access_token) {
                this.logMessage('We have a new access token from TokenManager');
            }

            await this.setToken(token);
        } catch (error) {
            this.error('Failed to refresh access token:', error);
        }
    }

    createVolvoClient() {
        const options = {
            accessToken: this.getToken().access_token,
            vccApiKey: this.getSetting('vccApiKey'),
            device: this
        };

        const cv = new ConnectedVehicle(options);

        cv.on('error', async (jsonError) => {
            this.error(`[${this.getName()}] Houston we have a problem`, jsonError);

            let message = '';
            try {
                message = JSON.stringify(jsonError, null, 2);
            } catch (error) {
                this.log('Failed to stringify error object', error);
                message = 'Error could not be serialized';
            }

            const dateTime = new Date().toLocaleString('sv-se', {
                timeZone: this.homey.clock.getTimezone()
            });

            try {
                await this.setSettings({
                    last_error: `${dateTime}\n${message}`
                });
            } catch (error) {
                this.error('Failed to update settings last_error', error);
            }
        });

        return cv;
    }

    getToken() {
        return this.getStoreValue(_TOKEN_KEY);
    }

    async setToken(token) {
        try {
            await this.setStoreValue(_TOKEN_KEY, token);
        } catch (error) {
            this.error('Failed to set token', error);
        }
    }

    async storeCredentialsEncrypted(plainUser, plainPassword) {
        this.logMessage(`Storing encrypted credentials for user '${plainUser}'`);
        await this.homey.settings.set(this._usernameSettingsKey, this.encryptText(plainUser));
        await this.homey.settings.set(this._passwordSettingsKey, this.encryptText(plainPassword));

        // Remove unencrypted credentials passed from driver
        await this.unsetStoreValue('username');
        await this.unsetStoreValue('password');
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

    async isAnyWindowOpen() {
        try {
            const windowState = await this.createVolvoClient().getWindowState(this.getData().id);

            const windowProperties = [
                'frontLeftWindow',
                'frontRightWindow',
                'rearLeftWindow',
                'rearRightWindow',
                'sunroof'
            ];

            return windowProperties.some(window =>
                windowState?.data?.[window]?.value === 'OPEN'
            );

        } catch (error) {
            this.error('Failed to get window state:', error);
        }
    }

    async isWindowOpen(windowName) {
        try {
            const windowState = await this.createVolvoClient().getWindowState(this.getData().id);
            return windowState?.data?.[windowName]?.value === 'OPEN';

        } catch (error) {
            this.error('Failed to get window state:', error);
        }
    }

    async isAnyDoorOpen() {
        try {
            const doorState = await this.createVolvoClient().getDoorState(this.getData().id);

            const doorProperties = [
                'frontLeftDoor',
                'frontRightDoor',
                'rearLeftDoor',
                'rearRightDoor',
                'tailgate',
                'hood'
            ];

            return doorProperties.some(door =>
                doorState?.data?.[door]?.value === 'OPEN'
            );
        } catch (error) {
            this.error('Failed to get door state:', error);
        }
    }

    async isDoorOpen(doorName) {
        try {
            const doorState = await this.createVolvoClient().getDoorState(this.getData().id);

            const doorMappings = {
                'tailgateOpen': 'tailgate',
                'rearRightDoorOpen': 'rearRightDoor',
                'rearLeftDoorOpen': 'rearLeftDoor',
                'frontRightDoorOpen': 'frontRightDoor',
                'frontLeftDoorOpen': 'frontLeftDoor',
                'hoodOpen': 'hood'
            };

            const doorProperty = doorMappings[doorName];
            return doorProperty ? doorState?.data?.[doorProperty]?.value === 'OPEN' : false;

        } catch (error) {
            this.error('Failed to get door state:', error);
        }
    }

    async _updateProperty(key, newValue) {
        if (!this.hasCapability(key)) {
            return;
        }

        const hasValueChanged = this.isCapabilityValueChanged(key, newValue);

        try {
            await this.setCapabilityValue(key, newValue);

            if (hasValueChanged) {
                await this._handlePropertyChangeEvents(key, newValue);
            }
        } catch (error) {
            this.error(`Failed to update property ${key}:`, error);
        }
    }

    async _handlePropertyChangeEvents(key, newValue) {
        const propertyHandlers = {
            engine: () => this._handleEngineChange(newValue),
            distance: () => this._handleDistanceChange(),
            location_human: () => this._handleLocationChange(),
            location_longitude: () => this._handleLocationChange(),
            location_latitude: () => this._handleLocationChange(),
            range: () => this._handleFuelRangeChange(newValue),
            range_battery: () => this._handleBatteryRangeChange(newValue),
            charging_system_status: () => this._handleChargingStatusChange(newValue)
        };

        const handler = propertyHandlers[key];
        if (handler) {
            await handler();
        }
    }

    async _handleEngineChange(isRunning) {
        if (isRunning) {
            await this.homey.app.triggerEngineStarted(this);
        } else {
            const tokens = {
                average_fuel_consumption: 0
            };
            await this.homey.app.triggerEngineStopped(this, tokens);
        }
    }

    async _handleDistanceChange() {
        const isAtHome = this.isCarAtHome();
        const lastTriggerLocation = this.getStoreValue(_LAST_TRIGGER_LOCATION);

        if (!isAtHome && (!lastTriggerLocation || lastTriggerLocation === config.location.HOME)) {
            this.logMessage(`Distance changed. At home: ${isAtHome}. Last trigger location: ${lastTriggerLocation}`);
            await this.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.AWAY)
                .catch(error => this.error(error));
            await this.homey.app.triggerCarLeftHome(this);
        } else if (isAtHome && (!lastTriggerLocation || lastTriggerLocation === config.location.AWAY)) {
            this.logMessage(`Distance changed. At home: ${isAtHome}. Last trigger location: ${lastTriggerLocation}`);
            await this.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.HOME)
                .catch(error => this.error(error));
            await this.homey.app.triggerCarCameHome(this);
        }
    }

    async _handleLocationChange() {
        const location = this.getStoreValue(_LOCATION_ADDRESS);
        const coordinatesArray = this.getStoreValue(_LOCATION_DATA);

        const [longitude = 0, latitude = 0] = Array.isArray(coordinatesArray) && coordinatesArray.length >= 2
            ? coordinatesArray
            : [0, 0];

        const tokens = {
            car_location_address: location?.address || '',
            car_location_city: location?.city || '',
            car_location_postcode: location?.postcode || '',
            car_location_county: location?.county || '',
            car_location_country: location?.country || '',
            car_location_longitude: longitude,
            car_location_latitude: latitude
        };

        await this.homey.app.triggerLocationHumanChanged(this, tokens);
    }

    async _handleFuelRangeChange(range) {
        const tokens = { fuel_range: range };
        await this.homey.app.triggerFuelRangeChanged(this, tokens);
    }

    async _handleBatteryRangeChange(range) {
        const tokens = { battery_range: range };
        await this.homey.app.triggerBatteryRangeChanged(this, tokens);
    }

    async _handleChargingStatusChange(status) {
        const tokens = { status };
        await this.homey.app.triggerChargeSystemStatusChanged(this, tokens);
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

        if (change) {
            //We also need to re-initialize the timer
            this._reinitializeTimers(refresh_status_cloud, refresh_position);
        }
    }

    formatDistance(distance) {
        if (distance < 1000) return this.formatValue(distance) + ' m';
        return this.formatValue(distance / 1000) + ' km';
    }

    formatValue(t) {
        return Math.round(t.toFixed(1) * 10) / 10;
    }

    mapChargingSystemStatus(chargingSystemStatus) {
        switch (chargingSystemStatus) {
            case 'CHARGING':
                return 'plugged_in_charging';
            case 'IDLE':
            case 'SCHEDULED':
                return 'plugged_in';
            case 'DISCHARGING':
                return 'plugged_in_discharging';
            // case 'ERROR':
            // case 'DONE':
            //     return 'plugged_out';
            default:
                return 'plugged_out';
        }
    }
}
module.exports = ConnectedVehicleDevice;
