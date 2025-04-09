/**
 * @fileoverview Service for interacting with the Revolut API
 * @module services/revolutService
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

/**
 * Revolut API service for fetching and processing transaction data
 */
class RevolutService {
  constructor() {
    this.apiKey = config.revolut.apiKey;
    this.apiSecret = config.revolut.apiSecret;
    this.clientId = config.revolut.clientId;
    this.baseUrl = 'https://merchant.revolut.com/api/1.0';
  }

  /**
   * Generates a signature for Revolut API authentication
   * @param {Object} params - Request parameters
   * @returns {string} HMAC SHA256 signature
   * @private
   */
  _generateSignature(params) {
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Makes an authenticated request to Revolut API
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Request parameters
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(endpoint, params = {}, method = 'GET') {
    const timestamp = Math.floor(Date.now() / 1000);
    const requestParams = {
      ...params,
      client_id: this.clientId,
      timestamp,
    };

    const signature = this._generateSignature(requestParams);
    
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-Signature': signature,
          'Content-Type': 'application/json',
        },
        params: method === 'GET' ? requestParams : undefined,
        data: method !== 'GET' ? requestParams : undefined,
      });
      
      return response.data;
    } catch (error) {
      console.error('Revolut API request failed:', error.response?.data || error.message);
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
      from: Math.floor(startOfDay.getTime() / 1000),
      to: Math.floor(Date.now() / 1000),
    };
    
    try {
      // Fetch all crypto orders for the current day
      const response = await this._makeRequest('/crypto/orders', params);
      
      // Map Revolut orders to a common format
      const transactions = response.orders.map(order => ({
        orderId: order.id,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        price: parseFloat(order.price),
        origQty: parseFloat(order.amount),
        cummulativeQuoteQty: parseFloat(order.amount) * parseFloat(order.price),
        status: this._mapOrderStatus(order.status),
        time: new Date(order.created_at * 1000),
        updateTime: new Date(order.updated_at * 1000),
        isWorking: order.status === 'open',
      }));
      
      console.log(`Fetched ${transactions.length} transactions from Revolut for today`);
      
      return transactions;
    } catch (error) {
      console.error('Failed to fetch today\'s transactions from Revolut:', error);
      throw error;
    }
  }

  /**
   * Maps Revolut order status to a common format
   * @param {string} status - Revolut order status
   * @returns {string} Mapped status
   * @private
   */
  _mapOrderStatus(status) {
    const statusMap = {
      'completed': 'FILLED',
      'cancelled': 'CANCELED',
      'failed': 'REJECTED',
      'open': 'NEW',
      'pending': 'PENDING',
    };
    
    return statusMap[status] || status.toUpperCase();
  }
}

module.exports = new RevolutService(); 