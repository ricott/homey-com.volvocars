'use strict';

const Homey = require('homey');
const { OAuth2Client, OAuth2Error } = require('homey-oauth2app');
const querystring = require('querystring');
const crypto = require('crypto');
const config = require('./const.js');

class VolvoOAuth2Client extends OAuth2Client {

    static API_URL = config.API_URL;
    static TOKEN_URL = config.TOKEN_URL;
    static AUTHORIZATION_URL = config.AUTHORIZATION_URL;
    static SCOPES = config.OAUTH_SCOPES;

    async onHandleNotOK({ body }) {
        this.log('onHandleNotOK called with body:', JSON.stringify(body, null, 2));

        // Extract meaningful error message from Volvo's error format
        let errorMessage = 'Unknown error';
        if (body.error) {
            if (body.error.description) {
                errorMessage = body.error.description;
            } else if (body.error.message) {
                errorMessage = body.error.message;
            } else if (typeof body.error === 'string') {
                errorMessage = body.error;
            }
        }

        throw new OAuth2Error(errorMessage);
    }

    // Add debugging for callback handling
    async onRequestToken() {
        this.log('onRequestToken called');
        return super.onRequestToken();
    }

    async onHandleAuthorizationCallback({ url }) {
        this.log('onHandleAuthorizationCallback called with URL:', url);
        try {
            const result = await super.onHandleAuthorizationCallback({ url });
            this.log('Authorization callback handled successfully');
            return result;
        } catch (error) {
            this.log('Authorization callback failed:', error.message);
            throw error;
        }
    }

    onHandleAuthorizationURL({ scopes, state } = {}) {
        const codeVerifier = crypto.randomBytes(32).toString('hex');
        this._codeVerifier = codeVerifier;

        const hash = crypto.createHash('sha256').update(codeVerifier).digest();
        const codeChallenge = hash.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const query = {
            state,
            client_id: this._clientId,
            response_type: 'code',
            scope: this.onHandleAuthorizationURLScopes({ scopes }),
            redirect_uri: this._redirectUrl,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        };

        const authUrl = `${this._authorizationUrl}?${querystring.stringify(query)}`;
        this.log('Generated synchronous authorization URL:', authUrl);

        return authUrl;
    }

    async onGetTokenByCode({ code }) {
        this.log('onGetTokenByCode called with code:', code ? 'present' : 'missing');
        this.log('Code verifier available:', this._codeVerifier ? 'yes' : 'no');

        const body = new URLSearchParams();
        body.append('grant_type', 'authorization_code');
        body.append('client_id', this._clientId);
        body.append('code', code);

        // Use the same redirect URI that was used in authorization request
        let redirectUrl = this._dynamicRedirectUrl || this._redirectUrl;
        this.log('Using redirect URL for token exchange:', redirectUrl);

        body.append('redirect_uri', redirectUrl);
        body.append('code_verifier', this._codeVerifier); // ← PKCE verifier (required)

        // Try adding client_secret as fallback for Volvo's requirements
        if (this._clientSecret) {
            body.append('client_secret', this._clientSecret);
            this.log('Including client_secret in token request');
        }

        this.log('Making token request to:', this._tokenUrl);
        this.log('Token request body:', body.toString());

        const response = await fetch(this._tokenUrl, {
            method: 'POST',
            body,
        });

        this.log('Token response status:', response.status);

        if (!response.ok) {
            return this.onHandleGetTokenByCodeError({ response });
        }

        this._token = await this.onHandleGetTokenByCodeResponse({ response });
        return this.getToken();
    }

    async onHandleGetTokenByCodeResponse({ response }) {
        const body = await response.json();

        // Debug logging to see what Volvo returns
        this.log('Volvo token response:', JSON.stringify(body, null, 2));

        // Check if Volvo uses different field names and map them if needed
        const tokenData = {
            access_token: body.access_token || body.accessToken,
            refresh_token: body.refresh_token || body.refreshToken,
            token_type: body.token_type || body.tokenType || 'Bearer',
            expires_in: body.expires_in || body.expiresIn
        };

        this.log('Mapped token data:', JSON.stringify(tokenData, null, 2));

        return new this._tokenConstructor(tokenData);
    }

    async onHandleGetTokenByCodeError({ response }) {
        this.log('Token exchange failed with status:', response.status);

        let errorBody;
        try {
            errorBody = await response.text();
            this.log('Token error response body:', errorBody);
        } catch (err) {
            this.log('Could not read error response body:', err.message);
        }

        // Call the parent error handler
        return super.onHandleGetTokenByCodeError({ response });
    }

    async onBuildRequest({ method, path, query, json, body, headers }) {
        const result = await super.onBuildRequest({ method, path, query, json, body, headers });

        // Add VCC API Key header required by Volvo's API
        const vccApiKey = this.homey.settings.get('vcc_api_key');
        if (vccApiKey) {
            result.opts.headers['vcc-api-key'] = vccApiKey;
            // this.log('Added VCC API Key header to request');
        } else {
            this.log('Warning: VCC API Key not found in app settings');
        }

        return result;
    }

    async getVehicles() {
        return this.get({
            path: '/connected-vehicle/v2/vehicles'
        });
    }

    async getVehicleInfo(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}`
        });
    }

    // https://developer.volvocars.com/apis/connected-vehicle/v2/endpoints/doors-windows-locks/#get-window-status
    async getWindowState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/windows`
        });
    }

    async getDoorState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/doors`
        });
    }

    async getOdometerState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/odometer`
        });
    }

    async getTyreState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/tyres`
        });
    }

    async getEngineState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/engine-status`
        });
    }

    async getFuelBatteryState(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/fuel`
        });
    }

    // https://developer.volvocars.com/apis/energy/v2/endpoints/capabilities/#capabilities-of-the-vehicle
    async getEnergyCapabilities(vin) {
        return this.get({
            path: `/energy/v2/vehicles/${vin}/capabilities`
        });
    }

    // https://developer.volvocars.com/apis/energy/v2/endpoints/energy-state/#get-the-latest-energy-state-of-the-vehicle
    async getEnergyState(vin) {
        return this.get({
            path: `/energy/v2/vehicles/${vin}/state`
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

    async getVehicleDiagnostic(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/diagnostics`
        });
    }

    async getVehicleWarnings(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/warnings`
        });
    }

    async getVehicleStatistics(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/statistics`
        });
    }

    async listAvailableCommands(vin) {
        return this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands`
        });
    }

    async isVehicleAccessibleForCommands(vin) {
        const result = await this.get({
            path: `/connected-vehicle/v2/vehicles/${vin}/command-accessibility`
        });
        if (result.data.availabilityStatus.value == 'AVAILABLE') {
            return true;
        }
        return false;
    }

    async getVehicleLocation(vin) {
        return this.get({
            path: `/location/v1/vehicles/${vin}/location`
        });
    }

    async lock(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/lock`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async lockReducedGuard(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/lock-reduced-guard`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async unlock(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/unlock`,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { unlockDuration: 120 }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    // https://developer.volvocars.com/apis/connected-vehicle/v2/endpoints/climate/#start-climatisation
    async startClimatization(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-start`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    // https://developer.volvocars.com/apis/connected-vehicle/v2/endpoints/climate/#stop-climatisation
    async stopClimatization(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-stop`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }

        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async flash(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/flash`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honk(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/honk`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honkAndFlash(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/honk-flash`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async startEngine(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/engine-start`,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { runtimeMinutes: 15 }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async stopEngine(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/engine-stop`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
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

}

module.exports = VolvoOAuth2Client;