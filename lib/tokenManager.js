'use strict';
const http = require('http.min');
const util = require('util');
const config = require('./const.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

class TokenManager {
    constructor() {
        this.userTokens = {};
        this.release = null;
    }

    // We should have cached token, and password should be the same
    #isTokenAlreadyCreated(username, password) {
        const tokenObj = this.#getTokenObjectFromCache(username);
        if (tokenObj && tokenObj.password == password) {
            return true;
        } else {
            return false;
        }
    }

    #getTokenObjectFromCache(username) {
        return this.connections[username];
    }

    #cacheToken(username, password, token) {
        this.connections[username] = new EaseeToken(username, password, token);
    }

    #getTokenFromCache(username) {
        return this.#getTokenObjectFromCache(username).token;
    }

    getToken(vccLoginToken, username, password, force) {
        var self = this;
        return mutex.acquire()
            .then(function (release) {
                self.release = release;
                if (!self.#isTokenAlreadyCreated(username, password)) {
                    return generateNewToken(vccLoginToken, username, password)
                        .then(function (token) {
                            self.#cacheToken(username, password, token);
                            return Promise.resolve(self.#getTokenFromCache(username));
                        }).catch(function (reason) {
                            return Promise.reject(reason);
                        });
                } else if (force) {
                    const now = new Date().getTime();
                    const tokenAge = now - self.#getTokenObjectFromCache(username).timestamp;
                    //console.log(`[${username}] Token is from '${self.#getTokenObjectFromCache(username).timestamp}', time now '${now}'`);
                    //Even with force, if token is less than 2 mins old then ignore that request
                    if (tokenAge > (2 * 60 * 1000)) {
                        return generateNewToken(vccLoginToken, username, password)
                            .then(function (token) {
                                self.#cacheToken(username, password, token);
                                return Promise.resolve(self.#getTokenFromCache(username));
                            }).catch(function (reason) {
                                return Promise.reject(reason);
                            });
                    } else {
                        console.log(`[${username}] Create new token using force ignored, less than 2 mins old token`);
                        return Promise.resolve(self.#getTokenFromCache(username));
                    }
                } else {
                    return Promise.resolve(self.#getTokenFromCache(username));
                }
            })
            .catch(function (reason) {
                //console.log('Error getting token', reason);
                return Promise.reject(reason);
            })
            .finally(function () {
                self.release();
            });
    }
}

//Singleton
module.exports = new TokenManager();

class VolvoToken {
    constructor(vccLoginToken, username, password, token) {
        this._vccLoginToken = vccLoginToken;
        this._username = username;
        this._password = password;
        this._token = token;
        this._timestamp = new Date().getTime();

        //If refresh fails, then login from start
        this._timer = setInterval(() => {
            let self = this;
            refreshToken(self.vccLoginToken, self.username, self.token.refresh_token)
                .then(function (token) {
                    self._token = token;
                    self._timestamp = new Date().getTime();
                }).catch(function (reason) {
                    console.log(`[${self.username}] Failed to refresh token, generating new using user/password`);
                    console.error(reason);
                    generateNewToken(self.vccLoginToken, self.username, self.password)
                        .then(function (token) {
                            self._token = token;
                            self._timestamp = new Date().getTime();
                        }).catch(function (reason) {
                            console.log(`[${self.username}] Failed to generate new token, out of luck :(`);
                            console.error(reason);
                        });
                });
        }, (this.token.expires_in - 120) * 1000);
    }

    get vccLoginToken() {
        return this._vccLoginToken;
    }

    get username() {
        return this._username;
    }

    get password() {
        return this._password;
    }

    get token() {
        return Object.freeze(this._token);
    }

    get timestamp() {
        return this._timestamp;
    }
}

function refreshToken(vccLoginToken, username, refreshToken) {
    console.log(`[${username}] Refreshing access token`);
    return _refreshToken({
        vccLoginToken: vccLoginToken,
        refresh_token: refreshToken
    }).then(function (token) {
        return token;
    }).catch(function (reason) {
        console.log(reason);
        return Promise.reject(reason);
    });
}

function generateNewToken(vccLoginToken, username, password) {
    console.log(`[${username}] Generating new access token`);
    return _login({
        vccLoginToken: vccLoginToken,
        username: username,
        password: password
    }).then(function (token) {
        return token;
    }).catch(function (reason) {
        console.log(reason);
        return Promise.reject(reason);
    });
}

function _refreshToken(inputOptions) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.oAuthDomain,
        path: '/as/token.oauth2',
        json: true,
        headers: {
            'authorization': inputOptions.vccLoginToken,
            'content-type': 'application/x-www-form-urlencoded',
            'accept': 'application/json'
        },
        form: {
            refresh_token: inputOptions.refresh_token,
            grant_type: 'refresh_token'
        },
        json: true
    };

    return http.post(options)
        .then(function (result) {
            if (result.response.statusCode === 200) {
                return result.data;
            } else {
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                let msg = `Refresh token failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                return Promise.reject(new Error(msg));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function _login(inputOptions) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.oAuthDomain,
        path: '/as/token.oauth2',
        json: true,
        headers: {
            'authorization': inputOptions.vccLoginToken,
            'content-type': 'application/x-www-form-urlencoded',
            'accept': 'application/json',
        },
        form: {
            username: inputOptions.username,
            password: inputOptions.password,
            grant_type: 'password',
            scope: 'openid email profile care_by_volvo:financial_information:invoice:read care_by_volvo:financial_information:payment_method care_by_volvo:subscription:read customer:attributes customer:attributes:write order:attributes vehicle:attributes tsp_customer_api:all conve:brake_status conve:climatization_start_stop conve:command_accessibility conve:commands conve:diagnostics_engine_status conve:diagnostics_workshop conve:doors_status conve:engine_status conve:environment conve:fuel_status conve:honk_flash conve:lock conve:lock_status conve:navigation conve:odometer_status conve:trip_statistics conve:tyre_status conve:unlock conve:vehicle_relation conve:warnings conve:windows_status energy:battery_charge_level energy:charging_connection_status energy:charging_system_status energy:electric_range energy:estimated_charging_time energy:recharge_status vehicle:attributes'
        },
        json: true
    };

    return http.post(options)
        .then(function (result) {
            if (result.response.statusCode === 200) {
                return result.data;
            } else {
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                let msg = `Login failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                return Promise.reject(new Error(msg));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}