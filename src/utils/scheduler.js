/**
 * @fileoverview Scheduler utility for periodic tasks
 * @module utils/scheduler
 */

const cron = require('node-cron');
const transactionService = require('../services/transactionService');
const summaryService = require('../services/summaryService');
const { logger, createModuleLogger } = require('./logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('scheduler');

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
    // Schedule periodic Gmail transaction fetch
    this.scheduleGmailTransactionFetch();
    
    // Schedule daily summary generation
    this.scheduleDailySummaries();
    
    // Add more scheduled tasks here as needed
  }

  /**
   * Schedules the Gmail transaction fetch task to run periodically
   */
  scheduleGmailTransactionFetch() {
    // Run every 2 hours from 8am to 10pm
    this.tasks.fetchTransactions = cron.schedule('0 */2 8-22 * * *', async () => {
      moduleLogger.info(`[${new Date().toISOString()}] Running scheduled Gmail transaction fetch`);
      
      try {
        const transactions = await transactionService.fetchAndStoreTransactions();
        
        // Log detailed information about fetched transactions
        const completedTransactions = transactions.filter(
          t => t.status === "FILLED" || t.status === "COMPLETED"
        );
        
        const identifiedTransactions = transactions.filter(t => t.customerId);
        
        moduleLogger.info(`[${new Date().toISOString()}] Scheduled Gmail transaction fetch completed: 
            Total transactions: ${transactions.length}
            Completed transactions: ${completedTransactions.length}
            With customer ID: ${identifiedTransactions.length}
            Without customer ID: ${transactions.length - identifiedTransactions.length}
        `);
        
        if (transactions.length === 0) {
          moduleLogger.warn(`[${new Date().toISOString()}] No transactions were found during the scheduled Gmail fetch`);
        }
      } catch (error) {
        moduleLogger.error(`[${new Date().toISOString()}] Scheduled Gmail transaction fetch failed:`, error);
      }
    });
    
    moduleLogger.info('Gmail transaction fetch scheduled for every 2 hours from 8am-10pm');
  }
  
  /**
   * Commented out original Binance API transaction fetch (kept for reference)
   */
  /*
  scheduleDailyTransactionFetch() {
    // Run at midnight UTC every day
    this.tasks.fetchTransactions = cron.schedule('0 0 * * *', async () => {
      moduleLogger.info(`[${new Date().toISOString()}] Running scheduled transaction fetch`);
      
      try {
        const transactions = await transactionService.fetchAndStoreTransactions();
        
        // Log more detailed information about fetched transactions
        const completedTransactions = transactions.filter(
          t => t.status === "FILLED" || t.status === "COMPLETED"
        );
        
        const identifiedTransactions = transactions.filter(t => t.customerId);
        
        moduleLogger.info(`[${new Date().toISOString()}] Scheduled transaction fetch completed: 
            Total transactions: ${transactions.length}
            Completed transactions: ${completedTransactions.length}
            With customer ID: ${identifiedTransactions.length}
            Without customer ID: ${transactions.length - identifiedTransactions.length}
            From Binance: ${transactions.filter(t => t.platform === 'BINANCE').length}
            From Revolut: ${transactions.filter(t => t.platform === 'REVOLUT').length}
            From Kraken: ${transactions.filter(t => t.platform === 'KRAKEN').length}
        `);
        
        if (transactions.length === 0) {
          moduleLogger.warn(`[${new Date().toISOString()}] No transactions were found during the scheduled fetch`);
        }
      } catch (error) {
        moduleLogger.error(`[${new Date().toISOString()}] Scheduled transaction fetch failed:`, error);
      }
    });
    
    moduleLogger.info('Daily transaction fetch scheduled for midnight UTC');
  }
  */
  
  /**
   * Schedules the daily summary generation and sending task
   */
  scheduleDailySummaries() {
    // Run at 23:00 UTC every day
    this.tasks.dailySummaries = cron.schedule('0 23 * * *', async () => {
      moduleLogger.info(`[${new Date().toISOString()}] Running scheduled daily summary generation`);
      
      try {
        const summaries = await summaryService.generateAndSendDailySummaries();
        
        // Log more detailed information about generated summaries
        moduleLogger.info(`[${new Date().toISOString()}] Scheduled daily summary generation completed: 
            Summaries generated: ${summaries.length}
            Notifications sent: ${summaries.filter(s => s.messageSent).length}
        `);
        
        if (summaries.length === 0) {
          moduleLogger.warn(`[${new Date().toISOString()}] No summaries were generated - this may mean no transactions were found or no transactions matched any customers`);
          
          // Check if we have any transactions for today that don't have a customer ID
          const Transaction = require('../models/transaction');
          const startOfDay = new Date();
          startOfDay.setUTCHours(0, 0, 0, 0);
          
          const endOfDay = new Date();
          endOfDay.setUTCHours(23, 59, 59, 999);
          
          const todayTransactions = await Transaction.find({
            time: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['COMPLETED', 'FILLED'] }
          });
          
          const unidentifiedTransactions = todayTransactions.filter(t => !t.customerId);
          
          if (todayTransactions.length > 0) {
            moduleLogger.warn(`[${new Date().toISOString()}] Found ${todayTransactions.length} transactions for today, but ${unidentifiedTransactions.length} could not be matched to a customer`);
            
            if (unidentifiedTransactions.length > 0) {
              // Log some sample unidentified transactions to help debug
              const samples = unidentifiedTransactions.slice(0, 3);
              moduleLogger.warn(`[${new Date().toISOString()}] Sample unidentified transactions:`, 
                samples.map(t => ({
                  platform: t.platform,
                  transactionType: t.transactionType,
                  walletAddress: t.walletAddress,
                  time: t.time
                }))
              );
            }
          }
        }
      } catch (error) {
        moduleLogger.error(`[${new Date().toISOString()}] Scheduled daily summary generation failed:`, error);
      }
    });
    
    moduleLogger.info('Daily summary generation scheduled for 23:00 UTC');
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
    
    moduleLogger.info('All scheduled tasks stopped');
  }
}

module.exports = new Scheduler(); 