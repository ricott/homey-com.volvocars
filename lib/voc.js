'use strict';
const { v1: uuidv1 } = require('uuid');
const EventEmitter = require('node:events');
const config = require('./const.js');

const apiDomains = {
    eu: 'vocapi.wirelesscar.net',
    na: 'vocapi-na.wirelesscar.net',
    cn: 'vocapi-cn.wirelesscar.net'
};
const apiEndpoint = '/customerapi/rest/v3.0/';
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

    async login() {
        try {
            const result = await this.#vocApiRequest('GET', 'customeraccounts');
            if (result.errorLabel) {
                throw new Error('invalid_user_password');
            }
            return result;
        } catch (error) {
            throw new Error('invalid_user_password');
        }
    }

    async getVehicleAttributes(vehicleId) {
        const vehicles = await this.#getVehicleAttributes([vehicleId]);
        this.emit('car_attributes_update', vehicles[0]);
        return vehicles[0];
    }

    async getVehicleStatusFromCloud(vehicleId) {
        const vehicle = await this.#vocApiRequest('GET', `vehicles/${vehicleId}/status`);
        this.emit('car_status_update', vehicle);
        return vehicle;
    }

    async getVehicleChargeLocations(vehicleId) {
        const data = await this.#vocApiRequest('GET', `vehicles/${vehicleId}/chargeLocations?status=Accepted`);
        const locations = data.chargingLocations || data;
        this.emit('car_charge_locations', locations);
        return locations;
    }

    async getVehiclePosition(vehicleId) {
        const data = await this.#vocApiRequest('GET', 
            `vehicles/${vehicleId}/position?client_longitude=0.000000&client_precision=0.000000&client_latitude=0.000000`);
        const position = data.position;
        this.emit('car_position_update', position);
        return position;
    }

    async refreshVehicleStatusFromCar(vehicleId) {
        const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/updatestatus`, vehicleId);
        this.emit('car_refreshed_status', result);
        return result;
    }

    async startHeater(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/heater/start`, vehicleId, {});
            this.emit(refreshEventName, { action: 'startHeater', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async stopHeater(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/heater/stop`, vehicleId, null);
            this.emit(refreshEventName, { action: 'stopHeater', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async startPreClimatization(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/preclimatization/start`, vehicleId, {});
            this.emit(refreshEventName, { action: 'startPreClimatization', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async stopPreClimatization(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/preclimatization/stop`, vehicleId, null);
            this.emit(refreshEventName, { action: 'stopPreClimatization', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async lock(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/lock`, vehicleId, {});
            this.emit(refreshEventName, { action: 'lock', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async unlock(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/unlock`, vehicleId, null);
            this.emit(refreshEventName, { action: 'unlock', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async startEngine(vehicleId, duration) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/engine/start`, vehicleId, { runtime: duration });
            this.emit(refreshEventName, { action: 'startEngine', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async stopEngine(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/engine/stop`, vehicleId, null);
            this.emit(refreshEventName, { action: 'stopEngine', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async startCharging(vehicleId) {
        try {
            const result = await this.#postWaitForResponse(`vehicles/${vehicleId}/rbm/overrideDelayCharging`, vehicleId, null);
            this.emit(refreshEventName, { action: 'startCharging', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async delayCharging(vehicleId, chargeLocationId, payload) {
        try {
            const status = await this.#vocApiRequest('PUT', 
                `vehicles/${vehicleId}/chargeLocations/${chargeLocationId}`, 
                payload, 
                'application/vnd.wirelesscar.com.voc.ChargeLocation.v4');
            
            if (status.service) {
                const result = await this.#awaitSuccessfulServiceInvocation(vehicleId, status.customerServiceId);
                this.emit(refreshEventName, { action: 'delayCharging', result: result });
                return result;
            } else {
                this.emit(refreshEventName, { action: 'delayCharging', result: status });
                return status;
            }
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async #getRelationLinks() {
        const data = await this.#vocApiRequest('GET', 'customeraccounts');
        const relationLinks = [];
        data.accountVehicleRelations.forEach(link => {
            let command = link.substring(link.indexOf('/vehicle-account-relations') + 1);
            relationLinks.push(command);
        });
        return relationLinks;
    }

    async #getVehicleIds(relationLinks) {
        const promises = relationLinks.map(async (command) => {
            const result = await this.#vocApiRequest('GET', command);
            return result.vehicleId;
        });
        return await Promise.all(promises);
    }

    async #getVehicleAttributes(vehicleIds) {
        const promises = vehicleIds.map(async (vehicleId) => {
            return await this.#vocApiRequest('GET', `vehicles/${vehicleId}/attributes`);
        });
        return await Promise.all(promises);
    }

    async listVehiclesOnAccount() {
        try {
            const relationLinks = await this.#getRelationLinks();
            const vehicleIds = await this.#getVehicleIds(relationLinks);
            const vehicles = await this.#getVehicleAttributes(vehicleIds);

            const devices = vehicles.map(vehicle => {
                let registrationNumber = '';
                if (vehicle.registrationNumber) {
                    registrationNumber = ` / ${vehicle.registrationNumber}`;
                }
                return {
                    name: `${vehicle.vehicleType} / ${vehicle.modelYear}${registrationNumber}`,
                    data: {
                        id: vehicle.vin,
                        ice: true,
                        vehicleType: vehicle.vehicleType
                    },
                    store: {
                        username: this.options.username,
                        password: this.options.password
                    }
                };
            });

            this.emit('account_devices_found', devices);
            return devices;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async honkHornAndBlinkLights(vehicleId, latitude, longitude) {
        try {
            const result = await this.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/both`, vehicleId, latitude, longitude);
            this.emit(refreshEventName, { action: 'honkHornAndBlinkLights', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async honkHorn(vehicleId, latitude, longitude) {
        try {
            const result = await this.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/horn`, vehicleId, latitude, longitude);
            this.emit(refreshEventName, { action: 'honkHorn', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async blinkLights(vehicleId, latitude, longitude) {
        try {
            const result = await this.#postWithPositionWaitForResponse(`vehicles/${vehicleId}/honk_blink/lights`, vehicleId, latitude, longitude);
            this.emit(refreshEventName, { action: 'blinkLights', result: result });
            return result;
        } catch (error) {
            this.emit(apiErrorEventName, error);
            throw error;
        }
    }

    async #awaitSuccessfulServiceInvocation(vehicleId, serviceId) {
        if (!serviceId) throw new Error('ServiceId is null!');

        await runFor(() => this.#getServiceInvocationStatus(vehicleId, serviceId), 1000, this);
        const result = this._serviceInvocationSuccess;
        this._serviceInvocationSuccess = false;
        return result;
    }

    async #getServiceInvocationStatus(vehicleId, serviceId) {
        const data = await this.#vocApiRequest('GET', `vehicles/${vehicleId}/services/${serviceId}`);
        if (!data) throw new Error('getServiceInvocationStatus, api_error');
        
        const failureReason = data.failureReason || 'none';
        console.log(`Service invocation status '${data.status}', with failure reason '${failureReason}'`);
        if (failureReason !== 'none') {
            this.emit(apiErrorEventName, data);
        }

        return data.status;
    }

    async #vocApiRequest(method, path, data = null, contentType = 'application/json') {
        let options = {
            method: method.toUpperCase(),
            signal: AbortSignal.timeout(config.apiTimeout),
            headers: {
                'X-Client-Version': apiXClientVersion,
                'Accept-Encoding': 'br, gzip, deflate',
                'Accept-Language': 'en-us',
                'Content-Type': contentType === 'application/json' ? 
                    'application/json; charset=utf-8' : 
                    `${contentType}+json; charset=utf-8`,
                'X-Request-Id': uuidv1().toUpperCase(),
                'User-Agent': apiUserAgent,
                'X-Os-Type': 'iPhone OS',
                'X-Device-Id': this.options.uuid,
                'X-Os-Version': apiXOSVersion,
                'X-Originator-Type': 'app',
                'Accept': '*/*',
                'Authorization': 'Basic ' + Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64')
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const url = `https://${apiDomains[this.options.region]}${apiEndpoint}${path}`;

        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                console.error(`[VOC API Error] Failed request to: ${path}`);
                console.error(`[VOC API Error] Status: ${response.status} ${response.statusText}`);
                console.error('[VOC API Error] Request headers:', JSON.stringify(options.headers, null, 2));
                console.error('[VOC API Error] Request body:', options.body || '(no body)');
                console.error('[VOC API Error] Response headers:', JSON.stringify(Object.fromEntries([...response.headers]), null, 2));
                
                const responseText = await response.text();
                console.error('[VOC API Error] Response body:', responseText);
                
                throw new Error(`HTTP error! status: ${response.status}. Response: ${responseText}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name === 'TimeoutError') {
                throw new Error(`Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }

    async #postWaitForResponse(url, vehicleId, payload) {
        const result = await this.#vocApiRequest('POST', url, payload);
        return await this.#awaitSuccessfulServiceInvocation(vehicleId, result.customerServiceId);
    }

    async #postWithPositionWaitForResponse(url, vehicleId, latitude, longitude) {
        const result = await this.#vocApiRequest('POST', url, {
            'clientAccuracy': 0,
            'clientLatitude': latitude,
            'clientLongitude': longitude
        }, 'application/vnd.wirelesscar.com.voc.ClientPosition.v4');
        return await this.#awaitSuccessfulServiceInvocation(vehicleId, result.customerServiceId);
    }
}
module.exports = VOC;

const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));
const runFor = async (func, interval, self) => {
    let done = false;
    let counter = 0;
    while (!done && counter < 15) {
        counter++;
        await timeoutPromise(interval);
        
        const response = await func();
        if (response === 'Successful') {
            done = true;
            self._serviceInvocationSuccess = true;
        } else if (response === 'Failed') {
            console.error('Service invocation failed!');
            done = true;
        }
    }

    if (counter > 15) {
        console.error(`Service invocation didn't get a status back in '${counter}' attempts!`);
    }
}
