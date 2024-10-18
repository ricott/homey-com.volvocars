'use strict';
const http = require('http.min');
const util = require('util');
const config = require('./const.js');


class AuthHandler {
    constructor(vccLoginToken) {
        this.vccLoginToken = vccLoginToken;
    }

    async authorize(username, password) {
        console.log(`[${username}] Starting auth process ...`);
        try {
            let response = await this.#startAuthProcess();

            let authState = response.data.status;
            console.log(`[${username}] Auth state '${authState}'`);
            if (authState == config.authState.USERNAME_PASSWORD_REQUIRED) {
                console.log(`[${username}] Verifying username/password`);

                response = await this.#verifyUsernamePassword({
                    path: response.data._links.checkUsernamePassword.href,
                    cookie: response.cookie,
                    username: username,
                    password: password
                });

                authState = response.data.status;
                console.log(`[${username}] Second auth state '${authState}'`);
                if (authState == config.authState.OTP_REQUIRED) {
                    console.log(`[${username}] OTP required ...`);
                    return Promise.resolve({
                        authState: authState,
                        response: response
                    });
                } else {
                    return Promise.reject(new Error(`Unkown auth state '${authState}'`));
                }
            } else {
                return Promise.resolve({
                    authState: authState,
                    response: response
                });
            }
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    async #startAuthProcess() {
        const options = {
            timeout: config.apiTimeout,
            protocol: config.apiProtocol,
            hostname: config.oAuthDomain,
            path: '/as/authorization.oauth2',
            json: true,
            headers: {
                'Authorization': this.vccLoginToken,
                'User-Agent': 'vca-android/3.57.0',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json; charset=utf-8'
            },
            query: {
                'client_id': 'h4Yf0b',
                'response_type': 'code',
                'acr_values': 'urn:volvoid:aal:bronze:2sv',
                'response_mode': 'pi.flow',
                'scope': 'openid email profile care_by_volvo:financial_information:invoice:read care_by_volvo:financial_information:payment_method care_by_volvo:subscription:read customer:attributes customer:attributes:write order:attributes vehicle:attributes tsp_customer_api:all conve:brake_status conve:climatization_start_stop conve:command_accessibility conve:commands conve:diagnostics_engine_status conve:diagnostics_workshop conve:doors_status conve:engine_status conve:environment conve:fuel_status conve:honk_flash conve:lock conve:lock_status conve:navigation conve:odometer_status conve:trip_statistics conve:tyre_status conve:unlock conve:vehicle_relation conve:warnings conve:windows_status energy:battery_charge_level energy:charging_connection_status energy:charging_system_status energy:electric_range energy:estimated_charging_time energy:recharge_status vehicle:attributes'
            },
            json: true
        };

        return http.get(options)
            .then(function (result) {
                if (result.response.statusCode === 200) {
                    return {
                        cookie: result.response.headers['set-cookie'],
                        data: result.data
                    };
                } else {
                    let message;
                    try {
                        message = util.inspect(result.data, { showHidden: false, depth: null });
                    } catch (e) {
                        message = result.data;
                    }
                    let msg = `_authorize failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                    return Promise.reject(new Error(msg));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    async #verifyUsernamePassword(inputOptions) {
        let options = {
            timeout: config.apiTimeout,
            protocol: config.apiProtocol,
            hostname: config.oAuthDomain,
            path: `${inputOptions.path}?action=checkUsernamePassword`,
            json: true,
            headers: {
                'Authorization': this.vccLoginToken,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'x-xsrf-header': 'PingFederate',
                'Cookie': inputOptions.cookie
            },
            json: {
                username: inputOptions.username,
                password: inputOptions.password
            }
        };

        return http.post(options)
            .then(function (result) {
                if (result.response.statusCode === 200) {
                    return {
                        cookie: result.response.headers['set-cookie'],
                        data: result.data
                    };
                } else {
                    let message;
                    try {
                        message = util.inspect(result.data, { showHidden: false, depth: null });
                    } catch (e) {
                        message = result.data;
                    }
                    let msg = `_verifyUsernamePassword failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                    return Promise.reject(new Error(msg));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    async verifyOtp(path, cookie, otp) {
        try {
            let response = await this.#verifyOtp({
                path: path,
                cookie: cookie,
                otp: otp
            });

            response = await this.#continueAuth({
                path: response.data._links.continueAuthentication.href,
                cookie: response.cookie
            });

            response = await this.#getToken({
                code: response.data.authorizeResponse.code,
                cookie: response.cookie
            });

            return Promise.resolve(response);

        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    async #continueAuth(inputOptions) {
        const options = {
            timeout: config.apiTimeout,
            protocol: config.apiProtocol,
            hostname: config.oAuthDomain,
            path: inputOptions.path,
            json: true,
            headers: {
                'Authorization': this.vccLoginToken,
                'User-Agent': 'vca-android/3.57.0',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json; charset=utf-8',
                'x-xsrf-header': 'PingFederate',
                'Cookie': inputOptions.cookie
            },
            query: {
                'action': 'continueAuthentication'
            }
        };

        return http.get(options)
            .then(function (result) {
                if (result.response.statusCode === 200) {
                    return {
                        cookie: result.response.headers['set-cookie'],
                        data: result.data
                    };
                } else {
                    let message;
                    try {
                        message = util.inspect(result.data, { showHidden: false, depth: null });
                    } catch (e) {
                        message = result.data;
                    }
                    let msg = `continueAuth failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                    return Promise.reject(new Error(msg));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    async #verifyOtp(inputOptions) {
        let options = {
            timeout: config.apiTimeout,
            protocol: config.apiProtocol,
            hostname: config.oAuthDomain,
            path: `${inputOptions.path}?action=checkOtp`,
            json: true,
            headers: {
                'Authorization': this.vccLoginToken,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'x-xsrf-header': 'PingFederate',
                'Cookie': inputOptions.cookie
            },
            json: {
                otp: inputOptions.otp
            }
        };

        return http.post(options)
            .then(function (result) {
                if (result.response.statusCode === 200) {
                    return {
                        cookie: result.response.headers['set-cookie'],
                        data: result.data
                    };
                } else {
                    let message;
                    try {
                        message = util.inspect(result.data, { showHidden: false, depth: null });
                    } catch (e) {
                        message = result.data;
                    }
                    let msg = `verifyOtp failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                    return Promise.reject(new Error(msg));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    async #getToken(inputOptions) {
        let options = {
            timeout: config.apiTimeout,
            protocol: config.apiProtocol,
            hostname: config.oAuthDomain,
            path: '/as/token.oauth2',
            json: true,
            headers: {
                'Authorization': this.vccLoginToken,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'x-xsrf-header': 'PingFederate',
                'Cookie': inputOptions.cookie
            },
            form: {
                code: inputOptions.code,
                grant_type: 'authorization_code'
            }
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
                    let msg = `getToken failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                    return Promise.reject(new Error(msg));
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

}
module.exports = AuthHandler;
