/**
 * @fileoverview Scheduler utility for periodic tasks
 * @module utils/scheduler
 */

const cron = require('node-cron');
const transactionService = require('../services/transactionService');

/**
 * Scheduler class for managing periodic tasks
 */
class Scheduler {
  constructor() {
    this.tasks = {};
  }

  /**
   * Initializes all scheduled tasks
   */
  initTasks() {
    // Schedule daily transaction fetch at midnight UTC
    this.scheduleDailyTransactionFetch();
    
    // Add more scheduled tasks here as needed
  }

  /**
   * Schedules the daily transaction fetch task
   */
  scheduleDailyTransactionFetch() {
    // Run at midnight UTC every day
    this.tasks.fetchTransactions = cron.schedule('0 0 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running scheduled transaction fetch`);
      
      try {
        await transactionService.fetchAndStoreTransactions();
        console.log(`[${new Date().toISOString()}] Scheduled transaction fetch completed`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Scheduled transaction fetch failed:`, error);
      }
    });
    
    console.log('Daily transaction fetch scheduled for midnight UTC');
  }

  /**
   * Stops all scheduled tasks
   */
  stopAllTasks() {
    Object.values(this.tasks).forEach(task => {
      if (task && typeof task.stop === 'function') {
        task.stop();
      }
    });
    
    console.log('All scheduled tasks stopped');
  }
}

module.exports = new Scheduler(); 