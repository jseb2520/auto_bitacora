/**
 * @fileoverview API routes definition
 * @module routes
 */

const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

/**
 * @route GET /api/health
 * @description Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

/**
 * @route POST /api/webhook/binance
 * @description Webhook endpoint for Binance transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/binance', webhookController.handleWebhook);

module.exports = router; 