/**
 * @fileoverview Controller for scheduler operations
 * @module controllers/schedulerController
 */

const { 
  getSchedulerStatus, 
  runJobManually, 
  rescheduleJob,
  getSchedulerDiagnostics,
  checkForMissedJobs
} = require('../scheduler');
const { logger } = require('../utils/logger');

/**
 * Get the current status of the scheduler
 */
const getStatus = (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json({ status });
  } catch (error) {
    logger.error('Error getting scheduler status', { error: error.message });
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
};

/**
 * Get detailed diagnostics about the scheduler
 */
const getDiagnostics = (req, res) => {
  try {
    const diagnostics = getSchedulerDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    logger.error('Error getting scheduler diagnostics', { error: error.message });
    res.status(500).json({ error: 'Failed to get scheduler diagnostics' });
  }
};

/**
 * Run the scheduled job manually
 */
const runManually = async (req, res) => {
  try {
    logger.info('Manual job execution requested via API');
    const result = await runJobManually();
    res.json({ 
      success: true, 
      message: 'Scheduled job executed manually',
      transactions: result.transactions?.length || 0,
      syncedTransactions: result.syncedTransactions?.length || 0
    });
  } catch (error) {
    logger.error('Error running scheduled job manually', { error: error.message });
    res.status(500).json({ error: 'Failed to run scheduled job manually' });
  }
};

/**
 * Force reschedule the job
 */
const forceReschedule = (req, res) => {
  try {
    logger.info('Job reschedule requested via API');
    const result = rescheduleJob();
    res.json({ 
      success: true, 
      message: 'Scheduler job rescheduled successfully',
      status: result
    });
  } catch (error) {
    logger.error('Error rescheduling job', { error: error.message });
    res.status(500).json({ error: 'Failed to reschedule job' });
  }
};

/**
 * Manually trigger a check for missed jobs
 */
const checkMissedJobs = async (req, res) => {
  try {
    logger.info('Manual check for missed jobs requested via API');
    await checkForMissedJobs();
    res.json({ 
      success: true, 
      message: 'Completed check for missed jobs'
    });
  } catch (error) {
    logger.error('Error checking for missed jobs', { error: error.message });
    res.status(500).json({ error: 'Failed to check for missed jobs' });
  }
};

module.exports = {
  getStatus,
  getDiagnostics,
  runManually,
  forceReschedule,
  checkMissedJobs
}; 