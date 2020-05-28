'use strict';

const assert = require('assert');
const VOC = require('../lib/voc.js');
var config = require('./config')['phev'];

let vocSession = new VOC({
    username: config.credentials.user,
    password: config.credentials.password,
    region: 'eu',
    uuid: '11111A11-A111-11A1-A1AA-1111AAA1111A'
});

describe('VOC', function () {

    describe('#getVehicleChargeLocations()', function () {
        it('should return 4 charge locations', function (done) {
            vocSession.getVehicleChargeLocations(config.credentials.vin)
                .then(function (result) {
                    assert.equal(result.length, 4);
                    done();
                });
        });
    });

    describe('#getVehicleAttributes()', function () {
        it('should return 3521CF8B', function (done) {
            vocSession.getVehicleAttributes(config.credentials.vin)
                .then(function (result) {
                    assert.equal(result.engineCode, '3521CF8B');
                    done();
                });
        });
    });

    describe('#getVehiclePosition()', function () {
        it('should return a number', function (done) {
            vocSession.getVehiclePosition(config.credentials.vin)
                .then(function (result) {
                    assert.equal(isNaN(result.longitude), false);
                    done();
                });
        });
    });
    
    describe('#getVehicleStatusFromCloud()', function () {
        it('should return a number', function (done) {
            vocSession.getVehicleStatusFromCloud(config.credentials.vin)
                .then(function (result) {
                    assert.equal(isNaN(result.odometer), false);
                    done();
                });
        });
    });

});

