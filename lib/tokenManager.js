'use strict';
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
        return this.userTokens[username];
    }

    #cacheToken(vccLoginToken, username, password, token) {
        this.userTokens[username] = new VolvoToken(vccLoginToken, username, password, token);
    }

    #getTokenFromCache(username) {
        return this.#getTokenObjectFromCache(username).token;
    }

    getToken(vccLoginToken, username, password, token) {
        var self = this;
        return mutex.acquire()
            .then(function (release) {
                self.release = release;
                if (!self.#isTokenAlreadyCreated(username, password)) {
                    return refreshToken(vccLoginToken, username, token.refresh_token)
                        .then(function (token) {
                            self.#cacheToken(vccLoginToken, username, password, token);
                            return Promise.resolve(self.#getTokenFromCache(username));
                        }).catch(function (reason) {
                            return Promise.reject(reason);
                        });
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
        return Promise.reject(reason);
    });
}

async function _refreshToken(inputOptions) {
    const options = {
        method: 'POST',
        signal: AbortSignal.timeout(config.apiTimeout),
        headers: {
            'authorization': inputOptions.vccLoginToken,
            'content-type': 'application/x-www-form-urlencoded',
            'accept': 'application/json'
        },
        body: new URLSearchParams({
            refresh_token: inputOptions.refresh_token,
            grant_type: 'refresh_token'
        })
    };

    const url = `https://${config.oAuthDomain}/as/token.oauth2`;
    
    try {
        const response = await fetch(url, options);

        if (response.ok) {
            const data = await response.json();
            return data;
        }

        const data = await response.text();
        let message;
        try {
            message = util.inspect(JSON.parse(data), { showHidden: false, depth: null });
        } catch (e) {
            message = data;
        }
        throw new Error(`Refresh token failed! Call '/as/token.oauth2' failed, HTTP status code '${response.status}', and message '${message}'`);
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error(`Request timed out after ${config.apiTimeout}ms`);
        }
        // Add more context to the error
        throw new Error(`Failed to refresh token: ${error.message}`);
    }
}
