const redis = require('../config/redis');

/**
 * Cache utility for Redis
 */
const cache = {
  /**
   * Set value in cache
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttl - Time to live in seconds
   */
  set: async (key, value, ttl = 3600) => {
    try {
      const stringValue = JSON.stringify(value);
      await redis.set(key, stringValue, 'EX', ttl);
    } catch (err) {
      console.error(`Cache Set Error [${key}]:`, err.message);
    }
  },

  /**
   * Get value from cache
   * @param {string} key 
   * @returns {any|null}
   */
  get: async (key) => {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`Cache Get Error [${key}]:`, err.message);
      return null;
    }
  },

  /**
   * Delete value from cache
   * @param {string} key 
   */
  del: async (key) => {
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`Cache Del Error [${key}]:`, err.message);
    }
  },

  /**
   * Delete keys matching pattern
   * @param {string} pattern 
   */
  delPattern: async (pattern) => {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      console.error(`Cache DelPattern Error [${pattern}]:`, err.message);
    }
  }
};

module.exports = cache;
