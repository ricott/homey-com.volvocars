'use strict';

const util = require('util');
const config = require('./const.js');

class AuthHandler {
    constructor(vccLoginToken) {
        this.vccLoginToken = vccLoginToken;
        this.username = null;
    }

    async authorize(username, password) {
        this.username = username;
        console.log(`[${this.username}] Starting auth process ...`);
        try {
            let response = await this.#startAuthProcess();

            let authState = response.data.status;
            console.log(`[${this.username}] Auth state '${authState}'`);
            if (authState == config.authState.USERNAME_PASSWORD_REQUIRED) {
                console.log(`[${this.username}] Verifying username/password`);

                response = await this.#verifyUsernamePassword({
                    path: response.data._links.checkUsernamePassword.href,
                    cookie: response.cookie,
                    username: this.username,
                    password: password
                });

                authState = response.data.status;
                console.log(`[${this.username}] Second auth state '${authState}'`);

                if (authState == config.authState.OTP_REQUIRED) {
                    console.log(`[${this.username}] OTP required ...`);
                    return Promise.resolve({
                        authState: authState,
                        response: response
                    });
                } else {
                    return Promise.reject(new Error(`Unknown auth state '${authState}'`));
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
            method: 'GET',
            headers: {
                'Authorization': this.vccLoginToken,
                'X-XSRF-Header': 'PingFederate',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json; charset=utf-8'
            },
            signal: AbortSignal.timeout(config.apiTimeout)
        };

        const queryParams = new URLSearchParams({
            'client_id': 'h4Yf0b',
            'response_type': 'code',
            'acr_values': 'urn:volvoid:aal:bronze:2sv',
            'response_mode': 'pi.flow',
            'scope': 'openid email profile care_by_volvo:financial_information:invoice:read care_by_volvo:financial_information:payment_method care_by_volvo:subscription:read customer:attributes customer:attributes:write order:attributes vehicle:attributes tsp_customer_api:all conve:brake_status conve:climatization_start_stop conve:command_accessibility conve:commands conve:diagnostics_engine_status conve:diagnostics_workshop conve:doors_status conve:engine_status conve:environment conve:fuel_status conve:honk_flash conve:lock conve:lock_status conve:navigation conve:odometer_status conve:trip_statistics conve:tyre_status conve:unlock conve:vehicle_relation conve:warnings conve:windows_status energy:battery_charge_level energy:charging_connection_status energy:charging_system_status energy:electric_range energy:estimated_charging_time energy:recharge_status vehicle:attributes'
        });

        const url = `https://${config.oAuthDomain}/as/authorization.oauth2?${queryParams}`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                const data = await response.json();
                return {
                    cookie: response.headers.get('set-cookie'),
                    data: data
                };
            } else {
                let message;
                try {
                    const errorData = await response.json();
                    message = util.inspect(errorData, { showHidden: false, depth: null });
                } catch (e) {
                    message = await response.text();
                }
                throw new Error(`_authorize failed! Call '/as/authorization.oauth2' failed, HTTP status code '${response.status}', and message '${message}'`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`_authorize failed: Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }

    async #verifyUsernamePassword(inputOptions) {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': this.vccLoginToken,
                'X-XSRF-Header': 'PingFederate',
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'Cookie': inputOptions.cookie
            },
            body: JSON.stringify({
                username: inputOptions.username,
                password: inputOptions.password
            }),
            signal: AbortSignal.timeout(config.apiTimeout)
        };

        // Ensure HTTPS is used instead of HTTP
        const securePath = inputOptions.path.replace(/^http:/, 'https:');
        const url = `${securePath}?action=checkUsernamePassword`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                const data = await response.json();
                return {
                    cookie: response.headers.get('set-cookie'),
                    data: data
                };
            } else {
                let message;
                try {
                    const errorData = await response.json();
                    message = util.inspect(errorData, { showHidden: false, depth: null });
                } catch (e) {
                    message = await response.text();
                }
                throw new Error(`_verifyUsernamePassword failed! Call '${inputOptions.path}' failed, HTTP status code '${response.status}', and message '${message}'`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`_verifyUsernamePassword failed: Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }

    async verifyOtp(path, cookie, otp, username) {
        // Set username for logging purposes
        this.username = username || this.username;

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
            method: 'GET',
            headers: {
                'Authorization': this.vccLoginToken,
                'X-XSRF-Header': 'PingFederate',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json; charset=utf-8',
                'Cookie': inputOptions.cookie
            },
            signal: AbortSignal.timeout(config.apiTimeout)
        };

        // Ensure HTTPS is used instead of HTTP
        const securePath = inputOptions.path.replace(/^http:/, 'https:');
        const url = `${securePath}?action=continueAuthentication`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                console.log(`[${this.username}] Continue auth successful`);
                const data = await response.json();
                return {
                    cookie: response.headers.get('set-cookie'),
                    data: data
                };
            } else {
                let message;
                try {
                    const errorData = await response.json();
                    message = util.inspect(errorData, { showHidden: false, depth: null });
                } catch (e) {
                    message = await response.text();
                }
                throw new Error(`continueAuth failed! Call '${inputOptions.path}' failed, HTTP status code '${response.status}', and message '${message}'`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`continueAuth failed: Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }

    async #verifyOtp(inputOptions) {
        // Parse and clean up cookies
        const cookies = inputOptions.cookie.split(',')
            .map(c => c.trim())
            .filter(c => c.startsWith('PF=') || c.startsWith('PF.PERSISTENT='))
            .join('; ');

        const options = {
            method: 'POST',
            headers: {
                'Authorization': this.vccLoginToken,
                'X-XSRF-Header': 'PingFederate',
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'Cookie': cookies
            },
            body: JSON.stringify({
                otp: inputOptions.otp
            }),
            signal: AbortSignal.timeout(config.apiTimeout)
        };

        // Ensure HTTPS is used instead of HTTP
        const securePath = inputOptions.path.replace(/^http:/, 'https:');
        const url = `${securePath}?action=checkOtp`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                console.log(`[${this.username}] OTP verification successful`);
                const data = await response.json();
                return {
                    cookie: response.headers.get('set-cookie'),
                    data: data
                };
            } else {
                let message;
                try {
                    const errorData = await response.json();
                    message = util.inspect(errorData, { showHidden: false, depth: null });
                } catch (e) {
                    message = await response.text();
                }
                throw new Error(`verifyOtp failed! Call '${inputOptions.path}' failed, HTTP status code '${response.status}', and message '${message}'`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`verifyOtp failed: Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }

    async #getToken(inputOptions) {
        const formData = new URLSearchParams();
        formData.append('code', inputOptions.code);
        formData.append('grant_type', 'authorization_code');

        const options = {
            method: 'POST',
            headers: {
                'Authorization': this.vccLoginToken,
                'X-XSRF-Header': 'PingFederate',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Cookie': inputOptions.cookie
            },
            body: formData,
            signal: AbortSignal.timeout(config.apiTimeout)
        };

        const url = `https://${config.oAuthDomain}/as/token.oauth2`;

        try {
            const response = await fetch(url, options);

            if (response.ok) {
                console.log(`[${this.username}] Token received`);
                return response.json();
            } else {
                let message;
                try {
                    const errorData = await response.json();
                    message = util.inspect(errorData, { showHidden: false, depth: null });
                } catch (e) {
                    message = await response.text();
                }
                throw new Error(`getToken failed! Call '/as/token.oauth2' failed, HTTP status code '${response.status}', and message '${message}'`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`getToken failed: Request timed out after ${config.apiTimeout}ms`);
            }
            throw error;
        }
    }
}

module.exports = AuthHandler;
