'use strict';

const ConnectedVehicle = require('../../lib/cVehicle.js');
const assert = require('assert');
const util = require('util');
var config = require('../config.js')['phev'];

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#getData', function () {

    it('getVehicles', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const vehicles = await cVehicle.getVehicles();
        assert.strictEqual(vehicles.statusCode, 200);
        assert.strictEqual(vehicles.data[0].vin, config.credentials.vin);
    });

    it('getVehicleInfo', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getVehicleInfo(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.vin, config.credentials.vin);
        assert.strictEqual(response.data.modelYear, 2021);
    });

    it('getWindowState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getWindowState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.rearRightWindow.value, 'CLOSED');
    });

    it('getDoorState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getDoorState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.hood.value, 'CLOSED');
    });

    it('getOdometerState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getOdometerState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual((isNaN(response.data.odometer.value) === false), true);
    });

    it('getTyreState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getTyreState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.rearRight.value, 'NO_WARNING');
    });

    it('getEngineState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getEngineState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.engineStatus.value, 'STOPPED');
    });

    it('getFuelBatteryState', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getFuelBatteryState(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual((isNaN(response.data.fuelAmount.value) === false), true);
    });

    // it('getRechargeState', async () => {
    //     let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
    //     const cVehicle = new ConnectedVehicle({
    //         accessToken: token.access_token,
    //         vccApiKey: config.vccApiKey
    //     });

    //     const response = await cVehicle.getRechargeState(config.credentials.vin);
    //     // console.log(response);
    //     assert.strictEqual(response.statusCode, 200);
    //     assert.strictEqual(response.data.batteryChargeLevel.unit, 'percentage');
    // });

    it('getBatteryChargeLevel', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getBatteryChargeLevel(config.credentials.vin);
        // console.log(response);
        assert.strictEqual((isNaN(response.chargeLevel) === false), true);
    });

    // it('getEngineDiagnostic', async () => {
    //     let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
    //     const cVehicle = new ConnectedVehicle({
    //         accessToken: token.access_token,
    //         vccApiKey: config.vccApiKey
    //     });

    //     const response = await cVehicle.getEngineDiagnostic(config.credentials.vin);
    //     // console.log(response);
    //     assert.strictEqual(response.statusCode, 200);
    //     assert.strictEqual(response.data.oilLevelWarning.value, 'NO_WARNING');
    // });

    it('getVehicleDiagnostic', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getVehicleDiagnostic(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual((isNaN(response.data.engineHoursToService.value) === false), true);
    });

    it('getVehicleWarnings', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getVehicleWarnings(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.brakeLightCenterWarning.value, 'UNSPECIFIED');
    });

    it('getVehicleStatistics', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getVehicleStatistics(config.credentials.vin);
        // console.log(response);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual((isNaN(response.data.distanceToEmptyTank.value) === false), true);
    });

    it('getVehicleLocation', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.getVehicleLocation(config.credentials.vin);
        // console.log(JSON.stringify(response));
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.geometry.type, 'Point');
    });
});




