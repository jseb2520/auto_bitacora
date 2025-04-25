/**
 * @fileoverview Scheduler for running tasks at specific times
 * @module scheduler
 * 
 * This sets up cron jobs to automatically run tasks at specific times.
 * The main task is to fetch and process emails at 3:30 PM and 7PM Colombia time (UTC-5).
 */

const { CronJob } = require('cron');
const { logger } = require('./utils/logger');
const transactionService = require('./services/transactionService');

// Create logger for scheduler
const schedulerLogger = logger.child({ module: 'scheduler' });

// Define a lazy-loaded function to avoid circular dependencies
let sendAlertEmailFn = null;
const getSendAlertEmail = () => {
  if (!sendAlertEmailFn) {
    try {
      const { sendAlertEmail } = require('./utils/emailAlert');
      sendAlertEmailFn = sendAlertEmail;
    } catch (error) {
      schedulerLogger.error('Failed to load email alert module', { error: error.message });
      // Return a noop function as fallback
      sendAlertEmailFn = (subject, body) => {
        schedulerLogger.warn(`Alert email not sent (module not loaded): ${subject}`);
        return Promise.resolve(false);
      };
    }
  }
  return sendAlertEmailFn;
};

let scheduledJobs = []; // Keep references to the jobs

// Job execution tracking
const jobExecutionHistory = {
  afternoon: {
    lastRun: null,
    lastResult: null,
    missedRuns: 0,
    totalRuns: 0
  },
  evening: {
    lastRun: null,
    lastResult: null,
    missedRuns: 0,
    totalRuns: 0
  }
};

// Job monitoring info
const jobMonitoring = {
  afternoonJob: {
    expectedTimeUTC: '20:30', // 8:30 PM UTC (3:30 PM Colombia)
    toleranceMinutes: 15, // Allow 15 minutes of delay
  },
  eveningJob: {
    expectedTimeUTC: '00:00', // 12:00 AM UTC (7:00 PM Colombia)
    toleranceMinutes: 15, // Allow 15 minutes of delay
  },
  lastCheck: null,
  startupTime: new Date() // Record when scheduler was initialized
};

/**
 * The job function to execute when the cron job runs
 * @param {string} jobType - Either 'afternoon' or 'evening'
 */
async function jobFunction(jobType = 'unknown') {
  const startTime = new Date();
  schedulerLogger.info(`Running scheduled email processing task (${jobType}) at ${startTime.toISOString()}`);
  
  try {
    // Process today's Binance emails
    const transactions = await transactionService.fetchGmailBinanceTransactions();
    schedulerLogger.info(`Processed ${transactions.length} transactions from emails`);
    
    // Sync unsynced transactions to Google Sheets
    const syncedTransactions = await transactionService.syncTransactionsToGoogleSheets();
    schedulerLogger.info(`Synced ${syncedTransactions.length} transactions to Google Sheets`);
    
    // Update execution history
    if (jobType === 'afternoon' || jobType === 'evening') {
      jobExecutionHistory[jobType].lastRun = startTime;
      jobExecutionHistory[jobType].lastResult = 'success';
      jobExecutionHistory[jobType].totalRuns++;
    }
    
    return { transactions, syncedTransactions };
  } catch (error) {
    schedulerLogger.error(`Error during scheduled email processing (${jobType})`, { 
      error: error.message,
      stack: error.stack 
    });
    
    // Update execution history with failure
    if (jobType === 'afternoon' || jobType === 'evening') {
      jobExecutionHistory[jobType].lastRun = startTime;
      jobExecutionHistory[jobType].lastResult = 'error';
      jobExecutionHistory[jobType].totalRuns++;
    }
    
    // Send alert email about job failure
    const errorMessage = `
      <h2>Scheduler Job Execution Error</h2>
      <p><strong>Job:</strong> ${jobType}</p>
      <p><strong>Time:</strong> ${startTime.toISOString()}</p>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><strong>Stack:</strong> <pre>${error.stack}</pre></p>
    `;
    
    try {
      await getSendAlertEmail()(`Scheduler Job Error (${jobType})`, errorMessage);
    } catch (emailError) {
      schedulerLogger.error('Failed to send email alert', { error: emailError.message });
    }
    
    throw error;
  }
}

/**
 * Check if any scheduled jobs were missed
 * This runs periodically to detect if jobs didn't execute at their expected times
 */
async function checkForMissedJobs() {
  try {
    schedulerLogger.debug('Checking for missed scheduled jobs');
    jobMonitoring.lastCheck = new Date();
    
    // Don't check for missed jobs in the first 5 minutes after startup
    // This prevents false alerts when the server first starts
    const startupGracePeriodMs = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - jobMonitoring.startupTime < startupGracePeriodMs) {
      schedulerLogger.info('Skipping missed job check - still in startup grace period');
      return;
    }
    
    const now = new Date();
    const currentUTCHour = now.getUTCHours();
    const currentUTCMinute = now.getUTCMinutes();
    const currentTimeUTC = `${currentUTCHour.toString().padStart(2, '0')}:${currentUTCMinute.toString().padStart(2, '0')}`;
    
    // Check afternoon job (3:30 PM Colombia / 8:30 PM UTC)
    if (shouldCheckForMissedRun('afternoonJob', currentTimeUTC)) {
      const lastRun = jobExecutionHistory.afternoon.lastRun;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // If no run today or run time is not within expected window
      if (!lastRun || lastRun < today) {
        schedulerLogger.warn('Detected missed afternoon job (3:30 PM Colombia time)');
        jobExecutionHistory.afternoon.missedRuns++;
        
        // Send alert email
        const alertMessage = `
          <h2>Missed Scheduled Job</h2>
          <p><strong>Job:</strong> Afternoon (3:30 PM Colombia time / 8:30 PM UTC)</p>
          <p><strong>Current time:</strong> ${now.toISOString()}</p>
          <p><strong>Last successful run:</strong> ${lastRun ? lastRun.toISOString() : 'Never'}</p>
          <p><strong>Missed runs count:</strong> ${jobExecutionHistory.afternoon.missedRuns}</p>
        `;
        
        try {
          await getSendAlertEmail()( 'Missed Scheduled Job - Afternoon', alertMessage);
          schedulerLogger.info('Sent alert email for missed afternoon job');
        } catch (error) {
          schedulerLogger.error('Failed to send alert email for missed afternoon job', { error: error.message });
        }
      }
    }
    
    // Check evening job (7:00 PM Colombia / 12:00 AM UTC)
    if (shouldCheckForMissedRun('eveningJob', currentTimeUTC)) {
      const lastRun = jobExecutionHistory.evening.lastRun;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // If no run today or run time is not within expected window
      if (!lastRun || lastRun < today) {
        schedulerLogger.warn('Detected missed evening job (7:00 PM Colombia time)');
        jobExecutionHistory.evening.missedRuns++;
        
        // Send alert email
        const alertMessage = `
          <h2>Missed Scheduled Job</h2>
          <p><strong>Job:</strong> Evening (7:00 PM Colombia time / 12:00 AM UTC)</p>
          <p><strong>Current time:</strong> ${now.toISOString()}</p>
          <p><strong>Last successful run:</strong> ${lastRun ? lastRun.toISOString() : 'Never'}</p>
          <p><strong>Missed runs count:</strong> ${jobExecutionHistory.evening.missedRuns}</p>
        `;
        
        try {
          await getSendAlertEmail()( 'Missed Scheduled Job - Evening', alertMessage);
          schedulerLogger.info('Sent alert email for missed evening job');
        } catch (error) {
          schedulerLogger.error('Failed to send alert email for missed evening job', { error: error.message });
        }
      }
    }
  } catch (error) {
    schedulerLogger.error('Error checking for missed jobs', { 
      error: error.message, 
      stack: error.stack 
    });
  }
}

/**
 * Determine if we should check for a missed run of a particular job
 * @param {string} jobKey - Either 'afternoonJob' or 'eveningJob'
 * @param {string} currentTimeUTC - Current time in HH:MM format
 * @returns {boolean} Whether to check for a missed run
 */
function shouldCheckForMissedRun(jobKey, currentTimeUTC) {
  // Get expected time info
  const { expectedTimeUTC, toleranceMinutes } = jobMonitoring[jobKey];
  
  // Parse expected time
  const [expectedHour, expectedMinute] = expectedTimeUTC.split(':').map(Number);
  
  // Parse current time
  const [currentHour, currentMinute] = currentTimeUTC.split(':').map(Number);
  
  // Calculate time difference in minutes
  let diffMinutes = (currentHour - expectedHour) * 60 + (currentMinute - expectedMinute);
  
  // Handle day boundary crossing (e.g., expected 00:00, current 00:15)
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // Add a full day
  }
  
  // Check if we're within the checking window (after expected time + tolerance)
  return diffMinutes >= toleranceMinutes && diffMinutes <= toleranceMinutes + 30; // Check for 30 mins after tolerance
}

/**
 * Initializes the scheduler and sets up cron jobs
 */
function initializeScheduler() {
  try {
    schedulerLogger.info('Initializing scheduled tasks');
    
    try {
      // Stop any existing jobs
      if (scheduledJobs.length > 0) {
        scheduledJobs.forEach(job => {
          if (job && job.running) {
            try {
              job.stop();
            } catch (stopError) {
              schedulerLogger.warn('Error stopping existing job', { error: stopError.message });
            }
          }
        });
        schedulerLogger.info('Stopped existing jobs before creating new ones');
        scheduledJobs = [];
      }
    } catch (stopError) {
      schedulerLogger.warn('Error while stopping existing jobs', { error: stopError.message });
      // Continue with initialization even if we couldn't stop previous jobs
    }

    // Log startup status with more details
    schedulerLogger.info(`Scheduler starting in environment: ${process.env.NODE_ENV || 'development'}`);
    schedulerLogger.info(`Current server time: ${new Date().toISOString()}`);
    schedulerLogger.info('Target execution times: 3:30 PM and 7:00 PM Colombia time (8:30 PM and 12:00 AM UTC)');
    
    try {
      // Create all the jobs within a try block
      
      // Schedule for 3:30 PM Colombia time (UTC-5), which is 8:30 PM UTC (20:30 UTC)
      const afternoonJob = new CronJob(
        '30 20 * * *', // Run at 8:30 PM UTC (3:30 PM Colombia time)
        () => {
          try {
            jobFunction('afternoon').catch(err => {
              schedulerLogger.error('Error in afternoon job', {
                error: err.message,
                stack: err.stack
              });
            });
          } catch (e) {
            schedulerLogger.error('Critical error in afternoon job execution', {
              error: e.message,
              stack: e.stack
            });
          }
        },
        null, // onComplete function (not used)
        false, // don't start immediately, we'll start it explicitly
        'UTC' // Use UTC timezone directly
      );
      
      // Schedule for 7:00 PM Colombia time (UTC-5), which is 00:00 UTC (midnight)
      const eveningJob = new CronJob(
        '0 0 * * *', // Run at midnight UTC (7:00 PM Colombia time)
        () => {
          try {
            jobFunction('evening').catch(err => {
              schedulerLogger.error('Error in evening job', {
                error: err.message,
                stack: err.stack
              });
            });
          } catch (e) {
            schedulerLogger.error('Critical error in evening job execution', {
              error: e.message,
              stack: e.stack
            });
          }
        },
        null, // onComplete function (not used)
        false, // don't start immediately, we'll start it explicitly
        'UTC' // Use UTC timezone directly
      );
      
      // Schedule job to check for missed runs - every hour
      const monitoringJob = new CronJob(
        '0 * * * *', // Run every hour
        () => {
          try {
            checkForMissedJobs().catch(err => {
              schedulerLogger.error('Error in monitoring job', {
                error: err.message,
                stack: err.stack
              });
            });
          } catch (e) {
            schedulerLogger.error('Critical error in monitoring job execution', {
              error: e.message,
              stack: e.stack
            });
          }
        }, 
        null, 
        false, 
        'UTC'
      );
      
      // Explicitly start each job in a try-catch block
      try {
        afternoonJob.start();
        schedulerLogger.info('Afternoon job started successfully');
      } catch (startError) {
        schedulerLogger.error('Failed to start afternoon job', { error: startError.message });
      }
      
      try {
        eveningJob.start();
        schedulerLogger.info('Evening job started successfully');
      } catch (startError) {
        schedulerLogger.error('Failed to start evening job', { error: startError.message });
      }
      
      try {
        monitoringJob.start();
        schedulerLogger.info('Monitoring job started successfully');
      } catch (startError) {
        schedulerLogger.error('Failed to start monitoring job', { error: startError.message });
      }
      
      // Store job references
      scheduledJobs.push(afternoonJob, eveningJob, monitoringJob);
      
      // Check if jobs are running, but don't throw an error
      const notRunningJobs = scheduledJobs.filter(job => job && !job.running);
      if (notRunningJobs.length > 0) {
        schedulerLogger.warn(`Some jobs (${notRunningJobs.length}) failed to start`);
      } else {
        schedulerLogger.info(`Cron jobs scheduled successfully: ${scheduledJobs.length} jobs running`);
      }
      
      // Log next scheduled run time for each job
      scheduledJobs.forEach((job, index) => {
        if (!job) return;
        
        let jobName;
        if (index === 0) {
          jobName = 'Afternoon (3:30 PM / 8:30 PM UTC)';
        } else if (index === 1) {
          jobName = 'Evening (7:00 PM / 12:00 AM UTC)';
        } else {
          jobName = 'Monitoring';
        }
        
        try {
          const nextRunDate = job.nextDate().toDate();
          schedulerLogger.info(`Next scheduled run for ${jobName} job: ${nextRunDate.toISOString()}`);
        } catch (error) {
          schedulerLogger.warn(`Could not determine next run date for ${jobName} job`, { error: error.message });
        }
      });
      
      // Run the job immediately for testing if in development
      if (process.env.NODE_ENV === 'development') {
        schedulerLogger.info('Development environment detected, running afternoon job immediately for testing');
        setTimeout(() => {
          schedulerLogger.info('Executing job immediately for testing');
          jobFunction('afternoon').catch(err => {
            schedulerLogger.error('Error during immediate job execution', {
              error: err.message,
              stack: err.stack
            });
          });
        }, 10000); // Wait 10 seconds to allow server to fully initialize
      }
      
      schedulerLogger.info('Scheduled tasks initialized successfully');
      
    } catch (cronError) {
      schedulerLogger.error('Error creating cron jobs', { error: cronError.message, stack: cronError.stack });
      // Don't rethrow, allow server to continue running
    }
    
  } catch (error) {
    schedulerLogger.error('Failed to initialize scheduler', { 
      error: error.message,
      stack: error.stack 
    });
    // Don't rethrow, allow server to continue running
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
      () => jobFunction('afternoon'),
      null,
      false,
      'UTC'
    );
    
    const eveningJob = new CronJob(
      '0 0 * * *', // midnight UTC (7:00 PM Colombia time)
      () => jobFunction('evening'),
      null,
      false,
      'UTC'
    );
    
    // Schedule job to check for missed runs - every hour
    const monitoringJob = new CronJob(
      '0 * * * *', // Run every hour
      checkForMissedJobs, 
      null, 
      false, 
      'UTC'
    );
    
    afternoonJob.start();
    eveningJob.start();
    monitoringJob.start();
    
    // Store job references
    scheduledJobs.push(afternoonJob, eveningJob, monitoringJob);
    
    if (!afternoonJob.running || !eveningJob.running || !monitoringJob.running) {
      throw new Error('Failed to start rescheduled jobs');
    }
    
    schedulerLogger.info('Jobs rescheduled successfully', {
      running: afternoonJob.running && eveningJob.running && monitoringJob.running,
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
    jobExecutionHistory
  };
  
  if (scheduledJobs.length > 0) {
    scheduledJobs.forEach((job, index) => {
      if (index > 1) return; // Skip monitoring job in diagnostics
      
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
  
  // Add monitoring information
  diagnostics.monitoring = {
    lastCheckTime: jobMonitoring.lastCheck,
    afternoonJobConfig: jobMonitoring.afternoonJob,
    eveningJobConfig: jobMonitoring.eveningJob
  };
  
  return diagnostics;
};

module.exports = {
  initializeScheduler,
  getSchedulerStatus,
  runJobManually,
  rescheduleJob,
  getSchedulerDiagnostics,
  checkForMissedJobs
}; 