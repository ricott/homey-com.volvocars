'use strict';

const assert = require('assert');
const VOC = require('../lib/voc.js');
var config = require('./config')['phev'];
//var config = require('./config')['phev2'];

let vocSession = new VOC({
    username: config.credentials.user,
    password: config.credentials.password,
    region: 'eu',
    uuid: '11111A11-A111-11A1-A1AA-1111AAA1111A'
});

describe('VOC', function () {

    describe('#login()', function () {
        it('should return username', function (done) {
            vocSession.login()
                .then(function (result) {
                    assert.strictEqual(result.username, config.credentials.user);
                    //console.log(result);
                    done();
                });
        }).timeout(5000);
    });

    describe('#listVehiclesOnAccount()', function () {
        it('should return VIN', function (done) {
            vocSession.listVehiclesOnAccount()
                .then(function (result) {
                    assert.strictEqual(result[0].data.id, config.credentials.vin);
                    done();
                });
        }).timeout(5000);
    });

    describe('#getVehicleChargeLocations()', function () {
        it('should return more than 2 charge locations', function (done) {
            vocSession.getVehicleChargeLocations(config.credentials.vin)
                .then(function (result) {
                    assert.strictEqual(result.length > 2, true);
                    done();
                });
        }).timeout(5000);
    });

    describe('#getVehicleAttributes()', function () {
        it('should return 2441CF30', function (done) {
            vocSession.getVehicleAttributes(config.credentials.vin)
                .then(function (result) {
                    assert.strictEqual(result.engineCode, '2441CF30');
                    done();
                });
        }).timeout(5000);
    });

    describe('#getVehiclePosition()', function () {
        it('should return a number', function (done) {
            vocSession.getVehiclePosition(config.credentials.vin)
                .then(function (result) {
                    assert.strictEqual(isNaN(result.longitude), false);
                    done();
                });
        }).timeout(5000);
    });

    describe('#getVehicleStatusFromCloud()', function () {
        it('should return a number', function (done) {
            vocSession.getVehicleStatusFromCloud(config.credentials.vin)
                .then(function (result) {
                    assert.strictEqual(isNaN(result.odometer), false);
                    done();
                });
        }).timeout(5000);
    });

});

