/**
 * @fileoverview Service for generating and sending daily transaction summaries
 * @module services/summaryService
 */

const Transaction = require('../models/transaction');
const telegramService = require('./telegramService');
const customerConfig = require('../config/customers');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('summaryService');

/**
 * Service for generating daily customer transaction summaries
 */
class SummaryService {
  /**
   * Generates and sends daily transaction summaries for all customers
   * @returns {Promise<Array>} Array of summary objects
   */
  async generateAndSendDailySummaries() {
    try {
      moduleLogger.info('Generating daily transaction summaries...');
      
      // Get today's date range (UTC)
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      return this.generateAllSummariesForDateRange(startOfDay, endOfDay, true);
    } catch (error) {
      moduleLogger.error('Failed to generate and send daily summaries:', error);
      throw error;
    }
  }
  
  /**
   * Generates and sends transaction summaries for all customers within a date range
   * @param {Date} startDate - Start date for the range
   * @param {Date} endDate - End date for the range
   * @param {boolean} sendNotification - Whether to send Telegram notifications
   * @returns {Promise<Array>} Array of summary objects
   */
  async generateAllSummariesForDateRange(startDate, endDate, sendNotification = false) {
    try {
      moduleLogger.info(`Generating summaries for date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      moduleLogger.debug(`Will ${sendNotification ? '' : 'not '}send notifications`);
      
      // Get all customers
      const customers = customerConfig.getAllCustomers();
      const summaries = [];
      
      // Process each customer
      for (const customer of customers) {
        moduleLogger.debug(`Processing customer: ${customer.name} (${customer.id})`);
        
        // Get transactions for this customer in the date range
        const customerTransactions = await Transaction.find({
          $or: [
            { customerId: customer.id },
            { 
              transactionType: 'DEPOSIT',
              walletAddress: { $in: customer.walletAddresses }
            }
          ],
          time: { $gte: startDate, $lte: endDate },
          status: { $in: ['COMPLETED', 'FILLED'] }
        });
        
        if (customerTransactions.length === 0) {
          moduleLogger.info(`No transactions found for customer ${customer.name} in the specified date range`);
          continue;
        }
        
        // Separate transactions by type
        const deposits = customerTransactions.filter(tx => tx.transactionType === 'DEPOSIT');
        const p2pSells = customerTransactions.filter(tx => tx.transactionType === 'P2P_SELL');
        
        // Skip if no transactions of interest
        if (deposits.length === 0 && p2pSells.length === 0) {
          moduleLogger.info(`No relevant transactions found for customer ${customer.name} in the specified date range`);
          continue;
        }
        
        // Generate summary message
        const summaryMessage = telegramService.formatDailySummary(customer, deposits, p2pSells);
        
        // Send via Telegram if requested and customer has a telegram ID
        let messageSent = false;
        if (sendNotification && customer.telegramId) {
          await telegramService.sendMessage(customer.telegramId, summaryMessage);
          moduleLogger.info(`Summary sent to ${customer.name} via Telegram`);
          messageSent = true;
        } else if (sendNotification) {
          moduleLogger.warn(`Could not send summary to ${customer.name} - no Telegram ID`);
        }
        
        // Mark transactions as reported if notification was sent
        if (messageSent) {
          const transactionIds = customerTransactions.map(tx => tx._id);
          await Transaction.updateMany(
            { _id: { $in: transactionIds } },
            { $set: { isReported: true } }
          );
        }
        
        // Add to summaries
        summaries.push({
          customerId: customer.id,
          customerName: customer.name,
          depositsCount: deposits.length,
          depositsTotal: deposits.reduce((sum, tx) => sum + tx.quantity, 0),
          p2pSellsCount: p2pSells.length,
          p2pSellsTotal: p2pSells.reduce((sum, tx) => sum + tx.quoteQuantity, 0),
          messageSent
        });
      }
      
      moduleLogger.info(`Generated ${summaries.length} summaries for date range`);
      return summaries;
    } catch (error) {
      moduleLogger.error('Failed to generate summaries for date range:', error);
      throw error;
    }
  }
  
  /**
   * Generates a daily transaction summary for a specific customer
   * @param {string} customerId - Customer ID
   * @returns {Promise<Object>} Summary object
   */
  async generateCustomerSummary(customerId) {
    try {
      // Get today's date range (UTC)
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      return this.generateCustomerSummaryForDateRange(customerId, startOfDay, endOfDay, false);
    } catch (error) {
      moduleLogger.error(`Failed to generate summary for customer ${customerId}:`, error);
      throw error;
    }
  }
  
  /**
   * Generates a transaction summary for a specific customer within a date range
   * @param {string} customerId - Customer ID
   * @param {Date} startDate - Start date for the range
   * @param {Date} endDate - End date for the range
   * @param {boolean} sendNotification - Whether to send Telegram notification
   * @returns {Promise<Object>} Summary object
   */
  async generateCustomerSummaryForDateRange(customerId, startDate, endDate, sendNotification = false) {
    try {
      const customer = customerConfig.getCustomerById(customerId);
      
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }
      
      moduleLogger.info(`Generating summary for customer ${customer.name} for date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Get transactions for this customer in the date range
      const customerTransactions = await Transaction.find({
        $or: [
          { customerId: customer.id },
          { 
            transactionType: 'DEPOSIT',
            walletAddress: { $in: customer.walletAddresses }
          }
        ],
        time: { $gte: startDate, $lte: endDate },
        status: { $in: ['COMPLETED', 'FILLED'] }
      });
      
      moduleLogger.debug(`Found ${customerTransactions.length} transactions for customer ${customer.name}`);
      
      // Separate transactions by type
      const deposits = customerTransactions.filter(tx => tx.transactionType === 'DEPOSIT');
      const p2pSells = customerTransactions.filter(tx => tx.transactionType === 'P2P_SELL');
      
      // Generate summary
      const summary = {
        customerId: customer.id,
        customerName: customer.name,
        dateRange: {
          start: startDate,
          end: endDate
        },
        deposits: {
          count: deposits.length,
          total: deposits.reduce((sum, tx) => sum + tx.quantity, 0),
          transactions: deposits
        },
        p2pSells: {
          count: p2pSells.length,
          total: p2pSells.reduce((sum, tx) => sum + tx.quoteQuantity, 0),
          transactions: p2pSells
        }
      };
      
      // Send via Telegram if requested and customer has a telegram ID
      if (sendNotification && customer.telegramId) {
        const summaryMessage = telegramService.formatDailySummary(customer, deposits, p2pSells);
        await telegramService.sendMessage(customer.telegramId, summaryMessage);
        moduleLogger.info(`Summary sent to ${customer.name} via Telegram`);
        summary.messageSent = true;
        
        // Mark transactions as reported
        const transactionIds = customerTransactions.map(tx => tx._id);
        await Transaction.updateMany(
          { _id: { $in: transactionIds } },
          { $set: { isReported: true } }
        );
      } else if (sendNotification) {
        moduleLogger.warn(`Could not send summary to ${customer.name} - no Telegram ID`);
        summary.messageSent = false;
      }
      
      return summary;
    } catch (error) {
      moduleLogger.error(`Failed to generate summary for customer ${customerId} for date range:`, error);
      throw error;
    }
  }
}

module.exports = new SummaryService(); 