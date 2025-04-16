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
    // Log startup status with more details
    schedulerLogger.info(`Scheduler starting in environment: ${process.env.NODE_ENV || 'development'}`);
    schedulerLogger.info(`Current server time: ${new Date().toISOString()}`);
    schedulerLogger.info('Target execution time: 7:00 PM Colombia time (00:00 UTC)');
    
    // Schedule email processing at 7:00 PM Colombia time (UTC-5), which is 00:00 UTC
    // Cron syntax: minute hour day-of-month month day-of-week
    const job = cron.schedule('0 0 * * *', async () => {
      schedulerLogger.info(`Running scheduled email processing task at ${new Date().toISOString()}`);
      
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
    
    // Add confirmation that the job is scheduled
    schedulerLogger.info(`Cron job scheduled successfully: ${job.getStatus()}`);
    
    // Log next scheduled run time
    const nextDate = new Date();
    if (nextDate.getUTCHours() >= 0) {
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);  // Next day if already past midnight UTC
    }
    nextDate.setUTCHours(0, 0, 0, 0);  // Set to midnight UTC (7PM Colombia)
    schedulerLogger.info(`Next scheduled run: ${nextDate.toISOString()}`);
    
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