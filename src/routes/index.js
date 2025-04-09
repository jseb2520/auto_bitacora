/**
 * @fileoverview API routes definition
 * @module routes
 */

const express = require('express');
const binanceWebhookController = require('../controllers/webhookController');
const revolutWebhookController = require('../controllers/revolutWebhookController');
const krakenWebhookController = require('../controllers/krakenWebhookController');

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
router.post('/webhook/binance', binanceWebhookController.handleWebhook);

/**
 * @route POST /api/webhook/revolut
 * @description Webhook endpoint for Revolut transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/revolut', revolutWebhookController.handleWebhook);

/**
 * @route POST /api/webhook/kraken
 * @description Webhook endpoint for Kraken transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/kraken', krakenWebhookController.handleWebhook);

module.exports = router; 