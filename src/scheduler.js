/**
 * @fileoverview Scheduler for running tasks at specific times
 * @module scheduler
 * 
 * This sets up cron jobs to automatically run tasks at specific times.
 * The main task is to fetch and process emails at 7PM Colombia time (UTC-5).
 */

const cron = require('node-cron');
const { logger } = require('./utils/logger');
const transactionService = require('./services/transactionService');

// Create logger for scheduler
const schedulerLogger = logger.child({ module: 'scheduler' });

/**
 * Initializes the scheduler and sets up cron jobs
 */
function initializeScheduler() {
  schedulerLogger.info('Initializing scheduled tasks');
  
  try {
    // Schedule email processing at 7:00 PM Colombia time (UTC-5), which is 00:00 UTC
    // Cron syntax: minute hour day-of-month month day-of-week
    cron.schedule('0 0 * * *', async () => {
      schedulerLogger.info('Running scheduled email processing task');
      
      try {
        // Process today's Binance emails
        const transactions = await transactionService.fetchGmailBinanceTransactions();
        schedulerLogger.info(`Processed ${transactions.length} transactions from emails`);
        
        // Sync unsynced transactions to Google Sheets
        const syncedTransactions = await transactionService.syncTransactionsToGoogleSheets();
        schedulerLogger.info(`Synced ${syncedTransactions.length} transactions to Google Sheets`);
      } catch (error) {
        schedulerLogger.error('Error during scheduled email processing', { 
          error: error.message,
          stack: error.stack 
        });
      }
    }, {
      scheduled: true,
      timezone: "America/Bogota" // Colombia timezone
    });
    
    schedulerLogger.info('Scheduled tasks initialized successfully');
  } catch (error) {
    schedulerLogger.error('Failed to initialize scheduler', { 
      error: error.message,
      stack: error.stack 
    });
  }
}

module.exports = {
  initializeScheduler
}; 