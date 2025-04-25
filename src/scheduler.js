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

let scheduledJobs = []; // Keep references to the jobs

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
    // Stop any existing jobs
    if (scheduledJobs.length > 0) {
      scheduledJobs.forEach(job => {
        if (job.running) {
          job.stop();
        }
      });
      schedulerLogger.info('Stopped existing jobs before creating new ones');
      scheduledJobs = [];
    }

    // Log startup status with more details
    schedulerLogger.info(`Scheduler starting in environment: ${process.env.NODE_ENV || 'development'}`);
    schedulerLogger.info(`Current server time: ${new Date().toISOString()}`);
    schedulerLogger.info('Target execution times: 3:30 PM and 7:00 PM Colombia time (8:30 PM and 12:00 AM UTC)');
    
    // Schedule for 3:30 PM Colombia time (UTC-5), which is 8:30 PM UTC (20:30 UTC)
    const afternoonJob = new CronJob(
      '30 20 * * *', // Run at 8:30 PM UTC (3:30 PM Colombia time)
      jobFunction, // Use the extracted job function
      null, // onComplete function (not used)
      false, // don't start immediately, we'll start it explicitly
      'UTC' // Use UTC timezone directly
    );
    
    // Schedule for 7:00 PM Colombia time (UTC-5), which is 00:00 UTC (midnight)
    const eveningJob = new CronJob(
      '0 0 * * *', // Run at midnight UTC (7:00 PM Colombia time)
      jobFunction, // Use the extracted job function
      null, // onComplete function (not used)
      false, // don't start immediately, we'll start it explicitly
      'UTC' // Use UTC timezone directly
    );
    
    // Explicitly start the jobs
    afternoonJob.start();
    eveningJob.start();
    
    // Store job references
    scheduledJobs.push(afternoonJob, eveningJob);
    
    // Verify the jobs are actually running
    const notRunningJobs = scheduledJobs.filter(job => !job.running);
    if (notRunningJobs.length > 0) {
      schedulerLogger.error(`Failed to start ${notRunningJobs.length} cron jobs`);
      throw new Error('Failed to start all cron jobs');
    }
    
    // Add confirmation that the jobs are scheduled
    schedulerLogger.info(`Cron jobs scheduled successfully: ${scheduledJobs.length} jobs running`);
    
    // Log next scheduled run time for each job
    scheduledJobs.forEach((job, index) => {
      const jobName = index === 0 ? 'Afternoon (3:30 PM / 8:30 PM UTC)' : 'Evening (7:00 PM / 12:00 AM UTC)';
      try {
        const nextRunDate = job.nextDate().toDate();
        schedulerLogger.info(`Next scheduled run for ${jobName} job: ${nextRunDate.toISOString()}`);
      } catch (error) {
        schedulerLogger.warn(`Could not determine next run date for ${jobName} job`, { error: error.message });
      }
    });
    
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
  if (!scheduledJobs || scheduledJobs.length === 0) {
    return 'Not Initialized';
  }
  
  try {
    const runningJobs = scheduledJobs.filter(job => job.running);
    const status = runningJobs.length === scheduledJobs.length ? 'Running' :
                  runningJobs.length > 0 ? 'Partially Running' : 'Stopped';
    
    return status;
  } catch (error) {
    schedulerLogger.error('Error getting scheduler status', { error: error.message });
    return 'Error';
  }
};

// Function to manually run the job (for testing)
const runJobManually = async () => {
  schedulerLogger.info('Manually running scheduled job');
  try {
    const result = await jobFunction();
    schedulerLogger.info('Manual job execution completed successfully', { result });
    return result;
  } catch (error) {
    schedulerLogger.error('Manual job execution failed', { 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
};

// Function to force reschedule the job
const rescheduleJob = () => {
  schedulerLogger.info('Forcing job reschedule');
  
  try {
    // Stop any existing jobs
    if (scheduledJobs.length > 0) {
      scheduledJobs.forEach(job => {
        if (job.running) {
          job.stop();
        }
      });
      schedulerLogger.info('Stopped existing jobs');
      scheduledJobs = [];
    }
    
    // Create and start new jobs
    const afternoonJob = new CronJob(
      '30 20 * * *', // 8:30 PM UTC (3:30 PM Colombia time)
      jobFunction,
      null,
      false,
      'UTC'
    );
    
    const eveningJob = new CronJob(
      '0 0 * * *', // midnight UTC (7:00 PM Colombia time)
      jobFunction,
      null,
      false,
      'UTC'
    );
    
    afternoonJob.start();
    eveningJob.start();
    
    // Store job references
    scheduledJobs.push(afternoonJob, eveningJob);
    
    if (!afternoonJob.running || !eveningJob.running) {
      throw new Error('Failed to start rescheduled jobs');
    }
    
    schedulerLogger.info('Jobs rescheduled successfully', {
      running: afternoonJob.running && eveningJob.running,
      nextRun: afternoonJob.nextDate().toDate().toISOString(),
      nextRunEvening: eveningJob.nextDate().toDate().toISOString()
    });
    
    return getSchedulerStatus();
  } catch (error) {
    schedulerLogger.error('Failed to reschedule jobs', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Function to get detailed diagnostic information about the scheduler
const getSchedulerDiagnostics = () => {
  const diagnostics = {
    isSchedulerInitialized: scheduledJobs.length > 0,
    currentServerTime: new Date().toISOString(),
    currentServerTimeLocal: new Date().toString(),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cronTimezone: 'UTC',
    jobStatus: scheduledJobs.length > 0 ? (scheduledJobs.every(job => job.running) ? 'Running' : 'Partially Running') : 'Stopped',
  };
  
  if (scheduledJobs.length > 0) {
    scheduledJobs.forEach((job, index) => {
      const jobName = index === 0 ? 'Afternoon (3:30 PM / 8:30 PM UTC)' : 'Evening (7:00 PM / 12:00 AM UTC)';
      try {
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}RunTime`] = job.nextDate().toDate().toISOString();
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}RunTimeLocal`] = job.nextDate().toDate().toString();
      } catch (error) {
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}RunTimeError`] = error.message;
        
        // Fallback calculation
        const now = new Date();
        const next = new Date();
        
        // Convert to UTC time
        if (index === 0) {
          // 8:30 PM UTC (3:30 PM Colombia time)
          next.setUTCHours(20, 30, 0, 0);
        } else {
          // 12:00 AM UTC (7:00 PM Colombia time)
          next.setUTCHours(0, 0, 0, 0);
        }
        
        if (next <= now) {
          next.setDate(next.getDate() + 1); // Tomorrow if it's already past the scheduled time today
        }
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}CalculatedNextRunTime`] = next.toISOString();
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}CalculatedNextRunTimeLocal`] = next.toString();
      }
      
      try {
        // Get cron pattern
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}CronPattern`] = job.cronTime.source;
      } catch (error) {
        diagnostics[`${jobName.replace(/\s+\(.+\)/g, '').toLowerCase()}CronPatternError`] = error.message;
      }
    });
  }
  
  return diagnostics;
};

module.exports = {
  initializeScheduler,
  getSchedulerStatus,
  runJobManually,
  rescheduleJob,
  getSchedulerDiagnostics
}; 