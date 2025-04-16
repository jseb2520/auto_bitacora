/**
 * @fileoverview Export all middleware components
 * @module middleware
 */

const { apiKeyAuth, binanceWebhookAuth, revolutWebhookAuth, krakenWebhookAuth } = require('./auth');
const { rateLimiter } = require('./rateLimit');
const { requestLogger, errorLogger } = require('./logging');

// Health check middleware for Railway
const healthCheck = (req, res, next) => {
  if (req.path === '/health') {
    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development'
    });
  }
  next();
};

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
  errorLogger,
  healthCheck
}; 