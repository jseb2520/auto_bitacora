/**
 * @fileoverview Service for interacting with the Kraken API
 * @module services/krakenService
 */

const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const config = require('../config');

/**
 * Kraken API service for fetching and processing transaction data
 */
class KrakenService {
  constructor() {
    this.apiKey = config.kraken.apiKey;
    this.apiSecret = config.kraken.apiSecret;
    this.baseUrl = 'https://api.kraken.com';
    this.apiVersion = '0';
  }

  /**
   * Generates a signature for Kraken API authentication
   * @param {string} path - API path
   * @param {Object} params - Request parameters
   * @param {number} nonce - Unique nonce value
   * @returns {string} Base64 encoded signature
   * @private
   */
  _generateSignature(path, params, nonce) {
    const postData = querystring.stringify(params);
    const secret = Buffer.from(this.apiSecret, 'base64');
    
    // Create message to sign
    const message = querystring.stringify(params);
    const hash = crypto.createHash('sha256').update(nonce + message).digest();
    
    // Create HMAC
    const hmac = crypto.createHmac('sha512', secret)
      .update(path + hash)
      .digest('base64');
    
    return hmac;
  }

  /**
   * Makes an authenticated request to Kraken API
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(endpoint, params = {}) {
    const path = `/${this.apiVersion}${endpoint}`;
    const url = `${this.baseUrl}${path}`;
    
    // Add nonce to parameters
    const nonce = Date.now() * 1000;
    const requestParams = {
      ...params,
      nonce,
    };
    
    const signature = this._generateSignature(path, requestParams, nonce);
    
    try {
      const response = await axios({
        method: 'POST',
        url,
        headers: {
          'API-Key': this.apiKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: querystring.stringify(requestParams),
      });
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }
      
      return response.data.result;
    } catch (error) {
      console.error('Kraken API request failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetches transactions (orders) for the current day
   * @returns {Promise<Array>} Array of transaction objects
   */
  async fetchTodayTransactions() {
    // Calculate start of current day (Unix timestamp in seconds)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startTime = Math.floor(startOfDay.getTime() / 1000);
    
    const params = {
      start: startTime,
    };
    
    try {
      // Fetch closed orders for the current day
      const closedOrders = await this._makeRequest('/private/ClosedOrders', params);
      
      // Map Kraken orders to a common format
      const transactions = Object.entries(closedOrders.closed).map(([orderId, order]) => ({
        orderId,
        symbol: order.descr.pair,
        side: order.descr.type.toUpperCase(),
        type: order.descr.ordertype.toUpperCase(),
        price: parseFloat(order.price),
        origQty: parseFloat(order.vol),
        cummulativeQuoteQty: parseFloat(order.cost),
        status: this._mapOrderStatus(order.status),
        time: new Date(order.opentm * 1000),
        updateTime: new Date(order.closetm * 1000),
        isWorking: false,
      }));
      
      console.log(`Fetched ${transactions.length} transactions from Kraken for today`);
      
      return transactions;
    } catch (error) {
      console.error('Failed to fetch today\'s transactions from Kraken:', error);
      throw error;
    }
  }

  /**
   * Maps Kraken order status to a common format
   * @param {string} status - Kraken order status
   * @returns {string} Mapped status
   * @private
   */
  _mapOrderStatus(status) {
    const statusMap = {
      'closed': 'FILLED',
      'canceled': 'CANCELED',
      'expired': 'EXPIRED',
      'open': 'NEW',
      'pending': 'PENDING',
    };
    
    return statusMap[status] || status.toUpperCase();
  }
}

module.exports = new KrakenService(); 