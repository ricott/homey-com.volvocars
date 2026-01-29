'use strict';

const { OAuth2Driver } = require('../../lib/oauth2');

class ConnectedVehicleDriver extends OAuth2Driver {

    async onOAuth2Init() {
        this.log('Connected Vehicle driver has been initialized');

        // Migrate VCC API key from device settings to app settings if needed
        await this.#migrateVccApiKey();
    }

    async onPairListDevices({ oAuth2Client }) {
        // Check if VCC API key is configured in app settings
        const vccApiKey = this.homey.settings.get('vcc_api_key');
        if (!vccApiKey || vccApiKey.trim() === '') {
            throw new Error('VCC API Key is required. Please enter your VCC API Key in the app settings before adding a vehicle.');
        }

        const vehicles = await oAuth2Client.getVehicles();

        const devicesData = vehicles.data.map(async (vehicle) => {
            const vehicleInfo = await oAuth2Client.getVehicleInfo(vehicle.vin);
            return {
                name: `${vehicleInfo.data.descriptions.model} / ${vehicleInfo.data.modelYear}`,
                data: {
                    id: vehicle.vin,
                },
            };
        });
        let devices = await Promise.all(devicesData);
        return devices;
    }

    async #migrateVccApiKey() {
        try {
            // Check if app-level VCC API key is already set
            const appApiKey = this.homey.settings.get('vcc_api_key');
            
            if (appApiKey && appApiKey.trim() !== '') {
                this.log('VCC API key already exists in app settings, skipping migration');
                return;
            }

            this.log('Checking for VCC API key migration from device settings...');

            // Get all devices for this driver
            const devices = this.getDevices();

            if (devices.length === 0) {
                this.log('No devices found, skipping migration');
                return;
            }

            // Check each device for vccApiKey setting
            let migratedKey = null;
            for (const device of devices) {
                const deviceApiKey = device.getSetting('vccApiKey');
                if (deviceApiKey && deviceApiKey.trim() !== '') {
                    migratedKey = deviceApiKey.trim();
                    this.log(`Found VCC API key in device '${device.getName()}', migrating to app settings`);
                    break;
                }
            }

            if (migratedKey) {
                // Save the API key to app settings
                this.homey.settings.set('vcc_api_key', migratedKey);
                this.log('Successfully migrated VCC API key to app settings');

                // Remove the API key from all device settings to clean up
                for (const device of devices) {
                    const deviceApiKey = device.getSetting('vccApiKey');
                    if (deviceApiKey && deviceApiKey.trim() !== '') {
                        try {
                            await device.setSettings({ vccApiKey: '' });
                            this.log(`Cleared VCC API key from device '${device.getName()}'`);
                        } catch (error) {
                            this.log(`Warning: Could not clear VCC API key from device '${device.getName()}':`, error.message);
                        }
                    }
                }
            } else {
                this.log('No VCC API key found in device settings to migrate');
            }
        } catch (error) {
            this.log('Error during VCC API key migration:', error.message);
            // Don't throw the error as we don't want to prevent driver initialization
        }
    }
}

module.exports = ConnectedVehicleDriver;
