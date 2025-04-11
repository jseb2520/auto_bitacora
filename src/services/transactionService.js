/**
 * @fileoverview Service for handling transaction processing and synchronization
 * @module services/transactionService
 */

const Transaction = require('../models/transaction');
const binanceService = require('./binanceService');
const revolutService = require('./revolutService');
const krakenService = require('./krakenService');
const googleSheetsService = require('./googleSheetsService');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('transactionService');

/**
 * Transaction service to manage fetching, storing, and syncing transactions
 */
class TransactionService {
  /**
   * Fetches today's transactions from all platforms, stores them in MongoDB, and syncs to Google Sheets
   * @returns {Promise<Array>} Array of saved and synced transactions
   */
  async fetchAndStoreTransactions() {
    try {
      // Fetch transactions from Binance only (commenting out other platforms for now)
      const [binanceTransactions] = await Promise.allSettled([
        this.fetchBinanceTransactions(),
        // Commenting out other platforms until they're properly configured
        // this.fetchRevolutTransactions(),
        // this.fetchKrakenTransactions()
      ]);
      
      const allTransactions = [
        ...(binanceTransactions.status === 'fulfilled' ? binanceTransactions.value : []),
        // Commented out other platforms until they're properly configured
        // ...(revolutTransactions.status === 'fulfilled' ? revolutTransactions.value : []),
        // ...(krakenTransactions.status === 'fulfilled' ? krakenTransactions.value : [])
      ];
      
      if (allTransactions.length === 0) {
        moduleLogger.info('No transactions found for today from any platform');
        return [];
      }
      
      moduleLogger.info(`Processing ${allTransactions.length} transactions from all platforms`);
      
      // Store transactions in MongoDB
      const savedTransactions = await this.saveTransactionsToDatabase(allTransactions);
      
      // Sync unsynchronized transactions to Google Sheets
      await this.syncTransactionsToGoogleSheets();
      
      return savedTransactions;
    } catch (error) {
      moduleLogger.error('Failed to fetch and store transactions:', error);
      throw error;
    }
  }

  /**
   * Fetches today's transactions from Binance
   * @returns {Promise<Array>} Array of Binance transactions
   */
  async fetchBinanceTransactions() {
    try {
      moduleLogger.info('Starting Binance transaction fetch process - detailed debug enabled');
      
      // Ensure the Binance service has valid credentials
      moduleLogger.debug('Binance API credentials check', {
        hasApiKey: !!binanceService.apiKey,
        hasApiSecret: !!binanceService.apiSecret,
        baseUrl: binanceService.baseUrl
      });
      
      moduleLogger.info('Fetching data from Binance API with three separate calls...');
      
      // Fetch all types of transactions from Binance
      const [standardTransactions, deposits, p2pTrades] = await Promise.allSettled([
        binanceService.fetchTodayTransactions().catch(err => {
          moduleLogger.error('Error fetching standard Binance transactions:', {
            error: err.message,
            stack: err.stack,
            code: err.code,
            statusCode: err.response?.status
          });
          return [];
        }),
        binanceService.fetchTodayDeposits().catch(err => {
          moduleLogger.error('Error fetching Binance deposits:', {
            error: err.message,
            stack: err.stack,
            code: err.code,
            statusCode: err.response?.status
          });
          return [];
        }),
        binanceService.fetchTodayP2PTrades().catch(err => {
          moduleLogger.error('Error fetching Binance P2P trades:', {
            error: err.message,
            stack: err.stack,
            code: err.code,
            statusCode: err.response?.status
          });
          return [];
        })
      ]);
      
      moduleLogger.debug('Binance API call results:', {
        standardTransactions: {
          status: standardTransactions.status,
          dataCount: standardTransactions.status === 'fulfilled' ? standardTransactions.value.length : 0,
          error: standardTransactions.status === 'rejected' ? standardTransactions.reason?.message : null
        },
        deposits: {
          status: deposits.status,
          dataCount: deposits.status === 'fulfilled' ? deposits.value.length : 0,
          error: deposits.status === 'rejected' ? deposits.reason?.message : null
        },
        p2pTrades: {
          status: p2pTrades.status,
          dataCount: p2pTrades.status === 'fulfilled' ? p2pTrades.value.length : 0,
          error: p2pTrades.status === 'rejected' ? p2pTrades.reason?.message : null
        }
      });
      
      // Combine all transaction types
      const allBinanceTransactions = [
        ...(standardTransactions.status === 'fulfilled' ? standardTransactions.value : []),
        ...(deposits.status === 'fulfilled' ? deposits.value : []),
        ...(p2pTrades.status === 'fulfilled' ? p2pTrades.value : [])
      ];
      
      moduleLogger.info(`Fetched ${allBinanceTransactions.length} total Binance transactions`);
      
      // More detailed logging of transaction breakdown
      const standardCount = standardTransactions.status === 'fulfilled' ? standardTransactions.value.length : 0;
      const depositsCount = deposits.status === 'fulfilled' ? deposits.value.length : 0;
      const p2pCount = p2pTrades.status === 'fulfilled' ? p2pTrades.value.length : 0;
      
      moduleLogger.debug(`Transaction breakdown: ${standardCount} standard, ${depositsCount} deposits, ${p2pCount} P2P trades`);
      
      // Log examples of each transaction type for debugging
      if (standardCount > 0) {
        moduleLogger.debug('Sample standard transaction:', {
          sample: standardTransactions.value[0]
        });
      }
      
      if (depositsCount > 0) {
        moduleLogger.debug('Sample deposit transaction:', {
          sample: deposits.value[0]
        });
      }
      
      if (p2pCount > 0) {
        moduleLogger.debug('Sample P2P transaction:', {
          sample: p2pTrades.value[0]
        });
      }
      
      // Ensure platform is set
      return allBinanceTransactions.map(transaction => ({
        ...transaction,
        platform: 'BINANCE'
      }));
    } catch (error) {
      moduleLogger.error('Failed to fetch Binance transactions:', {
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Fetches today's transactions from Revolut
   * @returns {Promise<Array>} Array of Revolut transactions
   */
  async fetchRevolutTransactions() {
    try {
      const transactions = await revolutService.fetchTodayTransactions();
      
      // Add platform identifier to each transaction
      return transactions.map(transaction => ({
        ...transaction,
        platform: 'REVOLUT'
      }));
    } catch (error) {
      moduleLogger.error('Failed to fetch Revolut transactions:', error);
      return [];
    }
  }

  /**
   * Fetches today's transactions from Kraken
   * @returns {Promise<Array>} Array of Kraken transactions
   */
  async fetchKrakenTransactions() {
    try {
      const transactions = await krakenService.fetchTodayTransactions();
      
      // Add platform identifier to each transaction
      return transactions.map(transaction => ({
        ...transaction,
        platform: 'KRAKEN'
      }));
    } catch (error) {
      moduleLogger.error('Failed to fetch Kraken transactions:', error);
      return [];
    }
  }

  /**
   * Saves transactions to MongoDB
   * @param {Array} transactions - Array of transaction objects from various platforms
   * @returns {Promise<Array>} Array of saved transaction documents
   * @private
   */
  async saveTransactionsToDatabase(transactions) {
    try {
      // Include all transactions, not just the completed ones, but log them differently
      const completedTransactions = transactions.filter(
        transaction => transaction.status === "FILLED" || transaction.status === "COMPLETED"
      );
      
      const pendingTransactions = transactions.filter(
        transaction => transaction.status !== "FILLED" && transaction.status !== "COMPLETED"
      );
      
      moduleLogger.info(`Processing ${completedTransactions.length} completed and ${pendingTransactions.length} pending transactions out of ${transactions.length} total`);
      
      // Track transactions with and without customer IDs
      const identifiedTransactions = transactions.filter(t => t.customerId);
      const unidentifiedTransactions = transactions.filter(t => !t.customerId);
      
      moduleLogger.info(`Transaction breakdown: ${identifiedTransactions.length} with customer ID, ${unidentifiedTransactions.length} without customer ID`);
      
      const operations = transactions.map(transaction => {
        // Ensure these fields exist to avoid schema validation issues
        const transactionData = {
          orderId: transaction.orderId || `unknown-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
          platform: transaction.platform,
          transactionType: transaction.transactionType || 'OTHER',
          symbol: transaction.symbol,
          side: transaction.side,
          type: transaction.type,
          price: parseFloat(transaction.price) || 1,
          quantity: parseFloat(transaction.quantity || transaction.origQty) || 0,
          quoteQuantity: parseFloat(transaction.quoteQuantity || transaction.cummulativeQuoteQty) || 0,
          status: transaction.status,
          time: new Date(transaction.time),
          updateTime: new Date(transaction.updateTime || transaction.time),
          isWorking: transaction.isWorking || false,
          isSynced: false,
          customerId: transaction.customerId || null,
          walletAddress: transaction.walletAddress || null
        };
        
        // Add payment details if they exist
        if (transaction.paymentDetails) {
          transactionData.paymentDetails = transaction.paymentDetails;
        }
        
        return {
          updateOne: {
            filter: { 
              orderId: transactionData.orderId,
              platform: transactionData.platform
            },
            update: {
              $set: transactionData,
            },
            upsert: true,
          },
        };
      });
      
      if (operations.length > 0) {
        const result = await Transaction.bulkWrite(operations);
        moduleLogger.info(`Transaction save result: ${result.upsertedCount} upserted, ${result.modifiedCount} modified`);
      }
      
      // Retrieve the saved transactions to return
      const savedTransactions = await Transaction.find({
        $or: transactions.map(t => ({ 
          orderId: t.orderId || `unknown-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`, 
          platform: t.platform 
        }))
      });
      
      moduleLogger.info(`${savedTransactions.length} transactions saved to database`);
      return savedTransactions;
    } catch (error) {
      moduleLogger.error('Failed to save transactions to database:', error);
      throw error;
    }
  }

  /**
   * Syncs unsynced transactions to Google Sheets
   * @returns {Promise<Array>} Array of synced transaction documents
   */
  async syncTransactionsToGoogleSheets() {
    try {
      // Find unsynced transactions
      const unsyncedTransactions = await Transaction.find({ isSynced: false });
      
      if (unsyncedTransactions.length === 0) {
        moduleLogger.info('No unsynced transactions to sync to Google Sheets');
        return [];
      }
      
      moduleLogger.info(`Found ${unsyncedTransactions.length} unsynced transactions to sync to Google Sheets`);
      
      // Log breakdown of transactions with/without customer IDs
      const identifiedTransactions = unsyncedTransactions.filter(t => t.customerId);
      const unidentifiedTransactions = unsyncedTransactions.filter(t => !t.customerId);
      moduleLogger.debug(`Syncing breakdown: ${identifiedTransactions.length} with customer ID, ${unidentifiedTransactions.length} without customer ID`);
      
      // Write to Google Sheets
      await googleSheetsService.writeTransactions(unsyncedTransactions);
      
      // Update transactions as synced
      const transactionIds = unsyncedTransactions.map(t => t._id);
      await Transaction.updateMany(
        { _id: { $in: transactionIds } },
        { $set: { isSynced: true } }
      );
      
      moduleLogger.info(`${unsyncedTransactions.length} transactions synced to Google Sheets`);
      
      return unsyncedTransactions;
    } catch (error) {
      moduleLogger.error('Failed to sync transactions to Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Processes a transaction update from the webhook
   * @param {Object} transactionData - Transaction data from webhook
   * @returns {Promise<Object|null>} Saved transaction document or null if not completed
   */
  async processWebhookTransaction(transactionData) {
    try {
      // We'll save all transactions, regardless of status, but we'll log them differently
      if (transactionData.status !== "FILLED" && transactionData.status !== "COMPLETED") {
        moduleLogger.info(`Processing non-completed transaction ${transactionData.orderId} with status ${transactionData.status}`);
      } else {
        moduleLogger.info(`Processing completed transaction ${transactionData.orderId}`);
      }
      
      // Ensure the platform is specified
      if (!transactionData.platform) {
        moduleLogger.error('Platform not specified for webhook transaction');
        throw new Error('Platform not specified');
      }
      
      // Save transaction to database
      const transactionToSave = {
        orderId: transactionData.orderId || `unknown-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        platform: transactionData.platform,
        transactionType: transactionData.transactionType || 'OTHER',
        symbol: transactionData.symbol,
        side: transactionData.side,
        type: transactionData.type,
        price: parseFloat(transactionData.price) || 1,
        quantity: parseFloat(transactionData.quantity || transactionData.origQty) || 0,
        quoteQuantity: parseFloat(transactionData.quoteQuantity || transactionData.cummulativeQuoteQty) || 0,
        status: transactionData.status,
        time: new Date(transactionData.time),
        updateTime: new Date(transactionData.updateTime || transactionData.time),
        isWorking: transactionData.isWorking || false,
        isSynced: false,
        customerId: transactionData.customerId || null,
        walletAddress: transactionData.walletAddress || null
      };
      
      // Add payment details if they exist
      if (transactionData.paymentDetails) {
        transactionToSave.paymentDetails = transactionData.paymentDetails;
      }
      
      const transaction = new Transaction(transactionToSave);
      await transaction.save();
      
      // Sync to Google Sheets
      await googleSheetsService.writeTransactions([transaction]);
      
      // Mark as synced
      transaction.isSynced = true;
      await transaction.save();
      
      moduleLogger.info(`Transaction ${transaction.orderId} from ${transaction.platform} saved and synced`);
      
      return transaction;
    } catch (error) {
      moduleLogger.error(`Failed to process webhook transaction:`, { error: error.message, data: transactionData });
      throw error;
    }
  }
}

module.exports = new TransactionService(); 