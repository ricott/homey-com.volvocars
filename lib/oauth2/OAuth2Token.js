/* eslint-disable camelcase */

'use strict';

/**
 * @description OAuth2 Token class with expiration tracking
 */
class OAuth2Token {

  /**
   * @param {object} args
   * @param {string} args.access_token
   * @param {string} args.refresh_token
   * @param {string} args.token_type
   * @param {number} args.expires_in
   * @param {number} args.created_at - Timestamp when token was created/refreshed
   */
  constructor({
    access_token,
    refresh_token,
    token_type,
    expires_in,
    created_at,
  }) {
    this.access_token = access_token || null;
    this.refresh_token = refresh_token || null;
    this.token_type = token_type || null;
    this.expires_in = expires_in || null;
    
    // Track when the token was created for expiration calculations
    if (created_at) {
      this.created_at = created_at;
    } else {
      // If no created_at timestamp (token loaded from old storage), 
      // we can't reliably determine expiration
      this.created_at = null;
    }
  }

  /**
   * @returns {boolean}
   */
  isRefreshable() {
    return !!this.refresh_token;
  }

  /**
   * Check if token is expired or will expire soon (with adaptive buffer)
   * @param {number|null} bufferMinutes - Optional custom buffer in minutes
   * @returns {boolean}
   */
  isExpired(bufferMinutes = null) {
    if (!this.expires_in) {
      return false;
    }
    
    if (this.created_at === null) {
      // Legacy token without created_at - treat as expired to force refresh
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
      adaptiveBufferMinutes = Math.max(2, Math.min(4, tokenLifetimeMinutes * 0.5));
    }
    
    const bufferTime = adaptiveBufferMinutes * 60 * 1000;
    const willExpireSoon = now >= (expiresAt - bufferTime);
    
    return willExpireSoon;
  }

  /**
   * Check if token has completely expired (past expiration time)
   * @returns {boolean}
   */
  isCompletelyExpired() {
    if (!this.expires_in) {
      return false;
    }
    
    // If no created_at timestamp (legacy token), treat as potentially expired
    if (this.created_at === null) {
      return true;
    }
    
    const now = Date.now();
    const expiresAt = this.created_at + (this.expires_in * 1000);
    return now >= expiresAt;
  }

  /**
   * Get the expiration time as a Date object
   * @returns {Date|null}
   */
  getExpirationTime() {
    if (!this.expires_in || this.created_at === null) return null;
    return new Date(this.created_at + (this.expires_in * 1000));
  }

  /**
   * Get time remaining until expiration in milliseconds
   * @returns {number|null}
   */
  getTimeToExpiry() {
    if (!this.expires_in || this.created_at === null) return null;
    const expiresAt = this.created_at + (this.expires_in * 1000);
    return Math.max(0, expiresAt - Date.now());
  }

  /**
   * @returns {object}
   */
  toJSON() {
    return {
      access_token: this.access_token,
      refresh_token: this.refresh_token,
      token_type: this.token_type,
      expires_in: this.expires_in,
      created_at: this.created_at,
    };
  }

}

module.exports = OAuth2Token;
