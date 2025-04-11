/**
 * @fileoverview Authentication middleware for API endpoints
 * @module middleware/auth
 */

const config = require('../config');
const crypto = require('./crypto');
const monitoring = require('../utils/monitoring');

/**
 * API key authentication middleware
 * Validates that requests include a valid API key in the header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const apiKeyAuth = (req, res, next) => {
  // Look for API key in various header formats
  const apiKey = req.header('X-API-Key') || 
                req.header('x-api-key') || 
                req.header('api-key') || 
                req.header('API-Key') ||
                req.query.apiKey;  // Allow API key as query parameter for testing
  
  // Log request information for debugging
  const requestInfo = {
    path: req.path,
    method: req.method,
    ip: req.ip,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined,
      'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : undefined,
      'X-API-Key': req.headers['X-API-Key'] ? '[PRESENT]' : undefined,
      'api-key': req.headers['api-key'] ? '[PRESENT]' : undefined,
    },
    query: { ...req.query, apiKey: req.query.apiKey ? '[PRESENT]' : undefined },
    hasApiKey: !!apiKey,
    isValidApiKey: apiKey === config.server.apiKey
  };
  
  // For debugging purposes during development
  console.log('Auth debug - API key received:', apiKey ? '[PRESENT]' : '[MISSING]');
  console.log('Auth debug - Expected API key:', config.server.apiKey ? '[CONFIGURED]' : '[MISSING]');
  console.log('Auth debug - Request info:', JSON.stringify(requestInfo, null, 2));
  
  // Check if API key is provided
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key is required. Add X-API-Key header with your API key.'
    });
  }
  
  // Check if the provided key matches the configured key
  if (apiKey !== config.server.apiKey) {
    console.log('Auth debug - Invalid API key provided. Expected:', config.server.apiKey, 'Received:', apiKey);
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }
  
  // If API key is valid, proceed to the next middleware or route handler
  console.log('Auth debug - API key validation successful');
  next();
};

/**
 * Webhook signature validation middleware for Binance
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const binanceWebhookAuth = (req, res, next) => {
  const signature = req.header('X-Binance-Signature');
  
  // Store the raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({
      success: false,
      error: 'Binance webhook signature is required'
    });
  }
  
  // Verify the signature
  if (!crypto.verifyBinanceSignature(rawBody, signature)) {
    monitoring.trackRequest('error');
    return res.status(403).json({
      success: false,
      error: 'Invalid Binance webhook signature'
    });
  }
  
  next();
};

/**
 * Webhook signature validation middleware for Revolut
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const revolutWebhookAuth = (req, res, next) => {
  const signature = req.header('X-Revolut-Signature');
  
  // Store the raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({
      success: false,
      error: 'Revolut webhook signature is required'
    });
  }
  
  // Verify the signature
  if (!crypto.verifyRevolutSignature(rawBody, signature)) {
    monitoring.trackRequest('error');
    return res.status(403).json({
      success: false,
      error: 'Invalid Revolut webhook signature'
    });
  }
  
  next();
};

/**
 * Webhook signature validation middleware for Kraken
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const krakenWebhookAuth = (req, res, next) => {
  const signature = req.header('X-Kraken-Signature');
  
  // Store the raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({
      success: false,
      error: 'Kraken webhook signature is required'
    });
  }
  
  // Verify the signature
  if (!crypto.verifyKrakenSignature(rawBody, signature)) {
    monitoring.trackRequest('error');
    return res.status(403).json({
      success: false,
      error: 'Invalid Kraken webhook signature'
    });
  }
  
  next();
};

module.exports = {
  apiKeyAuth,
  binanceWebhookAuth,
  revolutWebhookAuth,
  krakenWebhookAuth
}; 