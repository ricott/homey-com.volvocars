'use strict';

const Homey = require('homey');
const { URLSearchParams } = require('url');
const { EventEmitter } = require('events');
const querystring = require('querystring');
const crypto = require('crypto');

const OAuth2Error = require('./OAuth2Error');
const OAuth2Token = require('./OAuth2Token');
const OAuth2Util = require('./OAuth2Util');

/**
 * @extends EventEmitter
 * @description OAuth2 Client with PKCE support, proactive token refresh, and mutex protection
 */
class OAuth2Client extends EventEmitter {

  /** @type {string} */
  static CLIENT_ID = Homey.env.CLIENT_ID;

  /** @type {string} */
  static CLIENT_SECRET = Homey.env.CLIENT_SECRET;

  /** @type {string} */
  static API_URL = null;

  /** @type {OAuth2Token} */
  static TOKEN = OAuth2Token;

  /** @type {string} */
  static TOKEN_URL = null;

  /** @type {string} */
  static AUTHORIZATION_URL = null;

  /** @type {string} */
  static REDIRECT_URL = 'https://callback.athom.com/oauth2/callback';

  /** @type {string[]} */
  static SCOPES = [];

  /**
   * @param {object} args
   * @param {Homey} args.homey
   * @param {OAuth2Token} args.token
   * @param {string} args.clientId
   * @param {string} args.clientSecret
   * @param {string} args.apiUrl
   * @param {string} args.tokenUrl
   * @param {string} args.authorizationUrl
   * @param {string} args.redirectUrl
   * @param {array} args.scopes
   */
  constructor({
    homey,
    token,
    clientId,
    clientSecret,
    apiUrl,
    tokenUrl,
    authorizationUrl,
    redirectUrl,
    scopes,
  }) {
    super();

    this.homey = homey;

    this._tokenConstructor = token;
    this._clientId = clientId;
    this._clientSecret = clientSecret;
    this._apiUrl = apiUrl;
    this._tokenUrl = tokenUrl;
    this._authorizationUrl = authorizationUrl;
    this._redirectUrl = redirectUrl;
    this._scopes = scopes;

    this._token = null;
    
    // Mutex for preventing concurrent token refresh operations
    this._refreshInProgress = false;
    this._refreshPromise = null;
    
    // PKCE code verifier storage
    this._codeVerifier = null;
    
    // Error tracking for refresh cooldown
    this._lastRefreshError = null;
  }

  /*
   * Helpers
   */

  /**
   * @description Initialize the client
   * @returns {Promise<void>}
   */
  init() {
    this.debug('Initialized');
    return this.onInit();
  }

  /**
   * @description Log helper
   * @param {...*} props
   */
  log(...props) {
    this.emit('log', ...props);
  }

  /**
   * @description Error log helper
   * @param {...*} props
   */
  error(...props) {
    this.emit('error', ...props);
  }

  /**
   * @description Debug log helper
   * @param {...*} props
   */
  debug(...props) {
    this.emit('debug', ...props);
  }

  /**
   * @description Save helper - emits save event
   */
  save() {
    this.emit('save');
  }

  /**
   * @description Destroy helper
   */
  destroy() {
    this.onUninit().catch(() => { });
    this.emit('destroy');
  }

  /*
   * Request Management
   */

  /**
   * @param {object} args
   * @param {string} args.path
   * @param {object} args.query
   * @param {object} args.headers
   * @returns {Promise<*>}
   */
  async get({ path, query, headers }) {
    return this._executeRequest({ method: 'GET', path, query, headers });
  }

  /**
   * @param {object} args
   * @param {string} args.path
   * @param {object} args.query
   * @param {object} args.headers
   * @returns {Promise<*>}
   */
  async delete({ path, query, headers }) {
    return this._executeRequest({ method: 'DELETE', path, query, headers });
  }

  /**
   * @param {object} args
   * @param {string} args.path
   * @param {object} args.query
   * @param {object} args.json
   * @param {*} args.body
   * @param {object} args.headers
   * @returns {Promise<*>}
   */
  async post({ path, query, json, body, headers }) {
    return this._executeRequest({ method: 'POST', path, query, json, body, headers });
  }

  /**
   * @param {object} args
   * @param {string} args.path
   * @param {object} args.query
   * @param {object} args.json
   * @param {*} args.body
   * @param {object} args.headers
   * @returns {Promise<*>}
   */
  async patch({ path, query, json, body, headers }) {
    return this._executeRequest({ method: 'PATCH', path, query, json, body, headers });
  }

  /**
   * @param {object} args
   * @param {string} args.path
   * @param {object} args.query
   * @param {object} args.json
   * @param {*} args.body
   * @param {object} args.headers
   * @returns {Promise<*>}
   */
  async put({ path, query, json, body, headers }) {
    return this._executeRequest({ method: 'PUT', path, query, json, body, headers });
  }

  /**
   * Refresh the token with mutex protection to prevent concurrent refreshes
   * @returns {Promise<OAuth2Token>}
   */
  async refreshToken() {
    // Prevent concurrent refresh attempts using a mutex
    if (this._refreshInProgress) {
      this.log('Token refresh already in progress, waiting for existing refresh to complete...');
      if (this._refreshPromise) {
        try {
          return await this._refreshPromise;
        } catch (error) {
          this.log('Existing refresh failed, will allow retry:', error.message);
          throw error;
        }
      }
      throw new OAuth2Error('Token refresh already in progress');
    }

    this._refreshInProgress = true;
    this._refreshPromise = this._doRefreshToken();

    try {
      const result = await this._refreshPromise;
      return result;
    } finally {
      this._refreshInProgress = false;
      this._refreshPromise = null;
    }
  }

  /**
   * Internal method that performs the actual token refresh
   * Uses Basic auth header as required by many OAuth2 implementations
   * @returns {Promise<OAuth2Token>}
   * @private
   */
  async _doRefreshToken() {
    const token = await this.getToken();
    if (!token) {
      throw new OAuth2Error('Missing Token');
    }

    if (!token.refresh_token) {
      throw new OAuth2Error('Missing Refresh Token');
    }

    if (!token.isRefreshable()) {
      throw new OAuth2Error('Token is not refreshable');
    }

    this.log('Starting token refresh...');
    const oldRefreshToken = token.refresh_token;
    this.debug('Current refresh token:', `${oldRefreshToken.substring(0, 12)}...${oldRefreshToken.substring(oldRefreshToken.length - 12)}`);

    // Build request body
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', token.refresh_token);

    // Use Basic auth header with base64 encoded client_id:client_secret
    const credentials = Buffer.from(`${this._clientId}:${this._clientSecret}`).toString('base64');

    this.debug('Making refresh token request to:', this._tokenUrl);

    let response;
    try {
      response = await fetch(this._tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body
      });
    } catch (error) {
      this.error('Network error during token refresh:', error);
      return this.onHandleRefreshTokenError({ error });
    }

    this.debug('Refresh token response status:', response.status);

    if (!response.ok) {
      return this.onHandleRefreshTokenError({ response });
    }

    this._token = await this.onHandleRefreshTokenResponse({ response });
    
    // Validate token rotation occurred (if applicable)
    const newToken = this._token;
    if (newToken.refresh_token === oldRefreshToken) {
      this.log('Note: Refresh token was not rotated (same token returned)');
    } else {
      this.log('Token rotation confirmed - new refresh token received');
    }

    // Save the new token
    await this.save();
    
    this.log('Token refresh completed successfully');
    this.log('New access token expires at:', newToken.getExpirationTime?.()?.toISOString() || 'unknown');

    return this.getToken();
  }

  /**
   * @param {object} req
   * @param {boolean} didRefreshToken
   * @returns {Promise<*>}
   * @private
   */
  async _executeRequest(req, didRefreshToken = false) {
    this._refreshedDuringBuild = false;
    const { url, opts } = await this.onBuildRequest(req);

    if (this._refreshedDuringBuild) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (this._refreshInProgress) {
      await this._refreshPromise;
    }

    // Log request
    this.debug('[req]', opts.method, url);
    for (const key of Object.keys(opts.headers)) {
      this.debug('[req]', `${key}: ${opts.headers[key]}`);
    }

    if (opts.body) {
      this.debug('[req]', opts.body);
    }

    // Make request using native fetch
    let response;
    try {
      response = await fetch(url, opts);
    } catch (err) {
      return this.onRequestError({ req, url, opts, err });
    }

    return this.onRequestResponse({
      req,
      url,
      opts,
      response,
      didRefreshToken,
    });
  }

  /*
   * Token management
   */

  /**
   * @param {object} args
   * @param {string} args.code
   * @returns {Promise<OAuth2Token>}
   */
  async getTokenByCode({ code }) {
    const token = await this.onGetTokenByCode({ code });
    if (!(token instanceof OAuth2Token)) {
      throw new Error('Invalid Token returned in onGetTokenByCode');
    }

    this.setToken({ token });
    return this.getToken();
  }

  /**
   * @param {object} args
   * @param {string} args.username
   * @param {string} args.password
   * @returns {Promise<OAuth2Token>}
   */
  async getTokenByCredentials({ username, password }) {
    const token = await this.onGetTokenByCredentials({ username, password });
    if (!(token instanceof OAuth2Token)) {
      throw new Error('Invalid Token returned in getTokenByCredentials');
    }

    this._token = token;
    return this.getToken();
  }

  /**
   * @returns {OAuth2Token|null}
   */
  getToken() {
    return this._token;
  }

  /**
   * @param {object} args
   * @param {OAuth2Token} args.token
   */
  setToken({ token }) {
    this._token = token;
  }

  /**
   * Ensure token is valid before making API calls
   * @returns {Promise<boolean>}
   */
  async ensureTokenValid() {
    const token = await this.getToken();
    if (!token) {
      throw new OAuth2Error('Missing Token');
    }

    // If token is expired or will expire soon, refresh it
    if (token.isExpired && token.isExpired()) {
      if (!token.isRefreshable()) {
        this.error('Token is expired and not refreshable');
        this.emit('expired');
        throw new OAuth2Error('Token has expired and cannot be refreshed. Please re-authorize.');
      }

      this.log('Token needs refresh before API call, refreshing...');
      try {
        await this.refreshToken();
        this.log('Token refreshed successfully before API call');
      } catch (error) {
        this.error('Failed to refresh token before API call:', error);
        
        if (this.#isAuthError(error)) {
          this.emit('expired');
        }
        throw error;
      }
    }

    return true;
  }

  /*
   * Various
   */

  /**
   * @param {object} args
   * @param {array} args.scopes
   * @param {string} args.state
   * @returns {string}
   */
  getAuthorizationUrl({
    scopes = this._scopes,
    state = OAuth2Util.getRandomId(),
  } = {}) {
    const url = this.onHandleAuthorizationURL({ scopes, state });
    this.debug('Got authorization URL:', url);
    return url;
  }

  /**
   * @returns {string}
   */
  getTitle() {
    return this._title;
  }

  /**
   * @param {object} args
   * @param {string} args.title
   */
  setTitle({ title }) {
    this._title = title;
  }

  /*
   * Private helper methods
   */

  /**
   * Check if an error indicates an authentication/authorization problem
   * @param {Error} error
   * @returns {boolean}
   * @private
   */
  #isAuthError(error) {
    if (!error) return false;
    const message = error.message?.toLowerCase() || '';
    return message.includes('refresh token') || 
           message.includes('invalid') ||
           message.includes('expired') ||
           message.includes('unauthorized');
  }

  /**
   * Get cooldown time in ms based on last error type
   * @returns {number}
   * @private
   */
  #getRefreshCooldown() {
    if (!this._lastRefreshError) return 0;
    
    switch (this._lastRefreshError.type) {
      case 'network':
        return 15000;  // 15 seconds for network errors
      case 'server':
        return 30000;  // 30 seconds for server errors (incl. rate limits)
      case 'auth':
        return 300000; // 5 minutes for auth errors (likely won't recover)
      default:
        return 60000;  // 1 minute for unknown errors
    }
  }

  /*
   * Methods that can be extended
   */

  /**
   * @description Can be extended
   * @returns {Promise<void>}
   */
  async onInit() {
    // Extend me
  }

  /**
   * @description Can be extended
   * @returns {Promise<void>}
   */
  async onUninit() {
    // Extend me
  }

  /**
   * @description Can be extended
   * @param {object} args
   * @param {string} args.method
   * @param {string} args.path
   * @param {object} args.json
   * @param {*} args.body
   * @param {object} args.query
   * @param {object} args.headers
   * @returns {Promise<{opts: object, url: string}>}
   */
  async onBuildRequest({ method, path, json, body, query, headers = {} }) {
    const opts = {};
    opts.method = method;
    opts.headers = headers;
    opts.headers = await this.onRequestHeaders({ headers: opts.headers });

    let urlAppend = '';
    query = await this.onRequestQuery({ query: { ...query } });
    if (typeof query === 'object' && Object.keys(query).length) {
      urlAppend = `?${querystring.stringify(query)}`;
    }

    if (json) {
      if (body) {
        throw new OAuth2Error('Both body and json provided');
      }

      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.body = JSON.stringify(json);
    } else if (body) {
      opts.body = body;
    }

    let url;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = `${path}${urlAppend}`;
    } else {
      url = `${this._apiUrl}${path}${urlAppend}`;
    }

    return { url, opts };
  }

  /**
   * @description Can be extended
   * @param {object} args
   * @param {object} args.query
   * @returns {Promise<object>}
   */
  async onRequestQuery({ query }) {
    return query;
  }

  /**
   * @description Request headers with proactive token refresh
   * @param {object} args
   * @param {object} args.headers
   * @returns {Promise<object>}
   */
  async onRequestHeaders({ headers }) {
    let token = await this.getToken();
    if (!token) {
      throw new OAuth2Error('Missing Token');
    }

    // Log token expiration status for debugging
    const now = Date.now();
    const timeToExpiry = token.getTimeToExpiry?.();
    if (timeToExpiry !== null && timeToExpiry < 4 * 60 * 1000 && timeToExpiry > 0) {
      this.debug(`API call - Time to token expiry: ${Math.round(timeToExpiry / 1000)}s`);
    }

    // Check if token is completely expired
    if (token.isCompletelyExpired && token.isCompletelyExpired()) {
      if (token.isRefreshable && token.isRefreshable()) {
        this.log('Access token has completely expired, attempting immediate refresh...');

        try {
          await this.refreshToken();
          token = await this.getToken();
          this._refreshedDuringBuild = true;
          this.log('Token refreshed after expiry');
        } catch (error) {
          this.error('Failed to refresh completely expired token:', error);

          if (this.#isAuthError(error)) {
            this.log('Refresh token is invalid, emitting expired event');
            this.emit('expired');
            throw new OAuth2Error('Access token has expired. Please re-authorize.');
          }

          throw error;
        }
      } else {
        this.error('Access token has completely expired and cannot be refreshed');
        this.emit('expired');
        throw new OAuth2Error('Access token has expired. Please re-authorize.');
      }
    }

    // Proactive refresh: Check if token will expire soon
    if (token.isExpired && token.isExpired() && token.isRefreshable()) {
      // Check cooldown to prevent excessive refresh attempts after errors
      const timeSinceLastError = this._lastRefreshError ? (now - this._lastRefreshError.timestamp) : Infinity;
      const cooldownMs = this.#getRefreshCooldown();
      
      if (timeSinceLastError > cooldownMs) {
        this.log('Token will expire soon, refreshing proactively...');
        
        try {
          await this.refreshToken();
          token = await this.getToken();
          this._refreshedDuringBuild = true;
          this.log('Proactive token refresh successful');
          
          // Clear error state on success
          this._lastRefreshError = null;
        } catch (error) {
          this.error('Proactive token refresh failed:', error);
          
          if (this.#isAuthError(error)) {
            this.log('Refresh token is invalid, emitting expired event');
            this.emit('expired');
            throw error;
          }
          
          // For non-auth errors, log but don't throw - let the API call proceed
          this.log('Will attempt API call with current token despite refresh failure');
        }
      } else {
        const waitTime = Math.round((cooldownMs - timeSinceLastError) / 1000);
        this.debug(`Skipping proactive refresh (cooldown: ${waitTime}s remaining)`);
      }
    }

    const currentToken = await this.getToken();
    const { access_token: accessToken } = currentToken;
    return {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  /**
   * @description Authorization URL with PKCE support
   * @param {object} args
   * @param {array} args.scopes
   * @param {string} args.state
   * @returns {string}
   */
  onHandleAuthorizationURL({ scopes, state } = {}) {
    // Generate PKCE code verifier and challenge
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

    if (this._authorizationUrl.includes('?')) {
      return `${this._authorizationUrl}&${querystring.stringify(query)}`;
    }

    return `${this._authorizationUrl}?${querystring.stringify(query)}`;
  }

  /**
   * @param {object} args
   * @param {array} args.scopes
   * @returns {string}
   */
  onHandleAuthorizationURLScopes({ scopes }) {
    return scopes.join(' ');
  }

  /**
   * @description Get token by authorization code with PKCE support
   * @param {object} args
   * @param {string} args.code
   * @returns {Promise<OAuth2Token>}
   */
  async onGetTokenByCode({ code }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('client_id', this._clientId);
    body.append('code', code);
    body.append('redirect_uri', this._redirectUrl);

    // Add PKCE code verifier if available
    if (this._codeVerifier) {
      body.append('code_verifier', this._codeVerifier);
    }

    // Add client secret
    if (this._clientSecret) {
      body.append('client_secret', this._clientSecret);
    }

    this.debug('Making token request to:', this._tokenUrl);

    const response = await fetch(this._tokenUrl, {
      body,
      method: 'POST',
    });

    if (!response.ok) {
      return this.onHandleGetTokenByCodeError({ response });
    }

    this._token = await this.onHandleGetTokenByCodeResponse({ response });
    return this.getToken();
  }

  /**
   * @description Can be extended
   * @param {object} args
   * @param {Response} args.response
   * @returns {Promise<void>}
   */
  async onHandleGetTokenByCodeError({ response }) {
    return this._onHandleGetTokenByErrorGeneric({ response });
  }

  /**
   * @description Handle token response and add created_at timestamp
   * @param {object} args
   * @param {Response} args.response
   * @returns {Promise<OAuth2Token>}
   */
  async onHandleGetTokenByCodeResponse({ response }) {
    const json = await response.json();

    this.debug('Token response received');

    // Map token response and add timestamp
    const tokenData = {
      access_token: json.access_token || json.accessToken,
      refresh_token: json.refresh_token || json.refreshToken,
      token_type: json.token_type || json.tokenType || 'Bearer',
      expires_in: json.expires_in || json.expiresIn,
      created_at: Date.now()
    };

    this.debug('Token will expire at:', new Date(tokenData.created_at + (tokenData.expires_in * 1000)).toISOString());

    return new this._tokenConstructor(tokenData);
  }

  /**
   * @description Get token by username/password credentials
   * @param {object} args
   * @param {string} args.username
   * @param {string} args.password
   * @returns {Promise<OAuth2Token>}
   */
  async onGetTokenByCredentials({ username, password }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'password');
    body.append('username', username);
    body.append('password', password);
    body.append('scope', this._scopes.join(' '));

    if (this._clientId) {
      body.append('client_id', this._clientId);
    }

    if (this._clientSecret) {
      body.append('client_secret', this._clientSecret);
    }

    const response = await fetch(this._tokenUrl, {
      body,
      method: 'POST',
    });

    if (!response.ok) {
      return this.onHandleGetTokenByCredentialsError({ response });
    }

    this._token = await this.onHandleGetTokenByCredentialsResponse({ response });
    return this.getToken();
  }

  async onHandleGetTokenByCredentialsError({ response }) {
    return this._onHandleGetTokenByErrorGeneric({ response });
  }

  async onHandleGetTokenByCredentialsResponse({ response }) {
    return this.onHandleGetTokenByCodeResponse({ response });
  }

  /**
   * @param {object} args
   * @param {Response} args.response
   * @returns {Promise<OAuth2Token>}
   */
  async onHandleRefreshTokenResponse({ response }) {
    const json = await response.json();
    
    this.debug('Refresh token response received');
    this.debug('Response contains refresh_token:', !!json.refresh_token);
    this.debug('Response expires_in:', json.expires_in, 'seconds');

    // Map refresh token response and add timestamp
    // If server doesn't return a new refresh_token, keep the old one
    const tokenData = {
      access_token: json.access_token,
      refresh_token: json.refresh_token || this._token?.refresh_token,
      token_type: json.token_type || 'Bearer',
      expires_in: json.expires_in,
      created_at: Date.now()
    };

    if (!json.refresh_token) {
      this.debug('No refresh_token in response - keeping existing refresh token');
    }

    const expirationTime = new Date(tokenData.created_at + (tokenData.expires_in * 1000));
    this.debug('New access token will expire at:', expirationTime.toISOString());

    return new this._tokenConstructor(tokenData);
  }

  /**
   * @param {object} args
   * @param {Response} args.response
   * @param {Error} args.error
   * @returns {Promise<void>}
   */
  async onHandleRefreshTokenError({ response, error }) {
    this.debug('Refresh token error occurred:', error?.message || 'Unknown error');
    this.debug('Response status:', response?.status);
    
    let errorBody;
    try {
      if (response) {
        errorBody = await response.text();
        this.debug('Refresh token error response body:', errorBody);
      }
    } catch (err) {
      this.debug('Could not read refresh token error response body:', err.message);
    }

    const status = response?.status;
    const normalizedErrorBody = typeof errorBody === 'string' ? errorBody.toLowerCase() : '';

    let parsedErrorText = '';
    if (normalizedErrorBody) {
      try {
        const parsedBody = JSON.parse(errorBody);
        parsedErrorText = [
          parsedBody?.error,
          parsedBody?.error_description,
          parsedBody?.message,
          parsedBody?.errorMessage,
          typeof parsedBody?.error === 'object' ? parsedBody?.error?.message : null
        ]
          .filter(Boolean)
          .map(value => String(value).toLowerCase())
          .join(' ');
      } catch (parseError) {
        // Response body is not JSON - ignore parse error
      }
    }

    const errorMessageLower = error?.message ? error.message.toLowerCase() : '';
    const consolidatedErrorText = [
      errorMessageLower,
      normalizedErrorBody,
      parsedErrorText
    ].filter(Boolean).join(' ');

    const indicatesAuthIssue = /invalid[_\s-]?grant|invalid[_\s-]?token|refresh token|token expired|session expired|authorization failed|unauthorized/.test(consolidatedErrorText);

    // Classify the error type for better handling
    let errorType = 'unknown';
    let shouldRetry = false;
    
    if (error && (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('timeout') ||
      error.message?.toLowerCase().includes('fetch')
    )) {
      errorType = 'network';
      shouldRetry = true;
      this.debug('Network error detected during token refresh - will retry');
    } else if (status) {
      if (status === 429) {
        errorType = 'server';
        shouldRetry = true;
        this.debug('Rate limit error detected during token refresh - will retry');
      } else if (status >= 500) {
        errorType = 'server';
        shouldRetry = true;
        this.debug('Server error detected during token refresh - will retry');
      } else if (status === 401 || status === 403) {
        errorType = 'auth';
        this.debug('Authentication error detected during token refresh (401/403)');
      } else if (status === 400 && indicatesAuthIssue) {
        errorType = 'auth';
        this.debug('Authentication error detected during token refresh (400 invalid grant/token)');
      } else if (status >= 400 && status < 500) {
        errorType = 'client';
        this.debug('Client error detected during token refresh - check configuration');
      }
    }

    if (errorType === 'unknown' && indicatesAuthIssue) {
      errorType = 'auth';
      this.debug('Authentication error detected from response body during token refresh');
    }

    // Store error information for retry logic
    this._lastRefreshError = {
      type: errorType,
      timestamp: Date.now(),
      shouldRetry: shouldRetry,
      message: error?.message || errorBody || 'Unknown error'
    };

    // For network errors, don't immediately fail - let the retry logic handle it
    if (errorType === 'network') {
      throw new OAuth2Error(`Network error during token refresh: ${error?.message || 'Unknown network error'}`);
    }
    
    // For auth errors, emit expired event to trigger re-authorization
    if (errorType === 'auth') {
      this.debug('Authentication failure during token refresh - emitting expired event');
      this.emit('expired');
      throw new OAuth2Error('Refresh token is invalid or has expired. Please re-authorize.');
    }

    // For other errors, throw the original error if available
    if (error) {
      throw error;
    }

    throw new OAuth2Error('Token refresh failed');
  }

  /**
   * @param {object} args
   * @param {Response} args.response
   * @returns {Promise<void>}
   * @private
   */
  async _onHandleGetTokenByErrorGeneric({ response }) {
    const { headers } = response;
    const contentType = headers.get('Content-Type');

    if (typeof contentType === 'string') {
      if (contentType.startsWith('application/json')) {
        let json;
        try {
          json = await response.json();
        } catch (err) {
          this.debug('Error parsing error body as json:', err);
        }

        if (json && json['error_description']) throw new OAuth2Error(json['error_description'], response.status);
        if (json && json['error']) throw new OAuth2Error(json['error'], response.status);
        if (json && json['message']) throw new OAuth2Error(json['message'], response.status);
        if (json && Array.isArray(json['errors']) && json['errors'].length) {
          const errorStrings = json['errors'].map(error => {
            if (typeof error === 'string') return error;
            if (typeof error === 'object') {
              if (error['error_description']) return error['error_description'];
              if (error['error']) return error['error'];
              if (error['message']) return error['message'];
            }
            return String(error);
          });
          if (errorStrings.length) throw new OAuth2Error(errorStrings.join(', '), response.status);
        }
      }
    }

    throw new Error(`Invalid Response (${response.status} ${response.statusText})`);
  }

  /**
   * @param {object} args
   * @param {Error} args.err
   * @returns {Promise<void>}
   */
  async onRequestError({ err }) {
    this.debug('onRequestError', err);
    throw err;
  }

  /**
   * @param {object} args
   * @param {object} args.req
   * @param {string} args.url
   * @param {object} args.opts
   * @param {Response} args.response
   * @param {boolean} args.didRefreshToken
   * @returns {Promise<*>}
   */
  async onRequestResponse({ req, url, opts, response, didRefreshToken }) {
    const { ok, status, statusText, headers } = response;

    this.debug('[res]', { ok, status, statusText });

    const shouldRefreshToken = await this.onShouldRefreshToken(response);
    if (shouldRefreshToken) {
      if (didRefreshToken) {
        throw new OAuth2Error('Token refresh failed');
      } else {
        await this.refreshToken({ req, url, opts, response });
        return this._executeRequest(req, true);
      }
    }

    const isRateLimited = await this.onIsRateLimited({ status, headers });
    if (isRateLimited) {
      this.debug('Request is rate limited');
      throw new OAuth2Error('Rate Limited');
    }

    const result = await this.onHandleResponse({
      response,
      status,
      statusText,
      headers,
      ok,
    });

    return this.onHandleResult({ result, status, statusText, headers });
  }

  /**
   * @description This method returns a boolean if the token should be refreshed
   * @param {Response} response
   * @returns {Promise<boolean>}
   */
  async onShouldRefreshToken({ status }) {
    return status === 401;
  }

  /**
   * @description This method returns a boolean if the response is rate limited
   * @param {object} args
   * @param {number} args.status
   * @param {Headers} args.headers
   * @returns {Promise<boolean>}
   */
  async onIsRateLimited({ status, headers }) {
    return status === 429;
  }

  /**
   * @description This method handles a response and downloads the body
   * @param {object} args
   * @param {Response} args.response
   * @param {number} args.status
   * @param {string} args.statusText
   * @param {Headers} args.headers
   * @param {boolean} args.ok
   * @returns {Promise<*>}
   */
  async onHandleResponse({ response, status, statusText, headers, ok }) {
    if (status === 204) {
      return undefined;
    }

    let body;
    const contentType = headers.get('Content-Type');

    if (typeof contentType === 'string') {
      if (contentType.startsWith('application/json')) {
        body = await response.json();
      } else if (contentType.startsWith('image/')) {
        body = await response.arrayBuffer();
      } else {
        body = await response.text();
      }
    } else {
      body = await response.text();
    }

    if (ok) {
      return body;
    }

    const err = await this.onHandleNotOK({ body, status, statusText, headers });

    if (!(err instanceof Error)) {
      throw new OAuth2Error('Invalid onHandleNotOK return value, expected: instanceof Error');
    }

    throw err;
  }

  /**
   * @description This method handles a response that is not OK (400 <= statuscode <= 599)
   * @param {object} args
   * @param {*} args.body
   * @param {number} args.status
   * @param {string} args.statusText
   * @param {Headers} args.headers
   * @returns {Promise<Error>}
   */
  async onHandleNotOK({ body, status, statusText, headers }) {
    const message = `${status} ${statusText || 'Unknown Error'}`;
    const err = new Error(message);
    err.status = status;
    err.statusText = statusText;
    return err;
  }

  /**
   * @description This method handles a response that is OK
   * @param {object} args
   * @param {*} args.result
   * @param {number} args.status
   * @param {string} args.statusText
   * @param {Headers} args.headers
   * @returns {Promise<*>}
   */
  async onHandleResult({ result, status, statusText, headers }) {
    return result;
  }

  /**
   * @description This method returns data that can identify the session
   * @returns {Promise<{id: string, title: string|null}>}
   */
  async onGetOAuth2SessionInformation() {
    return {
      id: OAuth2Util.getRandomId(),
      title: null,
    };
  }

}

module.exports = OAuth2Client;
