/**
 * @fileoverview Controller for managing transaction summaries
 * @module controllers/summaryController
 */

const summaryService = require('../services/summaryService');
const transactionService = require('../services/transactionService');
const customerConfig = require('../config/customers');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('summaryController');

/**
 * Generates and sends daily summaries for all customers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const generateAllSummaries = async (req, res) => {
  try {
    moduleLogger.info('Manually triggered daily summary generation');
    
    // First fetch the latest transactions to ensure we have up-to-date data
    moduleLogger.info('Fetching latest transactions before generating summaries');
    await transactionService.fetchAndStoreTransactions();
    
    const summaries = await summaryService.generateAndSendDailySummaries();
    
    res.status(200).json({
      success: true,
      message: 'Daily summaries generated and sent successfully',
      data: {
        count: summaries.length,
        summaries
      }
    });
  } catch (error) {
    moduleLogger.error('Failed to generate and send daily summaries:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate and send daily summaries',
      message: error.message
    });
  }
};

/**
 * Generates and sends test summaries for all customers based on date range
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const generateTestSummaries = async (req, res) => {
  try {
    const { startDate, endDate, sendNotification = false } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }
    
    const startDateTime = new Date(startDate);
    startDateTime.setUTCHours(0, 0, 0, 0);
    
    const endDateTime = new Date(endDate);
    endDateTime.setUTCHours(23, 59, 59, 999);
    
    moduleLogger.info(`Generating test summaries for date range ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);
    
    // Fetch latest transactions first to ensure we have up-to-date data for the test
    moduleLogger.info('Fetching latest transactions before generating test summaries');
    await transactionService.fetchAndStoreTransactions();
    
    const summaries = await summaryService.generateAllSummariesForDateRange(
      startDateTime,
      endDateTime,
      sendNotification
    );
    
    moduleLogger.info(`Generated ${summaries.length} test summaries`);
    
    res.status(200).json({
      success: true,
      message: 'Test summaries generated successfully',
      data: {
        count: summaries.length,
        summaries
      }
    });
  } catch (error) {
    moduleLogger.error('Failed to generate test summaries:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate test summaries',
      message: error.message
    });
  }
};

/**
 * Generates a summary for a specific customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const generateCustomerSummary = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, sendNotification = false } = req.body;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'customerId is required'
      });
    }
    
    // For a specific date range
    if (startDate && endDate) {
      const startDateTime = new Date(startDate);
      startDateTime.setUTCHours(0, 0, 0, 0);
      
      const endDateTime = new Date(endDate);
      endDateTime.setUTCHours(23, 59, 59, 999);
      
      moduleLogger.info(`Generating summary for customer ${customerId} for date range ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);
      
      // Fetch latest transactions before generating summary
      moduleLogger.info('Fetching latest transactions before generating customer summary');
      await transactionService.fetchAndStoreTransactions();
      
      const summary = await summaryService.generateCustomerSummaryForDateRange(
        customerId,
        startDateTime,
        endDateTime,
        sendNotification
      );
      
      return res.status(200).json({
        success: true,
        message: 'Customer summary generated successfully',
        data: summary
      });
    }
    
    // For today
    moduleLogger.info(`Generating today's summary for customer ${customerId}`);
    
    // Fetch latest transactions before generating summary
    moduleLogger.info('Fetching latest transactions before generating customer summary');
    await transactionService.fetchAndStoreTransactions();
    
    const summary = await summaryService.generateCustomerSummary(customerId);
    
    res.status(200).json({
      success: true,
      message: 'Customer summary generated successfully',
      data: summary
    });
  } catch (error) {
    moduleLogger.error('Failed to generate customer summary:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate customer summary',
      message: error.message
    });
  }
};

/**
 * Send summary to a customer via Telegram
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const sendCustomerSummary = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required'
      });
    }
    
    const customer = customerConfig.getCustomerById(customerId);
    
    if (!customer) {
      moduleLogger.warn(`Customer with ID ${customerId} not found`);
      return res.status(404).json({
        success: false,
        error: `Customer with ID ${customerId} not found`
      });
    }
    
    if (!customer.telegramId) {
      moduleLogger.warn(`Customer ${customer.name} does not have a Telegram ID`);
      return res.status(400).json({
        success: false,
        error: `Customer ${customer.name} does not have a Telegram ID`
      });
    }
    
    moduleLogger.info(`Sending summary to customer ${customer.name} (${customerId}) via Telegram`);
    
    const summary = await summaryService.generateCustomerSummary(customerId);
    const telegramService = require('../services/telegramService');
    
    const message = telegramService.formatDailySummary(
      customer, 
      summary.deposits.transactions,
      summary.p2pSells.transactions
    );
    
    await telegramService.sendMessage(customer.telegramId, message);
    
    moduleLogger.info(`Summary sent to ${customer.name} via Telegram`);
    
    res.status(200).json({
      success: true,
      message: `Summary sent to ${customer.name}`
    });
  } catch (error) {
    moduleLogger.error('Failed to send customer summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get list of all customers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void}
 */
const getCustomers = (req, res) => {
  try {
    const customers = customerConfig.getAllCustomers().map(customer => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      walletAddresses: customer.walletAddresses,
      hasTelegram: !!customer.telegramId
    }));
    
    moduleLogger.info(`Retrieved ${customers.length} customers`);
    
    res.status(200).json({
      success: true,
      customers
    });
  } catch (error) {
    moduleLogger.error('Failed to get customers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  generateAllSummaries,
  generateTestSummaries,
  generateCustomerSummary,
  sendCustomerSummary,
  getCustomers
}; 