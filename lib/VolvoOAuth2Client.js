'use strict';

const Homey = require('homey');
const { OAuth2Client, OAuth2Error, OAuth2Token } = require('homey-oauth2app');
const querystring = require('querystring');
const crypto = require('crypto');
const config = require('./const.js');

// Extended OAuth2Token class with expiration tracking
class VolvoOAuth2Token extends OAuth2Token {
    constructor({
        access_token,
        refresh_token,
        token_type,
        expires_in,
        created_at
    }) {
        // Call parent constructor first
        super({
            access_token,
            refresh_token,
            token_type,
            expires_in
        });
        
        // Add our custom timestamp tracking
        if (created_at) {
            this.created_at = created_at;
        } else {
            // If no created_at timestamp (token loaded from old storage), 
            // we can't reliably determine expiration, so don't use proactive refresh
            this.created_at = null;
        }
    }

    isExpired(bufferMinutes = null) {
        if (!this.expires_in) {
            return false;
        }
        
        if (this.created_at === null) {
            // Legacy token without created_at - treat as expired to force refresh
            this.log && this.log('Legacy token without created_at timestamp - treating as expired for proactive refresh');
            return true;
        }
        
        const now = Date.now();
        const expiresAt = this.created_at + (this.expires_in * 1000);
        const tokenLifetimeMinutes = this.expires_in / 60;
        
        // Use adaptive buffer: 50% of token lifetime, but at least 2 minutes and at most 4 minutes
        let adaptiveBufferMinutes;
        if (bufferMinutes !== null) {
            adaptiveBufferMinutes = bufferMinutes;
        } else {
            // For 5-minute tokens, use 2.5 minute buffer to ensure refresh before 5-minute timer
            adaptiveBufferMinutes = Math.max(2, Math.min(4, tokenLifetimeMinutes * 0.5));
        }
        
        const bufferTime = adaptiveBufferMinutes * 60 * 1000;
        const timeToExpiry = expiresAt - now;
        const willExpireSoon = now >= (expiresAt - bufferTime);
        
        // Debug logging for token expiration checks
        if (timeToExpiry < 3 * 60 * 1000) { // Log when less than 3 minutes left
            this.log && this.log(`Token expiration check: Lifetime: ${Math.round(tokenLifetimeMinutes)}min, Buffer: ${Math.round(adaptiveBufferMinutes * 10) / 10}min, Time to expiry: ${Math.round(timeToExpiry / 60000)}min, Will expire soon: ${willExpireSoon}`);
        }
        
        return willExpireSoon;
    }

    isCompletelyExpired() {
        if (!this.expires_in) {
            return false;
        }
        
        // If no created_at timestamp (legacy token), we can't determine exact expiration
        // but we should treat it as potentially expired to force refresh
        if (this.created_at === null) {
            this.log && this.log('Legacy token without created_at timestamp - treating as potentially expired');
            return true;
        }
        
        const now = Date.now();
        const expiresAt = this.created_at + (this.expires_in * 1000);
        return now >= expiresAt;
    }

    getExpirationTime() {
        if (!this.expires_in || this.created_at === null) return null;
        return new Date(this.created_at + (this.expires_in * 1000));
    }

    toJSON() {
        return {
            ...super.toJSON(),
            created_at: this.created_at
        };
    }
}

class VolvoOAuth2Client extends OAuth2Client {

    static API_URL = config.API_URL;
    static TOKEN_URL = config.TOKEN_URL;
    static AUTHORIZATION_URL = config.AUTHORIZATION_URL;
    static SCOPES = config.OAUTH_SCOPES;
    static TOKEN = VolvoOAuth2Token;

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
            expires_in: body.expires_in || body.expiresIn,
            created_at: Date.now()
        };

        this.log('Mapped token data:', JSON.stringify(tokenData, null, 2));
        this.log('Token will expire at:', new Date(tokenData.created_at + (tokenData.expires_in * 1000)));

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

    async onRequestHeaders({ headers }) {
        const token = await this.getToken();
        if (!token) {
            throw new OAuth2Error('Missing Token');
        }

        // Debug: Log every API call to see if we're checking expiration
        const now = Date.now();
        const timeToExpiry = token.created_at ? (token.created_at + (token.expires_in * 1000)) - now : 0;
        if (timeToExpiry < 4 * 60 * 1000 && timeToExpiry > 0) { // Log when less than 4 minutes left
            this.log(`API call - Time to token expiry: ${Math.round(timeToExpiry / 60000)}min`);
        }

        // Check if token is completely expired
        if (token.isCompletelyExpired && token.isCompletelyExpired()) {
            this.error('Access token has completely expired');
            this.emit('expired');
            throw new OAuth2Error('Access token has expired. Please re-authorize.');
        }

        // Check if token will expire soon and refresh proactively
        if (token.isExpired && token.isExpired() && token.isRefreshable()) {
            const now = Date.now();
            const timeSinceLastRefresh = this._lastRefreshTime ? (now - this._lastRefreshTime) : Infinity;
            const timeSinceLastFailure = this._lastRefreshFailed ? (now - this._lastRefreshFailed) : Infinity;
            const timeSinceLastError = this._lastRefreshError ? (now - this._lastRefreshError.timestamp) : Infinity;
            
            // Determine if we should attempt a refresh based on error type and timing
            let shouldRefresh = false;
            let reason = '';
            
            if (timeSinceLastRefresh > 30000) {
                if (!this._lastRefreshError) {
                    shouldRefresh = true;
                    reason = 'no previous error';
                } else if (this._lastRefreshError.type === 'network' && timeSinceLastError > 15000) {
                    shouldRefresh = true;
                    reason = 'network error retry (15s)';
                } else if (this._lastRefreshError.type === 'server' && timeSinceLastError > 30000) {
                    shouldRefresh = true;
                    reason = 'server error retry (30s)';
                } else if (this._lastRefreshError.type === 'auth' && timeSinceLastError > 300000) {
                    shouldRefresh = true;
                    reason = 'auth error retry (5m)';
                } else if (this._lastRefreshError.type !== 'network' && this._lastRefreshError.type !== 'server' && timeSinceLastError > 60000) {
                    shouldRefresh = true;
                    reason = 'other error retry (60s)';
                }
            }
            
            if (shouldRefresh) {
                this.log(`Token will expire soon, refreshing proactively (${reason})...`);
                this._lastRefreshTime = now; // Mark refresh attempt time
                
                try {
                    await this.refreshToken();
                    const refreshedToken = await this.getToken();
                    this.log('Token refreshed successfully. New expiration:', refreshedToken.getExpirationTime?.());
                    
                    // Clear all error flags on success
                    delete this._lastRefreshFailed;
                    delete this._lastRefreshError;
                } catch (error) {
                    this.error('Failed to refresh token proactively:', error);
                    this._lastRefreshFailed = Date.now(); // Mark failure time
                    delete this._lastRefreshTime; // Clear refresh time on failure
                    
                    // Check if this is a critical error that requires re-authorization
                    if (error.message && (error.message.includes('refresh token') || error.message.includes('invalid'))) {
                        this.log('Refresh token is invalid, device needs re-authorization');
                        
                        // Emit expired event to trigger device unavailable
                        this.emit('expired');
                        
                        // Let the error propagate to trigger the normal OAuth2 error handling
                        throw error;
                    }
                }
            } else {
                const waitTime = this._lastRefreshError ? 
                    (this._lastRefreshError.type === 'network' ? 15000 - timeSinceLastError : 
                     this._lastRefreshError.type === 'server' ? 30000 - timeSinceLastError : 
                     60000 - timeSinceLastError) : 
                    30000 - timeSinceLastRefresh;
                
                if (waitTime > 0) {
                    this.log(`Skipping proactive refresh, rate limited. Wait ${Math.round(waitTime/1000)}s (last error: ${this._lastRefreshError?.type || 'none'})`);
                }
            }
        }

        const currentToken = await this.getToken();
        const { access_token: accessToken } = currentToken;
        return {
            ...headers,
            Authorization: `Bearer ${accessToken}`,
        };
    }

    // Method to check if token needs refresh before making API calls
    async ensureTokenValid() {
        const token = await this.getToken();
        if (!token) {
            throw new OAuth2Error('Missing Token');
        }

        // If token is expired or will expire soon, refresh it
        if (token.isExpired && token.isExpired() && token.isRefreshable()) {
            this.log('Token needs refresh before API call, refreshing...');
            try {
                await this.refreshToken();
                this.log('Token refreshed successfully before API call');
            } catch (error) {
                this.error('Failed to refresh token before API call:', error);
                throw error;
            }
        }

        return true;
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
            json: { unlockDuration: 120 }
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
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (this.#isInvokeStatusOk(result)) {
            return true;
        }
        throw new Error(`Command returned status '${result.data.invokeStatus}'`);
    }

    async onHandleRefreshTokenResponse({ response }) {
        const body = await response.json();
        
        // Log the old refresh token before processing response
        const oldRefreshToken = this._token?.refresh_token;
        this.log('OLD refresh token (sent to Volvo):', oldRefreshToken ? `${oldRefreshToken.substring(0, 12)}...${oldRefreshToken.substring(oldRefreshToken.length - 12)}` : 'none');
        
        this.log('Refresh token response:', JSON.stringify(body, null, 2));

        // Map refresh token response and add timestamp
        const tokenData = {
            access_token: body.access_token,
            refresh_token: body.refresh_token || this._token?.refresh_token,
            token_type: body.token_type || 'Bearer',
            expires_in: body.expires_in,
            created_at: Date.now()
        };

        this.log('Mapped refresh token data:', JSON.stringify(tokenData, null, 2));
        this.log('Refreshed token will expire at:', new Date(tokenData.created_at + (tokenData.expires_in * 1000)));
        
        // Check if Volvo actually rotated the refresh token
        const newRefreshToken = tokenData.refresh_token;
        if (oldRefreshToken && newRefreshToken) {
            if (oldRefreshToken === newRefreshToken) {
                this.error('⚠️ WARNING: Volvo returned the SAME refresh token - rotation did NOT happen!');
                this.error('This token will expire in 7 days if not rotated.');
            } else {
                this.log(`✅ Token rotation successful - new refresh token: ${newRefreshToken.substring(0, 12)}...${newRefreshToken.substring(newRefreshToken.length - 12)}`);
            }
        }

        return new this._tokenConstructor(tokenData);
    }

    async onHandleRefreshTokenError({ response, error }) {
        this.log('Refresh token error occurred:', error?.message || 'Unknown error');
        this.log('Response status:', response?.status);
        
        let errorBody;
        try {
            if (response) {
                errorBody = await response.text();
                this.log('Refresh token error response body:', errorBody);
            }
        } catch (err) {
            this.log('Could not read refresh token error response body:', err.message);
        }

        // Classify the error type for better handling
        let errorType = 'unknown';
        let shouldRetry = false;
        
        if (error) {
            // Network/connectivity errors
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || 
                error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' ||
                error.message?.includes('network') || error.message?.includes('timeout') ||
                error.message?.includes('fetch')) {
                errorType = 'network';
                shouldRetry = true;
                this.log('Network error detected during token refresh - will retry');
            }
            // HTTP errors
            else if (response?.status) {
                if (response.status >= 500) {
                    errorType = 'server';
                    shouldRetry = true;
                    this.log('Server error detected during token refresh - will retry');
                } else if (response.status === 401 || response.status === 403) {
                    errorType = 'auth';
                    shouldRetry = false;
                    this.log('Authentication error detected during token refresh - re-authorization required');
                } else if (response.status >= 400 && response.status < 500) {
                    errorType = 'client';
                    shouldRetry = false;
                    this.log('Client error detected during token refresh - check configuration');
                }
            }
        }

        // Store error information for retry logic
        this._lastRefreshError = {
            type: errorType,
            timestamp: Date.now(),
            shouldRetry: shouldRetry,
            message: error?.message || 'Unknown error'
        };

        // For network errors, don't immediately fail - let the retry logic handle it
        if (errorType === 'network') {
            throw new OAuth2Error(`Network error during token refresh: ${error.message}`);
        }
        
        // For auth errors, emit expired event to trigger re-authorization
        if (errorType === 'auth') {
            this.emit('expired');
            throw new OAuth2Error('Refresh token is invalid. Please re-authorize.');
        }

        // For other errors, throw the original error
        throw error || new OAuth2Error('Token refresh failed');
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