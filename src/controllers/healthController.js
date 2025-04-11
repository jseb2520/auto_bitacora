/**
 * @fileoverview Controller for health check and monitoring endpoints
 * @module controllers/healthController
 */

const monitoring = require('../utils/monitoring');
const mongoose = require('mongoose');

/**
 * Basic health check endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void}
 */
const healthCheck = (req, res) => {
  // Check database connection
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus
  };
  
  res.status(200).json(healthData);
  
  // Track successful request
  monitoring.trackRequest('success');
};

/**
 * Detailed system metrics endpoint (protected with API key auth)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void}
 */
const getMetrics = (req, res) => {
  const metrics = monitoring.getHealthMetrics();
  res.status(200).json(metrics);
  
  // Track successful request
  monitoring.trackRequest('success');
};

/**
 * Reset collected metrics (protected with API key auth)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void}
 */
const resetMetrics = (req, res) => {
  monitoring.resetMetrics();
  
  res.status(200).json({
    success: true,
    message: 'Metrics have been reset'
  });
  
  // Track successful request
  monitoring.trackRequest('success');
};

module.exports = {
  healthCheck,
  getMetrics,
  resetMetrics
}; 