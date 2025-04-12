/**
 * @fileoverview Simple cache utility to prevent processing duplicate emails
 * @module utils/emailCache
 */

const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('./logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('emailCache');

/**
 * Email cache service for preventing duplicate email processing
 */
class EmailCache {
  /**
   * Constructor
   * @param {string} cacheFilePath - Path to the JSON cache file (relative to project root)
   */
  constructor(cacheFilePath = 'email-cache.json') {
    this.cacheFilePath = path.join(process.cwd(), cacheFilePath);
    this.cache = this.loadCache();
  }

  /**
   * Load the cache from disk
   * @returns {Object} The cache object
   * @private
   */
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, 'utf8');
        moduleLogger.debug(`Loaded email cache from ${this.cacheFilePath}`);
        return JSON.parse(data);
      }
      moduleLogger.debug(`No existing cache found at ${this.cacheFilePath}, creating new cache`);
      return { processedEmails: {}, lastUpdated: new Date().toISOString() };
    } catch (error) {
      moduleLogger.error(`Error loading email cache: ${error.message}`);
      return { processedEmails: {}, lastUpdated: new Date().toISOString() };
    }
  }

  /**
   * Save the cache to disk
   * @private
   */
  saveCache() {
    try {
      this.cache.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
      moduleLogger.debug(`Saved email cache to ${this.cacheFilePath}`);
    } catch (error) {
      moduleLogger.error(`Error saving email cache: ${error.message}`);
    }
  }

  /**
   * Check if an email has already been processed
   * @param {string} messageId - The email message ID
   * @returns {boolean} True if the email has been processed, false otherwise
   */
  isEmailProcessed(messageId) {
    return !!this.cache.processedEmails[messageId];
  }

  /**
   * Mark an email as processed
   * @param {string} messageId - The email message ID
   * @param {Object} metadata - Additional metadata to store (optional)
   */
  markEmailAsProcessed(messageId, metadata = {}) {
    this.cache.processedEmails[messageId] = {
      processedAt: new Date().toISOString(),
      ...metadata
    };
    this.saveCache();
  }

  /**
   * Get information about a processed email
   * @param {string} messageId - The email message ID
   * @returns {Object|null} The email metadata or null if not found
   */
  getEmailInfo(messageId) {
    return this.cache.processedEmails[messageId] || null;
  }

  /**
   * Get all processed email IDs
   * @returns {string[]} Array of processed email IDs
   */
  getAllProcessedEmailIds() {
    return Object.keys(this.cache.processedEmails);
  }

  /**
   * Remove an email from the cache
   * @param {string} messageId - The email message ID
   * @returns {boolean} True if the email was removed, false if it wasn't in the cache
   */
  removeEmail(messageId) {
    if (this.cache.processedEmails[messageId]) {
      delete this.cache.processedEmails[messageId];
      this.saveCache();
      return true;
    }
    return false;
  }

  /**
   * Clear emails from the cache that are older than the specified number of days
   * @param {number} days - Number of days to keep emails in the cache
   * @returns {number} Number of emails removed from the cache
   */
  clearOldEmails(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();
    
    let removedCount = 0;
    
    Object.entries(this.cache.processedEmails).forEach(([messageId, metadata]) => {
      if (metadata.processedAt < cutoffIso) {
        delete this.cache.processedEmails[messageId];
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      this.saveCache();
      moduleLogger.info(`Cleared ${removedCount} old emails from cache`);
    }
    
    return removedCount;
  }
}

// Export a singleton instance
module.exports = new EmailCache(); 