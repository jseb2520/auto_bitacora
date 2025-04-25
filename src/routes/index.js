/**
 * @fileoverview API routes definition
 * @module routes
 */

const express = require('express');
const binanceWebhookController = require('../controllers/binanceWebhookController');
const revolutWebhookController = require('../controllers/revolutWebhookController');
const krakenWebhookController = require('../controllers/krakenWebhookController');
const summaryController = require('../controllers/summaryController');
const healthController = require('../controllers/healthController');
const schedulerController = require('../controllers/schedulerController');
const middleware = require('../middleware');

const router = express.Router();

// Apply logging middleware to all routes
router.use(middleware.requestLogger);

// Apply rate limiting to all routes
router.use(middleware.rateLimiter({ 
  windowMs: 60000, // 1 minute
  maxRequests: 100 // 100 requests per minute
}));

/**
 * @route GET /api/health
 * @description Basic health check endpoint
 * @access Public
 */
router.get('/health', healthController.healthCheck);

/**
 * @route GET /api/metrics
 * @description Detailed system metrics
 * @access Private (protected by API key)
 */
router.get('/metrics', middleware.apiKeyAuth, healthController.getMetrics);

/**
 * @route POST /api/metrics/reset
 * @description Reset collected metrics
 * @access Private (protected by API key)
 */
router.post('/metrics/reset', middleware.apiKeyAuth, healthController.resetMetrics);

/**
 * @route POST /api/webhook/binance
 * @description Webhook endpoint for Binance transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/binance', middleware.binanceWebhookAuth, binanceWebhookController.handleWebhook);

/**
 * @route POST /api/webhook/revolut
 * @description Webhook endpoint for Revolut transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/revolut', middleware.revolutWebhookAuth, revolutWebhookController.handleWebhook);

/**
 * @route POST /api/webhook/kraken
 * @description Webhook endpoint for Kraken transaction updates
 * @access Private (secured by signature validation)
 */
router.post('/webhook/kraken', middleware.krakenWebhookAuth, krakenWebhookController.handleWebhook);

// Apply API key authentication to all customer and summary routes
router.use(['/customers', '/summaries'], middleware.apiKeyAuth);

/**
 * @route GET /api/customers
 * @description Get all customers
 * @access Private (protected by API key)
 */
router.get('/customers', summaryController.getCustomers);

/**
 * @route POST /api/summaries/generate-all
 * @description Generate and send daily summaries for all customers
 * @access Private (protected by API key)
 */
router.post('/summaries/generate-all', summaryController.generateAllSummaries);

/**
 * @route GET /api/summaries/customer/:customerId
 * @description Generate a summary for a specific customer
 * @access Private (protected by API key)
 */
router.get('/summaries/customer/:customerId', summaryController.generateCustomerSummary);

/**
 * @route POST /api/summaries/send/:customerId
 * @description Send a summary to a specific customer via Telegram
 * @access Private (protected by API key)
 */
router.post('/summaries/send/:customerId', summaryController.sendCustomerSummary);

/**
 * @route POST /api/summaries/generate-test
 * @description Test endpoint to generate summaries for a custom date range
 * @access Private (protected by API key)
 */
router.post('/summaries/generate-test', summaryController.generateTestSummaries);

/**
 * @route GET /api/scheduler/status
 * @description Get the status of the email processing scheduler
 * @access Private (protected by API key)
 */
router.get('/scheduler/status', middleware.apiKeyAuth, schedulerController.getStatus);

/**
 * @route GET /api/scheduler/diagnostics
 * @description Get detailed diagnostics for the scheduler
 * @access Private (protected by API key)
 */
router.get('/scheduler/diagnostics', middleware.apiKeyAuth, schedulerController.getDiagnostics);

/**
 * @route POST /api/scheduler/run
 * @description Manually run the scheduled email processing task
 * @access Private (protected by API key)
 */
router.post('/scheduler/run', middleware.apiKeyAuth, schedulerController.runManually);

/**
 * @route POST /api/scheduler/reschedule
 * @description Force reschedule the email processing task
 * @access Private (protected by API key)
 */
router.post('/scheduler/reschedule', middleware.apiKeyAuth, schedulerController.forceReschedule);

/**
 * @route POST /api/scheduler/check-missed
 * @description Manually check for missed scheduled jobs
 * @access Private (protected by API key)
 */
router.post('/scheduler/check-missed', middleware.apiKeyAuth, schedulerController.checkMissedJobs);

// Error logging for all routes
router.use(middleware.errorLogger);

module.exports = router; 