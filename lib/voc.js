'use strict';
const http = require('http.min');
const { v1: uuidv1 } = require('uuid');
const EventEmitter = require('events');

const apiProtocol = 'https:';
const apiDomains = {
    eu: 'vocapi.wirelesscar.net',
    na: 'vocapi-na.wirelesscar.net',
    cn: 'vocapi-cn.wirelesscar.net'
};
const apiEndpoint = '/customerapi/rest/v3.0/';
const apiTimeout = 10000;
const apiXClientVersion = '4.6.9.264685';
const apiUserAgent = 'Volvo%20On%20Call/4.6.9.264685 CFNetwork/1120 Darwin/19.0.0';
const apiXOSVersion = '13.3.1';
const apiErrorEventName = 'voc_api_error';
const refreshEventName = 'car_action_status';

class VOC extends EventEmitter {
    constructor(options) {
        super();
        if (options == null) { options = {} };
        //Options should contain
        //username, password, region, uuid
        this.options = options;
        //Used for service invocations to check for result of invocation
        this._serviceInvocationSuccess = false;
    }

    login = function () {
        return getVOCCommand(this.options, 'customeraccounts')
            .then(function (result) {
                if (result.errorLabel) {
                    return Promise.reject('invalid_user_password');
                }
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject('invalid_user_password');
            });
    }

    getVehicleAttributes = function (vehicleId) {
        let self = this;
        return getVehicleAttributes(self.options, [vehicleId])
            .then(function (vehicles) {
                self.emit('car_attributes_update', vehicles[0]);
                return Promise.resolve(vehicles[0]);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    getVehicleStatusFromCloud = function (vehicleId) {
        let self = this;
        return getVOCCommand(self.options, `vehicles/${vehicleId}/status`)
            .then(function (vehicle) {
                self.emit('car_status_update', vehicle);
                return Promise.resolve(vehicle);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    getVehicleChargeLocations = function (vehicleId) {
        let self = this;
        return getVOCCommand(self.options, `vehicles/${vehicleId}/chargeLocations?status=Accepted`)
            .then(function (data) {
                const locations = data.chargingLocations || data;
                self.emit('car_charge_locations', locations);
                return Promise.resolve(locations);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    getVehiclePosition = function (vehicleId) {
        let self = this;
        return getVOCCommand(self.options,
            `vehicles/${vehicleId}/position?client_longitude=0.000000&client_precision=0.000000&client_latitude=0.000000`)
            .then(function (data) {
                const position = data.position;
                self.emit('car_position_update', position);
                return Promise.resolve(position);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    refreshVehicleStatusFromCar = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/updatestatus`, vehicleId)
            .then(function (result) {
                self.emit('car_refreshed_status', result);
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    startHeater = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/heater/start`, vehicleId, {})
            .then(function (result) {
                self.emit(refreshEventName, { action: 'startHeater', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    stopHeater = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/heater/stop`, vehicleId, null)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'stopHeater', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    startPreClimatization = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/preclimatization/start`, vehicleId, {})
            .then(function (result) {
                self.emit(refreshEventName, { action: 'startPreClimatization', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    stopPreClimatization = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/preclimatization/stop`, vehicleId, null)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'stopPreClimatization', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    lock = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/lock`, vehicleId, {})
            .then(function (result) {
                self.emit(refreshEventName, { action: 'lock', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    unlock = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/unlock`, vehicleId, null)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'unlock', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    startEngine = function (vehicleId, duration) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/engine/start`, vehicleId, { runtime: duration })
            .then(function (result) {
                self.emit(refreshEventName, { action: 'startEngine', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    stopEngine = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/engine/stop`, vehicleId, null)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'stopEngine', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    startCharging = function (vehicleId) {
        let self = this;
        return self.#postWaitForResponse(`vehicles/${vehicleId}/rbm/overrideDelayCharging`, vehicleId, null)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'startCharging', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    delayCharging = function (vehicleId, chargeLocationId, payload) {
        let self = this;
        return putVOCCommand(self.options, `vehicles/${vehicleId}/chargeLocations/${chargeLocationId}`, payload)
            .then(function (status) {
                //If data sent equals data in cloud, then no service id is sent
                //also customerServiceId is not included, have to fetch it from the url
                if (status.service) {
                    return awaitSuccessfulServiceInvocation(self, vehicleId, result.customerServiceId)
                        .then(function (result) {
                            self.emit(refreshEventName, { action: 'delayCharging', result: result });
                            return Promise.resolve(result);
                        })
                        .catch(reason => {
                            return Promise.reject(reason);
                        });
                } else {
                    self.emit(refreshEventName, { action: 'delayCharging', result: status });
                    return Promise.resolve(status);
                }
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    listVehiclesOnAccount = function () {
        var self = this;
        return getRelationLinks(self.options)
            .then(function (relationLinks) {
                return getVehicleIds(self.options, relationLinks);
            })
            .then(function (vehicleIds) {
                return getVehicleAttributes(self.options, vehicleIds)
                    .catch(reason => {
                        return Promise.reject(reason);
                    });
            })
            .then(function (vehicles) {
                let devices = [];
                vehicles.forEach(vehicle => {
                    let registrationNumber = '';
                    if (vehicle.registrationNumber) {
                        registrationNumber = ` / ${vehicle.registrationNumber}`;
                    }
                    devices.push({
                        name: `${vehicle.vehicleType} / ${vehicle.modelYear}${registrationNumber}`,
                        data: {
                            id: vehicle.vin,
                            ice: true,
                            vehicleType: vehicle.vehicleType
                        },
                        store: {
                            username: self.options.username,
                            password: self.options.password
                        }
                    });
                });

                self.emit('account_devices_found', devices);
                return devices;
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    honkHornAndBlinkLights = function (vehicleId, latitude, longitude) {
        let self = this;
        return self.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/both`, vehicleId, latitude, longitude)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'honkHornAndBlinkLights', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    honkHorn = function (vehicleId, latitude, longitude) {
        let self = this;
        return self.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/horn`, vehicleId, latitude, longitude)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'honkHorn', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    blinkLights = function (vehicleId, latitude, longitude) {
        let self = this;
        return self.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/lights`, vehicleId, latitude, longitude)
            .then(function (result) {
                self.emit(refreshEventName, { action: 'blinkLights', result: result });
                return Promise.resolve(result);
            })
            .catch(reason => {
                self.emit(apiErrorEventName, reason);
                return Promise.reject(reason);
            });
    }

    #postWaitForResponse = function (url, vehicleId, payload) {
        let self = this;
        return postVOCCommand(self.options, url, payload)
            .then(function (result) {
                return awaitSuccessfulServiceInvocation(self, vehicleId, result.customerServiceId)
                    .then(function (result) {
                        return Promise.resolve(result);
                    })
                    .catch(reason => {
                        return Promise.reject(reason);
                    });
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    #postWithPositionWaitForResponse = function (url, vehicleId, latitude, longitude) {
        let self = this;
        return postVOCCommandwithPosition(self.options, url, latitude, longitude)
            .then(function (result) {
                return awaitSuccessfulServiceInvocation(self, vehicleId, result.customerServiceId)
                    .then(function (result) {
                        return Promise.resolve(result);
                    })
                    .catch(reason => {
                        return Promise.reject(reason);
                    });
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }
}
module.exports = VOC;

function getRelationLinks(options) {
    let relationLinks = [];
    return getVOCCommand(options, 'customeraccounts')
        .then(function (data) {
            data.accountVehicleRelations.forEach(link => {
                let command = link.substring(link.indexOf('/vehicle-account-relations') + 1);
                relationLinks.push(command);
            });
            return relationLinks;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

async function getVehicleIds(options, relationLinks) {
    let finalArray = relationLinks.map(async (command) => {
        const result = await getVOCCommand(options, command)
            .catch(reason => {
                return Promise.reject(reason);
            });

        return result.vehicleId;
    });
    const vehicleIds = await Promise.all(finalArray);
    return vehicleIds;
}

async function getVehicleAttributes(options, vehicleIds) {
    let finalArray = vehicleIds.map(async (vehicleId) => {
        const result = await getVOCCommand(options, `vehicles/${vehicleId}/attributes`)
            .catch(reason => {
                return Promise.reject(reason);
            });

        return result;
    });
    const tempArray = await Promise.all(finalArray);
    return tempArray;
}

const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));
const runFor = async (func, interval, self) => {
    let done = false;
    let counter = 0;
    while (!done && counter < 15) {
        counter++;
        await timeoutPromise(interval);
        await func()
            .then(function (response) {
                //console.log('Response:', response);
                if (response === 'Successful') {
                    done = true;
                    self._serviceInvocationSuccess = true;
                } else if (response === 'Failed') {
                    console.error('Service invocation failed!');
                    done = true;
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    if (counter > 15) {
        console.error(`Service invocation didn't get a status back in '${counter}' attempts!`);
    }
};

function awaitSuccessfulServiceInvocation(self, vehicleId, serviceId) {
    if (!serviceId) return Promise.reject(new Error('ServiceId is null!'));

    return runFor(() => getServiceInvocationStatus(self, vehicleId, serviceId), 1000, self)
        .then(function (response) {
            let result = self._serviceInvocationSuccess;
            self._serviceInvocationSuccess = false;
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getServiceInvocationStatus(self, vehicleId, serviceId) {
    return getVOCCommand(self.options, `vehicles/${vehicleId}/services/${serviceId}`)
        .then(function (data) {
            if (!data) return Promise.reject(new Error('getServiceInvocationStatus, api_error'));
            let failureReason = data.failureReason || 'none';
            console.log(`Service invocation status '${data.status}', with failure reason '${failureReason}'`);
            if (failureReason !== 'none') {
                self.emit(apiErrorEventName, data);
            }

            return data.status;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getVOCCommand(inputOptions, path) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    return http.json(options)
        .then(function (response) {
            return Promise.resolve(response);
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function postVOCCommand(inputOptions, path, data) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        json: true,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    if (data) {
        options.json = data;
    }

    return http.post(options)
        .then(function (response) {
            return Promise.resolve(response.data);
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function putVOCCommand(inputOptions, path, data) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        json: true,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/vnd.wirelesscar.com.voc.ChargeLocation.v4+json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    if (data) {
        options.json = data;
    }

    return http.put(options)
        .then(function (response) {
            return response.data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}