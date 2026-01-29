'use strict';

const { OAuth2Client, OAuth2Error } = require('./oauth2');
const config = require('./const.js');

/**
 * Volvo Connected Cars OAuth2 Client
 * 
 * Extends the base OAuth2Client with Volvo-specific API methods and configuration.
 * The base class handles PKCE, token refresh with Basic auth, mutex protection,
 * and proactive token refresh.
 */
class VolvoOAuth2Client extends OAuth2Client {

    static API_URL = config.API_URL;
    static TOKEN_URL = config.TOKEN_URL;
    static AUTHORIZATION_URL = config.AUTHORIZATION_URL;
    static SCOPES = config.OAUTH_SCOPES;

    /**
     * Handle non-OK responses with Volvo-specific error format
     */
    async onHandleNotOK({ body }) {
        this.debug('onHandleNotOK called with body:', JSON.stringify(body, null, 2));

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

    /**
     * Add VCC API Key header to all API requests
     */
    async onBuildRequest({ method, path, query, json, body, headers }) {
        const result = await super.onBuildRequest({ method, path, query, json, body, headers });

        // Add VCC API Key header required by Volvo's API
        const vccApiKey = this.homey.settings.get('vcc_api_key');
        if (vccApiKey) {
            result.opts.headers['vcc-api-key'] = vccApiKey;
        } else {
            this.log('Warning: VCC API Key not found in app settings');
        }

        return result;
    }

    /*
     * Volvo Connected Vehicle API Methods
     */

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

    async getEnergyCapabilities(vin) {
        return this.get({
            path: `/energy/v2/vehicles/${vin}/capabilities`
        });
    }

    async getEnergyState(vin) {
        return this.get({
            path: `/energy/v2/vehicles/${vin}/state`
        });
    }

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
        return result.data.availabilityStatus.value === 'AVAILABLE';
    }

    async getVehicleLocation(vin) {
        return this.get({
            path: `/location/v1/vehicles/${vin}/location`
        });
    }

    /*
     * Vehicle Command Methods
     */

    async lock(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/lock`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async lockReducedGuard(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/lock-reduced-guard`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async unlock(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/unlock`,
            json: { unlockDuration: 120 }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async startClimatization(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-start`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async stopClimatization(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/climatization-stop`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async flash(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/flash`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honk(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/honk`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async honkAndFlash(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/honk-flash`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async startEngine(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/engine-start`,
            json: { runtimeMinutes: 15 }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async stopEngine(vin) {
        const result = await this.post({
            path: `/connected-vehicle/v2/vehicles/${vin}/commands/engine-stop`,
            headers: { 'Content-Type': 'application/json' }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    /**
     * Check if command invoke status indicates success
     * @private
     */
    #isInvokeStatusOk(result) {
        const status = result?.data?.invokeStatus || 'unknown';
        return ['COMPLETED', 'RUNNING', 'DELIVERED', 'WAITING'].includes(status);
    }

}

module.exports = VolvoOAuth2Client;
