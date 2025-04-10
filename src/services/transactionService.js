/**
 * @fileoverview Service for handling transaction processing and synchronization
 * @module services/transactionService
 */

const Transaction = require('../models/transaction');
const binanceService = require('./binanceService');
const revolutService = require('./revolutService');
const krakenService = require('./krakenService');
const googleSheetsService = require('./googleSheetsService');

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
      // Fetch transactions from all platforms
      const [binanceTransactions, revolutTransactions, krakenTransactions] = await Promise.allSettled([
        this.fetchBinanceTransactions(),
        this.fetchRevolutTransactions(),
        this.fetchKrakenTransactions()
      ]);
      
      const allTransactions = [
        ...(binanceTransactions.status === 'fulfilled' ? binanceTransactions.value : []),
        ...(revolutTransactions.status === 'fulfilled' ? revolutTransactions.value : []),
        ...(krakenTransactions.status === 'fulfilled' ? krakenTransactions.value : [])
      ];
      
      if (allTransactions.length === 0) {
        console.log('No transactions found for today from any platform');
        return [];
      }
      
      console.log(`Processing ${allTransactions.length} transactions from all platforms`);
      
      // Store transactions in MongoDB
      const savedTransactions = await this.saveTransactionsToDatabase(allTransactions);
      
      // Sync unsynchronized transactions to Google Sheets
      await this.syncTransactionsToGoogleSheets();
      
      return savedTransactions;
    } catch (error) {
      console.error('Failed to fetch and store transactions:', error);
      throw error;
    }
  }

  /**
   * Fetches today's transactions from Binance
   * @returns {Promise<Array>} Array of Binance transactions
   */
  async fetchBinanceTransactions() {
    try {
      const transactions = await binanceService.fetchTodayTransactions();
      
      // Add platform identifier to each transaction
      return transactions.map(transaction => ({
        ...transaction,
        platform: 'BINANCE'
      }));
    } catch (error) {
      console.error('Failed to fetch Binance transactions:', error);
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
      console.error('Failed to fetch Revolut transactions:', error);
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
      console.error('Failed to fetch Kraken transactions:', error);
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
      // Filter out transactions that are not completed
      const completedTransactions = transactions.filter(
        transaction => transaction.status === "FILLED" || transaction.status === "COMPLETED"
      );
      
      if (completedTransactions.length === 0) {
        console.log('No completed transactions to save');
        return [];
      }
      
      console.log(`Processing ${completedTransactions.length} completed transactions out of ${transactions.length} total`);
      
      const operations = completedTransactions.map(transaction => {
        return {
          updateOne: {
            filter: { 
              orderId: transaction.orderId,
              platform: transaction.platform
            },
            update: {
              $set: {
                orderId: transaction.orderId,
                platform: transaction.platform,
                symbol: transaction.symbol,
                side: transaction.side,
                type: transaction.type,
                price: parseFloat(transaction.price),
                quantity: parseFloat(transaction.origQty),
                quoteQuantity: parseFloat(transaction.cummulativeQuoteQty),
                status: transaction.status,
                time: new Date(transaction.time),
                updateTime: new Date(transaction.updateTime),
                isWorking: transaction.isWorking,
                isSynced: false,
              },
            },
            upsert: true,
          },
        };
      });
      
      if (operations.length > 0) {
        await Transaction.bulkWrite(operations);
        console.log(`${operations.length} completed transactions saved to database`);
      }
      
      // Retrieve the saved transactions to return
      const savedTransactions = await Transaction.find({
        $or: completedTransactions.map(t => ({ 
          orderId: t.orderId, 
          platform: t.platform 
        }))
      });
      
      return savedTransactions;
    } catch (error) {
      console.error('Failed to save transactions to database:', error);
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
        console.log('No unsynced transactions to sync to Google Sheets');
        return [];
      }
      
      console.log(`Found ${unsyncedTransactions.length} unsynced transactions`);
      
      // Write to Google Sheets
      await googleSheetsService.writeTransactions(unsyncedTransactions);
      
      // Update transactions as synced
      const transactionIds = unsyncedTransactions.map(t => t._id);
      await Transaction.updateMany(
        { _id: { $in: transactionIds } },
        { $set: { isSynced: true } }
      );
      
      console.log(`${unsyncedTransactions.length} transactions synced to Google Sheets`);
      
      return unsyncedTransactions;
    } catch (error) {
      console.error('Failed to sync transactions to Google Sheets:', error);
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
      // Only save transactions with status "FILLED" or "COMPLETED"
      if (transactionData.status !== "FILLED" && transactionData.status !== "COMPLETED") {
        console.log(`Ignoring transaction ${transactionData.orderId} with status ${transactionData.status}`);
        return null;
      }
      
      // Ensure the platform is specified
      if (!transactionData.platform) {
        console.error('Platform not specified for webhook transaction');
        throw new Error('Platform not specified');
      }
      
      // Save transaction to database
      const transaction = new Transaction({
        orderId: transactionData.orderId,
        platform: transactionData.platform,
        symbol: transactionData.symbol,
        side: transactionData.side,
        type: transactionData.type,
        price: parseFloat(transactionData.price),
        quantity: parseFloat(transactionData.origQty),
        quoteQuantity: parseFloat(transactionData.cummulativeQuoteQty),
        status: transactionData.status,
        time: new Date(transactionData.time),
        updateTime: new Date(transactionData.updateTime),
        isWorking: transactionData.isWorking,
        isSynced: false,
      });
      
      await transaction.save();
      console.log(`Completed transaction ${transaction.orderId} from ${transaction.platform} saved from webhook`);
      
      // Sync to Google Sheets
      await googleSheetsService.writeTransactions([transaction]);
      
      // Update as synced
      transaction.isSynced = true;
      await transaction.save();
      
      console.log(`Transaction ${transaction.orderId} from ${transaction.platform} synced to Google Sheets`);
      
      return transaction;
    } catch (error) {
      console.error('Failed to process webhook transaction:', error);
      throw error;
    }
  }
}

module.exports = new TransactionService(); 