'use strict';

const ConnectedVehicle = require('../../lib/cVehicle.js');
const assert = require('assert');
const util = require('util');
var config = require('../config.js')['phev'];

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#commands', function () {

    it('isVehicleAccessibleForCommands', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const availableForCommands = await cVehicle.isVehicleAccessibleForCommands(config.credentials.vin);
        assert.strictEqual(availableForCommands, true);
    });

    it('listAvailableCommands', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const response = await cVehicle.listAvailableCommands(config.credentials.vin);
        console.log(JSON.stringify(response));

    });

    it('lock', async () => {
        let token = await tokenManager.getToken(config.vccLoginToken, config.credentials.user, config.credentials.password);
        const cVehicle = new ConnectedVehicle({
            accessToken: token.access_token,
            vccApiKey: config.vccApiKey
        });

        const result = await cVehicle.lock(config.credentials.vin);
        console.log(result);
        //assert.strictEqual(availableForCommands, true);
    });

});




