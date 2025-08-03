'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const config = require('../../lib/const.js');
const Osm = require('../../lib/maps.js');

const _AVAILABLE_COMMANDS_KEY = 'availableCommands';
const _LOCATION_DATA = 'location';
const _LOCATION_ADDRESS = 'locationAddress';
const _LAST_TRIGGER_LOCATION = 'lastTriggerLocation';
const _RAW_DISTANCE_HOMEY = 'rawDistanceHomey';
const _DEVICE_CLASS = 'car';

class ConnectedVehicleDevice extends OAuth2Device {

    #pollIntervals = [];

    async onOAuth2Init() {
        this.log('Connected Vehicle device OAuth2 initiated');

        // Change device class to car if not already
        if (this.getClass() !== _DEVICE_CLASS) {
            await this.setClass(_DEVICE_CLASS);
        }

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
        this.#initilializeTimers(
            this.getSetting('refresh_status_cloud'),
            this.getSetting('refresh_position')
        );
    }

    #initilializeTimers(refreshStatusCloud, refreshPosition) {
        this.log(`Creating timers (${refreshStatusCloud}/${refreshPosition})`);

        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.refreshInformation();
        }, 60 * 1000 * Number(refreshStatusCloud)));

        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.refreshLocation();
        }, 60 * 1000 * Number(refreshPosition)));
    }

    #deleteTimers() {
        // Kill interval object(s)
        this.log('Removing timers');
        this.#pollIntervals.forEach(timer => {
            this.homey.clearInterval(timer);
        });
    }

    #reinitializeTimers(refreshStatusCloud, refreshPosition) {
        this.#deleteTimers();
        this.#initilializeTimers(refreshStatusCloud, refreshPosition);
    }

    async setupCapabilityListeners() {
        this.registerCapabilityListener('locked', async (lock) => {
            try {
                if (lock) {
                    await this.oAuth2Client.lock(this.getData().id);
                } else {
                    await this.oAuth2Client.unlock(this.getData().id);
                }
            } catch (error) {
                this.error(error);
                return Promise.reject(error);
            }
        });
    }

    async setupCapabilities() {
        this.log('Setting up capabilities');
        const type = this.getSetting('vehicleType');

        this.log(`${type} car, checking that we have correct capabilities defined ...`);
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
        this.log('Fetching available commands');

        try {
            const commands = await this.oAuth2Client.listAvailableCommands(this.getData().id);

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

        try {
            const vehicleInfo = await this.oAuth2Client.getVehicleInfo(this.getData().id);
            const vehicleType = this.#determineVehicleType(vehicleInfo.data.fuelType);

            await this.setSettings({
                model: `${vehicleInfo.data.descriptions.model} / ${vehicleInfo.data.modelYear}`,
                fuelType: vehicleInfo.data.fuelType,
                vehicleType: vehicleType
            });

            this.log(`Vehicle settings updated - Type: ${vehicleType}`);
        } catch (error) {
            this.error('Failed to update vehicle settings:', error);
            throw error;
        }
    }

    #determineVehicleType(fuelType) {
        if (fuelType === 'PETROL/ELECTRIC') {
            return config.vehicleType.HYBRID;
        } else if (fuelType === 'ELECTRIC' || fuelType === 'NONE') {
            return config.vehicleType.ELECTRIC;
        }
        // PETROL, DIESEL
        return config.vehicleType.ICE;
    }

    async refreshLocation() {
        this.log('=== Starting refreshLocation ===');
        const oldCoordinates = this.getStoreValue(_LOCATION_DATA);
        const isFirstRun = !oldCoordinates; // No stored location data yet
        const [oldLongitude = 0, oldLatitude = 0] = oldCoordinates || [0, 0];

        this.log(`Old coordinates: [${oldLongitude}, ${oldLatitude}], isFirstRun: ${isFirstRun}`);

        try {
            const locationResponse = await this.oAuth2Client.getVehicleLocation(this.getData().id);
            const newCoordinates = locationResponse?.data?.geometry?.coordinates || [0, 0];
            this.log('Raw API response coordinates:', newCoordinates);

            if (!Array.isArray(newCoordinates) || newCoordinates.length < 2) {
                throw new Error('Invalid coordinates received from API');
            }

            const [newLongitude = 0, newLatitude = 0] = newCoordinates;
            this.log(`New coordinates: [${newLongitude}, ${newLatitude}]`);

            // Check if critical location capabilities are missing/null
            const hasDistance = this.getCapabilityValue('distance') !== null;
            const hasLocationHuman = this.getCapabilityValue('location_human') !== null;
            const needsInitialSetup = !hasDistance || !hasLocationHuman;

            // Update if this is the first run OR if location has changed significantly OR if capabilities need setup
            const shouldUpdate = isFirstRun || needsInitialSetup || this.#hasLocationChanged(oldLatitude, oldLongitude, newLatitude, newLongitude);
            this.log(`Should update location data: ${shouldUpdate} (firstRun:${isFirstRun}, needsSetup:${needsInitialSetup}, locationChanged:${!isFirstRun && !needsInitialSetup})`);

            if (shouldUpdate) {
                await this.#updateLocationData(newCoordinates, newLatitude, newLongitude);
            } else {
                this.log('Location unchanged and capabilities already set, skipping update');
            }

            // Always update timestamp
            await this.updateTimestampSetting('locationTimestamp', locationResponse?.data?.properties?.timestamp);
        } catch (error) {
            this.error('Failed to refresh vehicle location:', error);
        }
        this.log('=== Finished refreshLocation ===');
    }

    #hasLocationChanged(oldLat, oldLong, newLat, newLong) {
        const oldLatFixed = oldLat.toFixed(5);
        const oldLongFixed = oldLong.toFixed(5);
        const newLatFixed = newLat.toFixed(5);
        const newLongFixed = newLong.toFixed(5);

        const hasChanged = oldLatFixed !== newLatFixed || oldLongFixed !== newLongFixed;
        this.log(`Location change check: [${oldLatFixed}, ${oldLongFixed}] vs [${newLatFixed}, ${newLongFixed}] = ${hasChanged}`);

        return hasChanged;
    }

    async #updateLocationData(coordinates, latitude, longitude) {
        this.log(`=== Updating location data for coordinates: [${coordinates[0]}, ${coordinates[1]}] ===`);

        try {
            // Store raw coordinates
            await this.setStoreValue(_LOCATION_DATA, coordinates);
            this.log('Stored raw coordinates in store');

            // Update device properties
            await this.#updateProperty('location_longitude', longitude);
            await this.#updateProperty('location_latitude', latitude);

            // Calculate and store distance to Homey
            const distanceHomey = await this.#calculateDistanceToHomey(latitude, longitude);
            this.log(`Calculated distance to Homey: ${distanceHomey}`);
            await this.#updateDistanceProperties(distanceHomey);

            // Get and store human-readable location
            await this.#updateHumanReadableLocation(latitude, longitude);
        } catch (error) {
            this.error('Failed to update location data:', error);
            throw error;
        }
        this.log('=== Finished updating location data ===');
    }

    async #calculateDistanceToHomey(latitude, longitude) {
        const distance = Osm.calculateDistance(
            latitude,
            longitude,
            this.homey.geolocation.getLatitude(),
            this.homey.geolocation.getLongitude()
        ) || 0;

        await this.setStoreValue(_RAW_DISTANCE_HOMEY, distance);
        return distance;
    }

    async #updateDistanceProperties(distanceHomey) {
        const formattedDistance = this.formatDistance(distanceHomey < 1 ? 0 : distanceHomey);
        this.log(`Distance: raw=${distanceHomey}, formatted="${formattedDistance}"`);
        await this.#updateProperty('distance', formattedDistance);
    }

    async #updateHumanReadableLocation(latitude, longitude) {
        this.log(`Getting human-readable location for [${latitude}, ${longitude}]`);
        try {
            const osm_location = await Osm.geocodeLatLng(latitude, longitude);
            this.log('OSM geocoding result:', osm_location);
            const locationString = `${osm_location.address}, ${osm_location.city}`;
            this.log(`Human-readable location: "${locationString}"`);

            await this.#updateProperty('location_human', locationString);
            await this.setStoreValue(_LOCATION_ADDRESS, osm_location);
        } catch (error) {
            this.error('Failed to update human readable location:', error);
        }
    }

    async refreshInformation() {

        await this.#refreshVehicleStatistics();
        await this.#refreshDoorState();
        await this.#refreshEngineState();
    }

    async #refreshVehicleStatistics() {
        try {
            const vehicleStats = await this.oAuth2Client.getVehicleStatistics(this.getData().id);

            // Handle energy information for hybrid and electric vehicles
            const type = this.getSetting('vehicleType');
            if (type === config.vehicleType.HYBRID || type === config.vehicleType.ELECTRIC) {
                await this.#refreshEnergyInformation(vehicleStats);
            }

            // Handle fuel range for hybrid and ICE vehicles
            if (type === config.vehicleType.HYBRID || type === config.vehicleType.ICE) {
                await this.#updateProperty('range', vehicleStats?.data?.distanceToEmptyTank?.value || 0);
                await this.updateTimestampSetting('rangeFuelTimestamp', vehicleStats?.data?.distanceToEmptyTank?.timestamp);
            }
        } catch (error) {
            this.error('Failed to get vehicle statistics:', error);
        }
    }

    async #refreshEnergyInformation(vehicleStats) {
        try {
            const energyState = await this.oAuth2Client.getEnergyState(this.getData().id);
            // this.log('Energy state:', energyState);

            if (energyState?.batteryChargeLevel?.status === 'OK') {
                await this.#updateProperty('measure_battery', energyState?.batteryChargeLevel?.value || 0);
                await this.updateTimestampSetting('batteryTimestamp', energyState?.batteryChargeLevel?.updatedAt);
            } else {
                const feulState = await this.oAuth2Client.getFuelBatteryState(this.getData().id);
                await this.#updateProperty('measure_battery', feulState?.data?.batteryChargeLevel?.value || 0);
                await this.updateTimestampSetting('batteryTimestamp', feulState?.data?.batteryChargeLevel?.timestamp);
            }

            if (energyState?.electricRange?.status === 'OK') {
                await this.#updateProperty('range_battery', energyState?.electricRange?.value || 0);
                await this.updateTimestampSetting('rangeBatteryTimestamp', energyState?.electricRange?.updatedAt);
            } else {
                await this.#updateProperty('range_battery', vehicleStats?.data?.distanceToEmptyBattery?.value || 0);
                await this.updateTimestampSetting('rangeBatteryTimestamp', vehicleStats?.data?.distanceToEmptyBattery?.timestamp);
            }

            if (energyState?.chargingStatus?.status === 'OK') {
                const chargingSystemStatus = energyState?.chargingStatus?.value;
                await this.#updateProperty('charging_system_status', chargingSystemStatus);
                await this.updateTimestampSetting('chargingSystemTimestamp', energyState?.chargingStatus?.updatedAt);
                await this.#updateProperty('ev_charging_state', this.mapChargingSystemStatus(chargingSystemStatus));
            } else {
                this.log('Charging status not supported');
            }

        } catch (error) {
            this.error('Failed to refresh energy information:', error);
        }
    }

    async #refreshDoorState() {
        try {
            const doorState = await this.oAuth2Client.getDoorState(this.getData().id);
            await this.#updateProperty('locked', doorState?.data?.centralLock?.value === 'LOCKED');
            await this.updateTimestampSetting('lockTimestamp', doorState?.data?.centralLock?.timestamp);

        } catch (error) {
            this.error('Failed to get door state:', error);
        }
    }

    async #refreshEngineState() {
        try {
            const engineState = await this.oAuth2Client.getEngineState(this.getData().id);
            await this.#updateProperty('engine', engineState?.data?.engineStatus?.value === 'RUNNING');
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

    async removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.log(`Remove existing capability '${capability}'`);
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
                this.log(`Adding missing capability '${capability}'`);
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
                this.log(`Updating capability options '${capability}'`);
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
                //this.log(`Trying to fetch capability options for '${capability}'`);
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
            const windowState = await this.oAuth2Client.getWindowState(this.getData().id);

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
            const windowState = await this.oAuth2Client.getWindowState(this.getData().id);
            return windowState?.data?.[windowName]?.value === 'OPEN';

        } catch (error) {
            this.error('Failed to get window state:', error);
        }
    }

    async isAnyDoorOpen() {
        try {
            const doorState = await this.oAuth2Client.getDoorState(this.getData().id);

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
            const doorState = await this.oAuth2Client.getDoorState(this.getData().id);

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

    async #updateProperty(key, newValue) {
        const hasCapability = this.hasCapability(key);
        this.log(`Updating property ${key}: hasCapability=${hasCapability}, newValue=`, newValue);

        if (!hasCapability) {
            this.log(`Device missing capability: ${key}`);
            return;
        }

        const oldValue = this.getCapabilityValue(key);
        const hasValueChanged = this.isCapabilityValueChanged(key, newValue);
        this.log(`Property ${key}: oldValue=${oldValue}, newValue=${newValue}, hasChanged=${hasValueChanged}`);

        try {
            await this.setCapabilityValue(key, newValue);
            this.log(`Successfully set capability ${key} to:`, newValue);

            if (hasValueChanged) {
                this.log(`Triggering change events for ${key}`);
                await this.#handlePropertyChangeEvents(key, newValue);
            }
        } catch (error) {
            this.error(`Failed to update property ${key}:`, error);
        }
    }

    async #handlePropertyChangeEvents(key, newValue) {
        const propertyHandlers = {
            engine: () => this.#handleEngineChange(newValue),
            distance: () => this.#handleDistanceChange(),
            location_human: () => this.#handleLocationChange(),
            location_longitude: () => this.#handleLocationChange(),
            location_latitude: () => this.#handleLocationChange(),
            range: () => this.#handleFuelRangeChange(newValue),
            range_battery: () => this.#handleBatteryRangeChange(newValue),
            charging_system_status: () => this.#handleChargingStatusChange(newValue)
        };

        const handler = propertyHandlers[key];
        if (handler) {
            await handler();
        }
    }

    async #handleEngineChange(isRunning) {
        if (isRunning) {
            await this.homey.app.triggerEngineStarted(this);
        } else {
            const tokens = {
                average_fuel_consumption: 0
            };
            await this.homey.app.triggerEngineStopped(this, tokens);
        }
    }

    async #handleDistanceChange() {
        const isAtHome = this.isCarAtHome();
        const lastTriggerLocation = this.getStoreValue(_LAST_TRIGGER_LOCATION);

        if (!isAtHome && (!lastTriggerLocation || lastTriggerLocation === config.location.HOME)) {
            this.log(`Distance changed. At home: ${isAtHome}. Last trigger location: ${lastTriggerLocation}`);
            await this.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.AWAY)
                .catch(error => this.error(error));
            await this.homey.app.triggerCarLeftHome(this);
        } else if (isAtHome && (!lastTriggerLocation || lastTriggerLocation === config.location.AWAY)) {
            this.log(`Distance changed. At home: ${isAtHome}. Last trigger location: ${lastTriggerLocation}`);
            await this.setStoreValue(_LAST_TRIGGER_LOCATION, config.location.HOME)
                .catch(error => this.error(error));
            await this.homey.app.triggerCarCameHome(this);
        }
    }

    async #handleLocationChange() {
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

    async #handleFuelRangeChange(range) {
        const tokens = { fuel_range: range };
        await this.homey.app.triggerFuelRangeChanged(this, tokens);
    }

    async #handleBatteryRangeChange(range) {
        const tokens = { battery_range: range };
        await this.homey.app.triggerBatteryRangeChanged(this, tokens);
    }

    async #handleChargingStatusChange(status) {
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

    onOAuth2Deleted() {
        this.log(`Deleting cVehicle device from Homey`);
        this.#deleteTimers();
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

        if (change) {
            //We also need to re-initialize the timer
            this.#reinitializeTimers(refresh_status_cloud, refresh_position);
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
            case 'DONE':
            case 'IDLE':
            case 'SCHEDULED':
                return 'plugged_in';
            case 'DISCHARGING':
                return 'plugged_in_discharging';
            // case 'ERROR':
            //     return 'plugged_out';
            default:
                return 'plugged_out';
        }
    }
}

module.exports = ConnectedVehicleDevice;
