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

    getVehicles() {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getVehicleInfo(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getWindowState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/windows`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getDoorState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/doors`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getOdometerState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/odometer`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getTyreState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/tyres`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getEngineState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/engine-status`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getFuelBatteryState(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/fuel`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
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

    getBatteryChargeLevel(vin) {
        return this.#invoke('get', `/energy/v1/vehicles/${vin}/recharge-status/battery-charge-level`)
            .then(result => {
                if (result?.data?.batteryChargeLevel?.value &&
                    !isNaN(result?.data?.batteryChargeLevel?.value)) {
                    return Promise.resolve({
                        chargeLevel: parseFloat(result?.data?.batteryChargeLevel?.value),
                        timestamp: result?.data?.batteryChargeLevel?.timestamp
                    });
                } else {
                    return null;
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getChargingSystemStatus(vin) {
        return this.#invoke('get', `/energy/v1/vehicles/${vin}/recharge-status/charging-system-status`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
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

    getVehicleDiagnostic(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/diagnostics`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getVehicleWarnings(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/warnings`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getVehicleStatistics(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/statistics`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    listAvailableCommands(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/commands`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    isVehicleAccessibleForCommands(vin) {
        return this.#invoke('get', `/connected-vehicle/v2/vehicles/${vin}/command-accessibility`)
            .then(result => {
                if (result.data.availabilityStatus.value == 'AVAILABLE') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getVehicleLocation(vin) {
        return this.#invoke('get', `/location/v1/vehicles/${vin}/location`)
            .then(result => {
                return Promise.resolve(result);
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    lock(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/lock`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    lockReducedGuard(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/lock-reduced-guard`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    unlock(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/unlock`, { unlockDuration: 120 })
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    startClimatization(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-start`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    stopClimatization(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-stop`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    flash(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/flash`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    honk(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/honk`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    honkAndFlash(vin) {
        return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/honk-flash`)
            .then(result => {
                if (this.#isInvokeStatusOk(result)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    // startEngine(vin) {
    //     return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/engine-start`, { runtimeMinutes: 15 })
    //         .then(result => {
    //             if (this.#isInvokeStatusOk(result)) {
    //                 return true;
    //             } else {
    //                 return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
    //             }
    //         })
    //         .catch(reason => {
    //             return Promise.reject(reason);
    //         });
    // }

    // stopEngine(vin) {
    //     return this.#invoke('post', `/connected-vehicle/v2/vehicles/${vin}/commands/engine-stop`)
    //         .then(result => {
    //             if (this.#isInvokeStatusOk(result)) {
    //                 return true;
    //             } else {
    //                 return Promise.reject(new Error(`Command returned status '${result.data.invokeStatus}'`));
    //             }
    //         })
    //         .catch(reason => {
    //             return Promise.reject(reason);
    //         });
    // }

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
                const responseText = await response.text();
                try {
                    let json = JSON.parse(responseText);
                    json.statusCode = response.status;
                    return Promise.resolve(json);
                } catch (error) {
                    return Promise.resolve(responseText);
                }
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

                return Promise.reject(new Error(errorMessage));
            }
        } catch (error) {
            if (error.name === 'TimeoutError') {
                return Promise.reject(new Error(`Request timeout after ${config.apiTimeout}ms`));
            }
            return Promise.reject(error);
        }
    }

}
module.exports = ConnectedVehicle;