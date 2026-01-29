'use strict';

/**
 * @extends Error
 * @description OAuth2 specific error class
 */
class OAuth2Error extends Error {

  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode = null) {
    super(message);
    this.statusCode = statusCode;
  }

  /**
   * @returns {string}
   */
  toString() {
    return `[OAuth2Error] ${super.toString()}`;
  }

}

module.exports = OAuth2Error;
