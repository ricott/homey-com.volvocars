'use strict';

/**
 * @description OAuth2 Utility functions
 */
class OAuth2Util {

  /**
   * Generate a random UUID-like ID
   * @returns {string}
   */
  static getRandomId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Wait for a specified delay
   * @param {number} delay - Delay in milliseconds
   * @returns {Promise<void>}
   */
  static async wait(delay = 1000) {
    await new Promise(resolve => {
      setTimeout(() => resolve(), delay);
    });
  }

}

module.exports = OAuth2Util;
