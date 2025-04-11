/**
 * @fileoverview Export all middleware components
 * @module middleware
 */

const { apiKeyAuth, binanceWebhookAuth, revolutWebhookAuth, krakenWebhookAuth } = require('./auth');
const { rateLimiter } = require('./rateLimit');
const { requestLogger, errorLogger } = require('./logging');

module.exports = {
  // Authentication middleware
  apiKeyAuth,
  binanceWebhookAuth,
  revolutWebhookAuth,
  krakenWebhookAuth,
  
  // Rate limiting middleware
  rateLimiter,
  
  // Logging middleware
  requestLogger,
  errorLogger
}; 