'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

class ConnectedVehicleDriver extends OAuth2Driver {

    async onOAuth2Init() {
        this.log('Connected Vehicle driver has been initialized');

    }

    async onPairListDevices({ oAuth2Client }) {
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
}

module.exports = ConnectedVehicleDriver;
