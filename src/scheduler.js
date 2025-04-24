/**
 * @fileoverview Scheduler for running tasks at specific times
 * @module scheduler
 * 
 * This sets up cron jobs to automatically run tasks at specific times.
 * The main task is to fetch and process emails at 7PM Colombia time (UTC-5).
 */

const { CronJob } = require('cron');
const { logger } = require('./utils/logger');
const transactionService = require('./services/transactionService');

// Create logger for scheduler
const schedulerLogger = logger.child({ module: 'scheduler' });

let scheduledJob = null; // Keep a reference to the job

/**
 * The job function to execute when the cron job runs
 */
async function jobFunction() {
  schedulerLogger.info(`Running scheduled email processing task at ${new Date().toISOString()}`);
  
  try {
    // Process today's Binance emails
    const transactions = await transactionService.fetchGmailBinanceTransactions();
    schedulerLogger.info(`Processed ${transactions.length} transactions from emails`);
    
    // Sync unsynced transactions to Google Sheets
    const syncedTransactions = await transactionService.syncTransactionsToGoogleSheets();
    schedulerLogger.info(`Synced ${syncedTransactions.length} transactions to Google Sheets`);
    
    return { transactions, syncedTransactions };
  } catch (error) {
    schedulerLogger.error('Error during scheduled email processing', { 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Initializes the scheduler and sets up cron jobs
 */
function initializeScheduler() {
  schedulerLogger.info('Initializing scheduled tasks');
  
  try {
    // Stop any existing job
    if (scheduledJob && scheduledJob.running) {
      scheduledJob.stop();
      schedulerLogger.info('Stopped existing job before creating a new one');
    }

    // Log startup status with more details
    schedulerLogger.info(`Scheduler starting in environment: ${process.env.NODE_ENV || 'development'}`);
    schedulerLogger.info(`Current server time: ${new Date().toISOString()}`);
    schedulerLogger.info('Target execution time: 7:00 PM Colombia time (00:00 UTC)');
    
    // Schedule email processing at 7:00 PM Colombia time (UTC-5), which is 00:00 UTC
    // Cron syntax: seconds minutes hours day-of-month month day-of-week
    const job = new CronJob(
      '0 0 19 * * *', // Run at 7:00 PM Colombia time
      jobFunction, // Use the extracted job function
      null, // onComplete function (not used)
      false, // don't start immediately, we'll start it explicitly
      'America/Bogota' // Colombia timezone
    );
    
    // Explicitly start the job
    job.start();
    scheduledJob = job; // Store the job reference
    
    // Add confirmation that the job is scheduled
    schedulerLogger.info(`Cron job scheduled successfully: ${job.running ? 'Running' : 'Not running'}`);
    
    // Log next scheduled run time
    try {
      const nextRunDate = job.nextDate().toDate();
      schedulerLogger.info(`Next scheduled run: ${nextRunDate.toISOString()}`);
    } catch (error) {
      schedulerLogger.warn('Could not determine next run date', { error: error.message });
      // Calculate next run time manually as fallback
      const now = new Date();
      const next = new Date();
      next.setHours(19, 0, 0, 0); // 7 PM
      if (next <= now) {
        next.setDate(next.getDate() + 1); // Tomorrow if it's already past 7 PM today
      }
      schedulerLogger.info(`Next scheduled run (calculated): ${next.toISOString()}`);
    }
    
    // Run the job immediately for testing if in development
    if (process.env.NODE_ENV === 'development') {
      schedulerLogger.info('Development environment detected, running job immediately for testing');
      setTimeout(() => {
        schedulerLogger.info('Executing job immediately for testing');
        jobFunction().catch(err => {
          schedulerLogger.error('Error during immediate job execution', {
            error: err.message,
            stack: err.stack
          });
        });
      }, 5000); // Wait 5 seconds to allow server to fully initialize
    }
    
    schedulerLogger.info('Scheduled tasks initialized successfully');
  } catch (error) {
    schedulerLogger.error('Failed to initialize scheduler', { 
      error: error.message,
      stack: error.stack 
    });
  }
}

// Function to get the scheduler status
const getSchedulerStatus = () => {
  if (!scheduledJob) {
    return 'Not Initialized';
  }
  
  try {
    const status = scheduledJob.running ? 'Running' : 'Stopped';
    let nextRun = 'N/A';
    
    if (scheduledJob.running) {
      try {
        nextRun = scheduledJob.nextDate().toDate().toISOString();
      } catch (error) {
        schedulerLogger.warn('Error getting next run date', { error: error.message });
        // Fallback to manual calculation
        const now = new Date();
        const next = new Date();
        next.setHours(19, 0, 0, 0); // 7 PM
        if (next <= now) {
          next.setDate(next.getDate() + 1); // Tomorrow if it's already past 7 PM today
        }
        nextRun = next.toISOString();
      }
    }
    
    return { status, nextRun };
  } catch (error) {
    schedulerLogger.error('Error getting scheduler status', { error: error.message });
    return 'Error checking status';
  }
};

// Function to manually run the job (for testing)
const runJobManually = async () => {
  schedulerLogger.info('Manually running scheduled job');
  return jobFunction();
};

module.exports = {
  initializeScheduler,
  getSchedulerStatus,
  runJobManually
}; 