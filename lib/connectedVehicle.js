'use strict';
const HomeyEventEmitter = require('./homeyEventEmitter.js');
const config = require('./const.js');

class ConnectedVehicle extends HomeyEventEmitter {
    constructor(options) {
        super();
        if (options == null) { options = {} };
        // Options should contain
        // vccApiKey, accessToken
        this.options = options;
    }

    async getVehicles() {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles`);
    }

    async getVehicleInfo(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}`);
    }

    async getWindowState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/windows`);
    }

    async getDoorState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/doors`);
    }

    async getOdometerState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/odometer`);
    }

    async getTyreState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/tyres`);
    }

    async getEngineState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/engine-status`);
    }

    async getFuelBatteryState(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/fuel`);
    }

    // getRechargeState(vin) {
    //     return this.#invoke('get', `/energy/v1/vehicles/${vin}/recharge-status`)
    //         .then(result => {
    //             return Promise.resolve(result);
    //         })
    //         .catch(reason => {
    //             return Promise.reject(reason);
    //         });
    // }

    async getBatteryChargeLevel(vin) {
        const result = await this.#invoke('get', `/energy/v1/vehicles/${vin}/recharge-status/battery-charge-level`);
        if (result?.data?.batteryChargeLevel?.value &&
            !isNaN(result?.data?.batteryChargeLevel?.value)) {
            return {
                chargeLevel: parseFloat(result?.data?.batteryChargeLevel?.value),
                timestamp: result?.data?.batteryChargeLevel?.timestamp
            };
        }
        return null;
    }

    async getChargingSystemStatus(vin) {
        return await this.#invoke('get', `/energy/v1/vehicles/${vin}/recharge-status/charging-system-status`);
    }

    // getEngineDiagnostic(vin) {
    //     return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/engine`)
    //         .then(result => {
    //             return Promise.resolve(result);
    //         })
    //         .catch(reason => {
    //             return Promise.reject(reason);
    //         });
    // }

    async getVehicleDiagnostic(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/diagnostics`);
    }

    async getVehicleWarnings(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/warnings`);
    }

    async getVehicleStatistics(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/statistics`);
    }

    async listAvailableCommands(vin) {
        return await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/commands`);
    }

    async isVehicleAccessibleForCommands(vin) {
        const result = await this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/command-accessibility`);
        if (result.data.availabilityStatus.value == 'AVAILABLE') {
            return true;
        }
        return false;
    }

    async getVehicleLocation(vin) {
        return await this.#invoke('get', `/location/v1/vehicles/${vin}/location`);
    }

    async lock(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/lock`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async lockReducedGuard(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/lock-reduced-guard`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async unlock(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/unlock`, { unlockDuration: 120 });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async startClimatization(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-start`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async stopClimatization(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-stop`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async flash(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/flash`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honk(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/honk`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honkAndFlash(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/honk-flash`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async startEngine(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/engine-start`, { runtimeMinutes: 15 });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async stopEngine(vin) {
        const result = await this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/engine-stop`);
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    #isInvokeStatusOk(result) {
        const status = result?.data?.invokeStatus || 'unknown';

        switch (status) {
            case 'COMPLETED':
            case 'RUNNING':
            case 'DELIVERED':
            case 'WAITING':
                return true;
            default:
                return false;
        }
    }

    async #invoke(method, path, data) {
        const options = {
            method: method.toUpperCase(),
            signal: AbortSignal.timeout(config.apiTimeout),
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': '*/*',
                'Authorization': `Bearer ${this.options.accessToken}`,
                'vcc-api-key': this.options.vccApiKey
            }
        };

        if (data && method.toLowerCase() === 'post') {
            options.body = JSON.stringify(data);
        }

        const url = `https://${config.apiDomain}${path}`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                let json = await response.json();
                json.statusCode = response.status;
                return json;
            } else {
                let json = {};
                try {
                    json = await response.json();
                    json.api = {
                        method: method,
                        path: path,
                        httpStatusCode: response.status
                    };
                    this.emit('error', json);
                } catch (ignore) { }

                let errorMessage = `${method} '${path}': HTTP status code '${response.status}'`;
                if (json.error?.message) {
                    errorMessage = `${errorMessage}. Volvo API error message: ${json.error.message}`;
                }

                throw new Error(errorMessage);
            }
        } catch (error) {
            if (error.name === 'TimeoutError') {
                throw new Error(`Request timeout after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }
}

module.exports = ConnectedVehicle;