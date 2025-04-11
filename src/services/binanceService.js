/**
 * @fileoverview Service for interacting with the Binance API
 * @module services/binanceService
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const customerConfig = require('../config/customers');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('binanceService');

/**
 * Binance API service for fetching and processing transaction data
 */
class BinanceService {
  constructor() {
    this.apiKey = config.binance.apiKey;
    this.apiSecret = config.binance.apiSecret;
    this.baseUrl = 'https://api.binance.com';
    this.p2pBaseUrl = 'https://p2p.binance.com/bapi/c2c';
    
    // Log API credential configuration during initialization
    if (!this.apiKey || !this.apiSecret) {
      moduleLogger.warn('Binance credentials are missing or incomplete', {
        hasApiKey: !!this.apiKey,
        hasApiSecret: !!this.apiSecret,
        apiKeyLength: this.apiKey ? this.apiKey.length : 0,
        apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 4) + '...' : 'undefined',
        apiSecretPrefix: this.apiSecret ? this.apiSecret.substring(0, 4) + '...' : 'undefined'
      });
    } else {
      moduleLogger.info('Binance API credentials configured successfully', {
        apiKeyLength: this.apiKey.length,
        apiSecretLength: this.apiSecret.length,
        apiKeyPrefix: this.apiKey.substring(0, 4) + '...',
        apiSecretPrefix: this.apiSecret.substring(0, 4) + '...',
      });
    }
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
    
    moduleLogger.debug(`Making ${method} request to ${endpoint}`, { 
      params: { ...requestParams, signature: '***REDACTED***' },
      url: url.replace(/signature=[^&]+/, 'signature=***REDACTED***')
    });
    
    try {
      const startTime = Date.now();
      
      const response = await axios({
        method,
        url,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });
      
      const responseTime = Date.now() - startTime;
      
      const responseInfo = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        responseTime: `${responseTime}ms`,
        dataType: typeof response.data,
        dataLength: Array.isArray(response.data) ? response.data.length : 'object',
      };
      
      moduleLogger.debug(`Received response from ${endpoint}`, responseInfo);
      
      // Detailed logging of response data
      if (Array.isArray(response.data)) {
        if (response.data.length > 0) {
          moduleLogger.debug(`Sample data from ${endpoint} (${response.data.length} items)`, { 
            sample: response.data.slice(0, 3),
          });
          
          // Log some statistics about the data if it's an array of objects
          if (response.data.length > 0 && typeof response.data[0] === 'object') {
            const fields = Object.keys(response.data[0]);
            moduleLogger.debug(`Data fields in response from ${endpoint}`, { fields });
            
            // Log any potential customer identifiers in the first few items
            const potentialIdentifiers = response.data.slice(0, 5).map(item => ({
              id: item.id || item.orderId || item.txId,
              address: item.address || item.walletAddress,
              email: item.email,
              // Add any other potential identifier fields
            }));
            moduleLogger.debug(`Potential identifiers in response from ${endpoint}`, { potentialIdentifiers });
          }
        } else {
          moduleLogger.debug(`Empty array response from ${endpoint}`);
        }
      } else if (typeof response.data === 'object') {
        // For object responses, log the keys but not sensitive values
        moduleLogger.debug(`Object response from ${endpoint}`, { 
          keys: Object.keys(response.data),
          // Include a few safe fields if they exist
          id: response.data.id || response.data.orderId,
          status: response.data.status,
          success: response.data.success,
        });
      }
      
      return response.data;
    } catch (error) {
      // Enhanced error logging
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers,
        data: error.response?.data,
        code: error.code,
        url: url.replace(/signature=[^&]+/, 'signature=***REDACTED***'),
        method,
      };
      
      moduleLogger.error(`Binance API request to ${endpoint} failed`, errorInfo);
      
      // Log API-specific error information if available
      if (error.response?.data) {
        moduleLogger.error(`Binance API error details for ${endpoint}:`, error.response.data);
      }
      
      throw error;
    }
  }

  /**
   * Makes a request to Binance P2P API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeP2PRequest(endpoint, data = {}, method = 'POST') {
    const url = `${this.p2pBaseUrl}${endpoint}`;
    
    // Sanitize the data for logging
    const sanitizedData = { ...data };
    // Remove sensitive fields if any exist
    ['apiKey', 'secretKey', 'signature', 'key', 'secret'].forEach(key => {
      if (sanitizedData[key]) sanitizedData[key] = '***REDACTED***';
    });
    
    moduleLogger.debug(`Making ${method} request to P2P API ${endpoint}`, { 
      data: sanitizedData,
      url
    });
    
    try {
      const startTime = Date.now();
      
      const response = await axios({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'X-MBX-APIKEY': this.apiKey,
        },
        data,
      });
      
      const responseTime = Date.now() - startTime;
      
      const responseInfo = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        responseTime: `${responseTime}ms`,
        success: response.data?.success,
        message: response.data?.message,
        code: response.data?.code,
        dataType: typeof response.data,
      };
      
      if (response.data?.data) {
        responseInfo.dataStructure = Array.isArray(response.data.data) 
          ? `Array[${response.data.data.length}]` 
          : typeof response.data.data;
      }
      
      moduleLogger.debug(`Received response from P2P API ${endpoint}`, responseInfo);
      
      // Enhanced data logging
      if (response.data?.data) {
        if (Array.isArray(response.data.data)) {
          if (response.data.data.length > 0) {
            // Log a sample of the data (first few items)
            moduleLogger.debug(`Sample data from P2P API ${endpoint} (${response.data.data.length} items)`, { 
              sample: response.data.data.slice(0, 3),
            });
            
            // Log the fields present in the response
            if (typeof response.data.data[0] === 'object') {
              moduleLogger.debug(`Fields in P2P API ${endpoint} response items:`, {
                fields: Object.keys(response.data.data[0])
              });
              
              // Count statuses if present
              const statusCounts = response.data.data.reduce((acc, item) => {
                const status = item.status || item.orderStatus;
                if (status) {
                  acc[status] = (acc[status] || 0) + 1;
                }
                return acc;
              }, {});
              
              if (Object.keys(statusCounts).length > 0) {
                moduleLogger.debug(`Status distribution in P2P API ${endpoint} response:`, statusCounts);
              }
            }
          } else {
            moduleLogger.debug(`Empty array in data field from P2P API ${endpoint}`);
          }
        } else if (typeof response.data.data === 'object') {
          moduleLogger.debug(`Object in data field from P2P API ${endpoint}`, {
            keys: Object.keys(response.data.data)
          });
        }
      }
      
      return response.data;
    } catch (error) {
      // Enhanced error logging
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers,
        code: error.code,
        url,
        method,
      };
      
      if (error.response?.data) {
        errorInfo.responseData = error.response.data;
      }
      
      moduleLogger.error(`Binance P2P API request to ${endpoint} failed`, errorInfo);
      
      // Log P2P API-specific error information if available
      if (error.response?.data) {
        moduleLogger.error(`Binance P2P API error details for ${endpoint}:`, error.response.data);
      }
      
      throw error;
    }
  }

  /**
   * Fetches deposit history for the current day
   * @returns {Promise<Array>} Array of deposit objects
   */
  async fetchTodayDeposits() {
    // Calculate start of current day (UTC)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const params = {
      startTime: startOfDay.getTime(),
      endTime: Date.now(),
    };
    
    try {
      moduleLogger.info('Fetching today\'s deposits from Binance', { 
        startTime: new Date(params.startTime).toISOString(),
        endTime: new Date(params.endTime).toISOString()
      });
      
      // Check if credentials are available before making the request
      if (!this.apiKey || !this.apiSecret) {
        moduleLogger.warn('Skipping deposits fetch due to missing credentials');
        return [];
      }
      
      try {
        // Fetch deposit history
        const deposits = await this._makeRequest('/sapi/v1/capital/deposit/hisrec', params);
        
        // Transform deposits to a common format with customer identification
        const transformedDeposits = deposits.map(deposit => {
          // Try to identify customer by wallet address
          const customer = customerConfig.getCustomerByWalletAddress(deposit.address);
          
          return {
            orderId: deposit.txId,
            platform: 'BINANCE',
            transactionType: 'DEPOSIT',
            symbol: deposit.coin,
            side: 'DEPOSIT',
            type: 'DEPOSIT',
            price: 1, // For deposits, typically 1:1
            quantity: parseFloat(deposit.amount),
            quoteQuantity: parseFloat(deposit.amount),
            status: deposit.status === 1 ? 'COMPLETED' : 'PENDING',
            time: new Date(deposit.insertTime),
            updateTime: new Date(deposit.insertTime),
            customerId: customer ? customer.id : null,
            walletAddress: deposit.address,
            isWorking: false
          };
        });
        
        moduleLogger.info(`Processed ${transformedDeposits.length} deposits from Binance`, {
          completed: transformedDeposits.filter(d => d.status === 'COMPLETED').length,
          pending: transformedDeposits.filter(d => d.status !== 'COMPLETED').length,
          identified: transformedDeposits.filter(d => d.customerId).length
        });
        
        return transformedDeposits;
      } catch (error) {
        // If we get a 401 error, it's likely an authentication issue
        if (error.response && error.response.status === 401) {
          moduleLogger.warn('Authentication failed for Binance API (invalid or expired credentials)', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
          return [];
        }
        
        moduleLogger.error('Failed to fetch deposits from Binance', {
          error: error.message,
          stack: error.stack,
          status: error.response?.status,
          data: error.response?.data
        });
        return [];
      }
    } catch (outerError) {
      // This catches any errors in the surrounding code
      moduleLogger.error('Unexpected error in fetchTodayDeposits', {
        error: outerError.message,
        stack: outerError.stack
      });
      return [];
    }
  }

  /**
   * Fetches P2P trade history for the current day
   * @returns {Promise<Array>} Array of P2P trade objects
   */
  async fetchTodayP2PTrades() {
    // Calculate start of current day (UTC)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const data = {
      page: 1,
      rows: 100,
      startDate: startOfDay.getTime(),
      endDate: Date.now(),
      tradeType: 'SELL' // We're only interested in sell trades
    };
    
    try {
      moduleLogger.info('Fetching today\'s P2P trades from Binance', { 
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString()
      });
      
      // Check if credentials are available before making the request
      if (!this.apiKey || !this.apiSecret) {
        moduleLogger.warn('Skipping P2P trades fetch due to missing credentials');
        return [];
      }
      
      // Fetch P2P trade history
      try {
        const response = await this._makeP2PRequest('/v1/private/trade-history', data);
        
        if (!response.success) {
          moduleLogger.warn(`Binance P2P API returned non-success response: ${response.message || 'Unknown error'}`);
          return [];
        }
        
        const trades = response.data || [];
        
        // Transform P2P trades to a common format with customer identification
        const transformedTrades = trades.map(trade => {
          // Try to identify customer by payment details
          const paymentDetails = this._extractPaymentDetails(trade);
          const customer = this._identifyCustomerFromP2PTrade(trade, paymentDetails);
          
          return {
            orderId: trade.orderNumber,
            platform: 'BINANCE',
            transactionType: 'P2P_SELL',
            symbol: trade.asset,
            side: 'SELL',
            type: 'P2P',
            price: parseFloat(trade.unitPrice),
            quantity: parseFloat(trade.amount),
            quoteQuantity: parseFloat(trade.totalPrice),
            status: trade.orderStatus === 'COMPLETED' ? 'COMPLETED' : trade.orderStatus,
            time: new Date(trade.createTime),
            updateTime: new Date(trade.updateTime),
            customerId: customer ? customer.id : null,
            paymentDetails,
            isWorking: false
          };
        });
        
        moduleLogger.info(`Processed ${transformedTrades.length} P2P trades from Binance`, {
          completed: transformedTrades.filter(t => t.status === 'COMPLETED').length,
          identified: transformedTrades.filter(t => t.customerId).length
        });
        
        return transformedTrades;
      } catch (error) {
        // If we get a 401 error, it's likely an authentication issue
        if (error.response && error.response.status === 401) {
          moduleLogger.warn('Authentication failed for Binance P2P API (invalid or expired credentials)', {
            status: error.response.status,
            statusText: error.response.statusText
          });
          return [];
        }
        
        // For other errors, log but don't throw
        moduleLogger.error('Failed to fetch P2P trades from Binance', {
          error: error.message,
          code: error.code,
          status: error.response?.status
        });
        return [];
      }
    } catch (outerError) {
      // This catches any errors in the surrounding code
      moduleLogger.error('Unexpected error in fetchTodayP2PTrades', {
        error: outerError.message,
        stack: outerError.stack
      });
      return [];
    }
  }

  /**
   * Extracts payment details from a P2P trade
   * @param {Object} trade - P2P trade object
   * @returns {Object} Payment details
   * @private
   */
  _extractPaymentDetails(trade) {
    const paymentDetails = {
      method: trade.paymentMethod || 'Unknown',
      accountId: null,
      email: null,
      phone: null,
      reference: trade.reference || null,
      additionalInfo: {}
    };
    
    // If there's a structured paymentDetails field, extract from it
    if (trade.paymentDetails) {
      try {
        const details = typeof trade.paymentDetails === 'string' 
          ? JSON.parse(trade.paymentDetails) 
          : trade.paymentDetails;
          
        paymentDetails.accountId = details.accountId || details.account || details.accountNumber || null;
        paymentDetails.email = details.email || null;
        paymentDetails.phone = details.phone || details.phoneNumber || null;
        
        // Add all other details to additionalInfo
        Object.keys(details).forEach(key => {
          if (!['accountId', 'account', 'accountNumber', 'email', 'phone', 'phoneNumber'].includes(key)) {
            paymentDetails.additionalInfo[key] = details[key];
          }
        });
      } catch (e) {
        console.error('Error parsing payment details:', e);
      }
    }
    
    return paymentDetails;
  }

  /**
   * Identifies a customer from P2P trade details
   * @param {Object} trade - P2P trade object
   * @param {Object} paymentDetails - Extracted payment details
   * @returns {Object|null} Customer object or null if not identified
   * @private
   */
  _identifyCustomerFromP2PTrade(trade, paymentDetails) {
    // Try to match by Revolut account details
    const revolutDetails = {
      accountId: paymentDetails.accountId,
      email: paymentDetails.email,
      phone: paymentDetails.phone
    };
    
    const customer = customerConfig.getCustomerByRevolutDetails(revolutDetails);
    
    return customer;
  }

  /**
   * Fetches transactions (orders, deposits, P2P) for the current day
   * @returns {Promise<Array>} Array of transaction objects
   */
  async fetchTodayTransactions() {
    try {
      // Get today's trading data
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startTime = startOfDay.getTime();
      
      moduleLogger.info('Fetching all transaction types from Binance', {
        startTime: new Date(startTime).toISOString()
      });
      
      // Check if credentials are available before making the request
      if (!this.apiKey || !this.apiSecret) {
        moduleLogger.warn('Skipping Binance transactions fetch due to missing credentials');
        return [];
      }
      
      // Define the trading pairs we're interested in
      const tradingPairs = ['BTCUSDT', 'ETHUSDT', 'USDTTRY'];
      
      try {
        // Fetch orders for all trading pairs, deposits, and P2P trades in parallel
        const [orders, deposits, p2pTrades] = await Promise.all([
          this.fetchTodayOrders(tradingPairs, startTime).catch(error => {
            moduleLogger.error('Error fetching orders', { error: error.message });
            return [];
          }),
          this.fetchTodayDeposits().catch(error => {
            moduleLogger.error('Error fetching deposits', { error: error.message });
            return [];
          }),
          this.fetchTodayP2PTrades().catch(error => {
            moduleLogger.error('Error fetching P2P trades', { error: error.message });
            return [];
          })
        ]);
        
        // Combine all transaction types
        const allTransactions = [
          ...orders,
          ...deposits,
          ...p2pTrades
        ];
        
        moduleLogger.info(`Fetched ${allTransactions.length} total transactions from Binance for today`, {
          orders: orders.length,
          deposits: deposits.length,
          p2pTrades: p2pTrades.length
        });
        
        return allTransactions;
      } catch (error) {
        moduleLogger.error('Failed to fetch transactions from Binance', { 
          error: error.message,
          stack: error.stack,
          code: error.code,
          statusCode: error.response?.status
        });
        
        return [];
      }
    } catch (outerError) {
      moduleLogger.error('Unexpected error in fetchTodayTransactions', { 
        error: outerError.message,
        stack: outerError.stack
      });
      
      return [];
    }
  }

  /**
   * Fetches order history for multiple symbols for the current day
   * @param {Array<string>} symbols - Array of trading pair symbols to fetch orders for
   * @param {number} startTime - Start time in milliseconds
   * @returns {Promise<Array>} Array of transformed order objects
   */
  async fetchTodayOrders(symbols = ['BTCUSDT'], startTime) {
    try {
      moduleLogger.info('Fetching orders for symbols', { symbols, startTime: new Date(startTime).toISOString() });
      
      // Check if credentials are available before making the request
      if (!this.apiKey || !this.apiSecret) {
        moduleLogger.warn('Skipping orders fetch due to missing credentials');
        return [];
      }
      
      try {
        // For each symbol, make a separate API call to fetch orders
        const orderPromises = symbols.map(symbol => 
          this._makeRequest('/api/v3/allOrders', { 
            symbol,
            startTime,
            limit: 1000 // Maximum allowed by the API
          }).catch(error => {
            // Handle errors for individual symbol requests
            moduleLogger.error(`Failed to fetch orders for symbol ${symbol}`, {
              error: error.message,
              status: error.response?.status,
              data: error.response?.data
            });
            return []; // Return empty array for this symbol
          })
        );
        
        // Wait for all API calls to complete
        const symbolOrdersArray = await Promise.all(orderPromises);
        
        // Flatten the array of arrays and transform orders
        const allOrders = symbolOrdersArray.flat();
        
        moduleLogger.info(`Fetched ${allOrders.length} orders across ${symbols.length} symbols`);
        
        // Transform regular orders to a common format
        const transformedOrders = allOrders.map(order => {
          // Try to identify customer if possible - for example by client order ID if we use a convention
          // This is optional and depends on your business logic
          const customer = null; // Implement customer identification logic if needed
          
          return {
            orderId: order.orderId,
            platform: 'BINANCE',
            transactionType: 'ORDER',
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            price: parseFloat(order.price) || 0,
            quantity: parseFloat(order.origQty) || 0,
            quoteQuantity: parseFloat(order.cummulativeQuoteQty) || 0,
            status: order.status,
            time: new Date(order.time),
            updateTime: new Date(order.updateTime || order.time),
            customerId: customer ? customer.id : null,
            clientOrderId: order.clientOrderId,
            isWorking: order.isWorking
          };
        });
        
        moduleLogger.info(`Processed ${transformedOrders.length} orders from Binance`, {
          completed: transformedOrders.filter(o => o.status === 'FILLED').length,
          active: transformedOrders.filter(o => o.status === 'NEW').length,
          canceled: transformedOrders.filter(o => o.status === 'CANCELED').length
        });
        
        return transformedOrders;
      } catch (error) {
        // If we get a 401 error, it's likely an authentication issue
        if (error.response && error.response.status === 401) {
          moduleLogger.warn('Authentication failed for Binance API (invalid or expired credentials)', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
          return [];
        }
        
        moduleLogger.error('Failed to fetch orders from Binance', { 
          error: error.message,
          symbols,
          stack: error.stack
        });
        // Return empty array instead of throwing to allow other transactions to be processed
        return [];
      }
    } catch (outerError) {
      // This catches any errors in the surrounding code
      moduleLogger.error('Unexpected error in fetchTodayOrders', {
        error: outerError.message,
        stack: outerError.stack
      });
      return [];
    }
  }
}

module.exports = new BinanceService(); 