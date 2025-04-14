/**
 * @fileoverview Email cache utility to prevent processing duplicate emails
 * @module utils/emailCache
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const config = require('../config');

// Singleton instance
let instance = null;

/**
 * Email cache class to prevent processing duplicate emails
 * In production, uses a MongoDB collection via EmailProcessingRecord model
 * In development or testing, uses a local file cache
 */
class EmailCache {
  /**
   * Create an email cache instance
   * @param {Object} options - Configuration options
   * @param {boolean} [options.forceFileCache=false] - Force using file cache even in production
   * @param {Object} [options.model] - Mongoose model to use for storing records (required in production)
   */
  constructor(options = {}) {
    this.options = {
      forceFileCache: false,
      ...options
    };

    this.useFileCache = !config.NODE_ENV || 
                        config.NODE_ENV === 'development' || 
                        config.NODE_ENV === 'test' || 
                        this.options.forceFileCache;
    
    this.model = this.options.model;
    this.cache = null;
    
    // Validate we have a model when not using file cache
    if (!this.useFileCache && !this.model) {
      throw new Error('EmailCache: Database model is required when not using file cache');
    }

    // When using file cache, prepare the file path
    if (this.useFileCache) {
      // Use the app's data directory or current directory for the cache file
      const cacheDir = config.DATA_DIR || __dirname;
      this.cacheFilePath = path.join(cacheDir, 'processed_emails_cache.json');
      logger.debug(`EmailCache: Using file cache at ${this.cacheFilePath}`);
    } else {
      logger.debug('EmailCache: Using database cache with model:', this.model.modelName);
    }

    // Load cache on initialization
    this.loadCache();
  }

  /**
   * Load the email cache from file (in dev mode) or initialize empty cache
   * @private
   */
  loadCache() {
    if (this.useFileCache) {
      try {
        if (fs.existsSync(this.cacheFilePath)) {
          const data = fs.readFileSync(this.cacheFilePath, 'utf8');
          this.cache = JSON.parse(data);
          logger.debug(`EmailCache: Loaded ${Object.keys(this.cache).length} cached email IDs from file`);
        } else {
          logger.debug(`EmailCache: Cache file not found, creating new cache`);
          this.cache = {};
          this.saveCache();
        }
      } catch (err) {
        logger.error(`EmailCache: Error loading cache file: ${err.message}`);
        this.cache = {};
      }
    } else {
      // When using database, we don't need to preload anything
      this.cache = null;
    }
  }

  /**
   * Save the email cache to file (only in dev mode)
   * @private
   */
  saveCache() {
    if (this.useFileCache && this.cache) {
      try {
        const cacheDir = path.dirname(this.cacheFilePath);
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
        logger.debug(`EmailCache: Saved ${Object.keys(this.cache).length} email IDs to cache file`);
      } catch (err) {
        logger.error(`EmailCache: Error saving cache file: ${err.message}`);
      }
    }
  }

  /**
   * Check if an email has been processed
   * @param {string} messageId - The email message ID
   * @returns {Promise<boolean>} - True if email has been processed
   */
  async isProcessed(messageId) {
    if (!messageId) {
      logger.warn('EmailCache: Cannot check null messageId');
      return false;
    }

    if (this.useFileCache) {
      return !!this.cache[messageId];
    } else {
      try {
        const record = await this.model.findOne({ messageId });
        return !!record;
      } catch (err) {
        logger.error(`EmailCache: Error checking if email is processed: ${err.message}`);
        return false;
      }
    }
  }

  /**
   * Mark an email as processed
   * @param {string} messageId - The email message ID
   * @param {Object} [metadata={}] - Additional metadata about the email
   * @returns {Promise<boolean>} - Success status
   */
  async markProcessed(messageId, metadata = {}) {
    if (!messageId) {
      logger.warn('EmailCache: Cannot mark null messageId as processed');
      return false;
    }

    if (this.useFileCache) {
      this.cache[messageId] = {
        processedAt: new Date().toISOString(),
        ...metadata
      };
      this.saveCache();
      return true;
    } else {
      try {
        // Use upsert to create or update the record
        await this.model.updateOne(
          { messageId },
          { 
            messageId,
            processedAt: new Date(),
            ...metadata
          },
          { upsert: true }
        );
        return true;
      } catch (err) {
        logger.error(`EmailCache: Error marking email as processed: ${err.message}`);
        return false;
      }
    }
  }

  /**
   * Remove an email from the cache
   * @param {string} messageId - The email message ID
   * @returns {Promise<boolean>} - Success status
   */
  async removeEmail(messageId) {
    if (!messageId) {
      logger.warn('EmailCache: Cannot remove null messageId');
      return false;
    }

    if (this.useFileCache) {
      if (this.cache[messageId]) {
        delete this.cache[messageId];
        this.saveCache();
        logger.debug(`EmailCache: Removed email ${messageId} from cache`);
        return true;
      }
      return false;
    } else {
      try {
        const result = await this.model.deleteOne({ messageId });
        const success = result.deletedCount > 0;
        if (success) {
          logger.debug(`EmailCache: Removed email ${messageId} from database`);
        }
        return success;
      } catch (err) {
        logger.error(`EmailCache: Error removing email from database: ${err.message}`);
        return false;
      }
    }
  }

  /**
   * Clear emails older than the specified days
   * @param {number} days - Number of days to keep emails for
   * @returns {Promise<number>} - Number of emails cleared
   */
  async clearOldEmails(days = 30) {
    if (this.useFileCache) {
      return this._clearOldEmailsFromFileCache(days);
    } else {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const result = await this.model.deleteMany({
          processedAt: { $lt: cutoffDate }
        });
        
        const count = result.deletedCount || 0;
        logger.info(`EmailCache: Cleared ${count} old emails from database (older than ${days} days)`);
        return count;
      } catch (err) {
        logger.error(`EmailCache: Error clearing old emails from database: ${err.message}`);
        return 0;
      }
    }
  }

  /**
   * Clear old emails from file cache
   * @param {number} days - Number of days to keep emails for
   * @returns {Promise<number>} - Number of emails cleared
   * @private
   */
  _clearOldEmailsFromFileCache(days) {
    if (!this.cache) return 0;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let count = 0;
    const newCache = {};
    
    for (const [messageId, data] of Object.entries(this.cache)) {
      const processedAt = new Date(data.processedAt);
      
      if (processedAt >= cutoffDate) {
        newCache[messageId] = data;
      } else {
        count++;
      }
    }
    
    // Only update and save if emails were actually cleared
    if (count > 0) {
      this.cache = newCache;
      this.saveCache();
      logger.info(`EmailCache: Cleared ${count} old emails from file cache (older than ${days} days)`);
    }
    
    return count;
  }
}

/**
 * Get the singleton instance of EmailCache
 * @param {Object} options - Options to pass to EmailCache constructor
 * @returns {EmailCache} - The singleton EmailCache instance
 */
function getInstance(options = {}) {
  if (!instance) {
    instance = new EmailCache(options);
  }
  return instance;
}

/**
 * Create a new instance of EmailCache
 * This is useful for testing or when you need multiple instances
 * @param {Object} options - Options to pass to EmailCache constructor
 * @returns {EmailCache} - A new EmailCache instance
 */
function createInstance(options = {}) {
  return new EmailCache(options);
}

module.exports = {
  EmailCache,
  getInstance,
  createInstance
}; 