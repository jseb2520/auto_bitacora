/**
 * @fileoverview Service for interacting with the Binance API
 * @module services/binanceService
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

/**
 * Binance API service for fetching and processing transaction data
 */
class BinanceService {
  constructor() {
    this.apiKey = config.binance.apiKey;
    this.apiSecret = config.binance.apiSecret;
    this.baseUrl = 'https://api.binance.com';
  }

  /**
   * Generates a signature for Binance API authentication
   * @param {Object} params - Request parameters
   * @returns {string} HMAC SHA256 signature
   * @private
   */
  _generateSignature(params) {
    const queryString = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Makes an authenticated request to Binance API
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Request parameters
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(endpoint, params = {}, method = 'GET') {
    const timestamp = Date.now();
    const requestParams = {
      ...params,
      timestamp,
    };

    const signature = this._generateSignature(requestParams);
    
    const url = `${this.baseUrl}${endpoint}?${new URLSearchParams(requestParams)}&signature=${signature}`;
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Binance API request failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetches transactions (orders) for the current day
   * @returns {Promise<Array>} Array of transaction objects
   */
  async fetchTodayTransactions() {
    // Calculate start of current day (UTC)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const params = {
      startTime: startOfDay.getTime(),
    };
    
    try {
      // Fetch all orders for the current day
      const allOrders = await this._makeRequest('/api/v3/allOrders', params);
      
      console.log(`Fetched ${allOrders.length} transactions from Binance for today`);
      
      return allOrders;
    } catch (error) {
      console.error('Failed to fetch today\'s transactions:', error);
      throw error;
    }
  }
}

module.exports = new BinanceService(); 