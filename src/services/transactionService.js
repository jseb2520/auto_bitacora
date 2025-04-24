/**
 * @fileoverview Service for handling transaction processing and synchronization
 * @module services/transactionService
 */

const Transaction = require('../models/transaction');
const binanceService = require('./binanceService');
const revolutService = require('./revolutService');
const krakenService = require('./krakenService');
const gmailService = require('./gmailService');
const googleSheetsService = require('./googleSheetsService');
const { logger, createModuleLogger } = require('../utils/logger');
const authClient = require('../utils/authClient');
const { google } = require('googleapis');

// Create a module-specific logger
const moduleLogger = createModuleLogger('transactionService');

// Colombia timezone (UTC-5)
const TIMEZONE_OFFSET = -5;

/**
 * Transaction service to manage fetching, storing, and syncing transactions
 */
class TransactionService {
  /**
   * Fetches today's transactions from Gmail for Binance, stores them in MongoDB, and syncs to Google Sheets
   * @returns {Promise<Array>} Array of saved and synced transactions
   */
  async fetchAndStoreTransactions() {
    try {
      moduleLogger.info('Starting transaction fetch process from Gmail');
      
      // Initialize authentication
      await authClient.initialize();
      
      // Fetch Gmail transactions via the Binance email processing
      const gmailTransactions = await this.fetchGmailBinanceTransactions();
      
      if (gmailTransactions.length === 0) {
        moduleLogger.info('No transactions found from Gmail for today');
        return [];
      }
      
      moduleLogger.info(`Processing ${gmailTransactions.length} transactions from Gmail`);
      
      // Store transactions in MongoDB
      const savedTransactions = await this.saveTransactionsToDatabase(gmailTransactions);
      
      // Sync unsynchronized transactions to Google Sheets
      await this.syncTransactionsToGoogleSheets();
      
      return savedTransactions;
    } catch (error) {
      moduleLogger.error('Failed to fetch and store transactions:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Fetches today's Binance transactions from Gmail
   * @returns {Promise<Array>} Array of transactions from Gmail
   */
  async fetchGmailBinanceTransactions() {
    try {
      moduleLogger.info('Starting Gmail Binance transaction fetch process');
      
      // First initialize auth client
      await authClient.initialize();
      const auth = await authClient.getAuthClient();
      
      // Initialize Gmail service with explicit auth
      await gmailService.initialize();
      
      // Make sure gmail is initialized correctly
      if (!gmailService.gmail) {
        moduleLogger.info('Gmail service not initialized, creating it directly');
        gmailService.gmail = google.gmail({ version: 'v1', auth });
      }
      
      // Get today's date range in Colombia timezone (UTC-5)
      const now = new Date();
      
      // Create the start of day in Colombia timezone
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0); // Set to midnight local time
      // Adjust for UTC time (add the offset since we're behind UTC)
      startOfDay.setTime(startOfDay.getTime() + (TIMEZONE_OFFSET * 60 * 60 * 1000));
      
      // Create the end of day in Colombia timezone
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999); // Set to end of day local time
      // Adjust for UTC time (add the offset since we're behind UTC)
      endOfDay.setTime(endOfDay.getTime() + (TIMEZONE_OFFSET * 60 * 60 * 1000));
      
      moduleLogger.info(`Fetching Binance emails for Colombia timezone day (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);
      
      // Use simplified query format following Gmail API docs
      const query = `from:donotreply@directmail.binance.com OR subject:[Binance]`;
      moduleLogger.debug(`Using Gmail query: ${query}`);
      
      // Fetch messages
      const messages = await gmailService.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      });
      
      const allMessageList = messages.data.messages || [];
      moduleLogger.info(`Found ${allMessageList.length} Binance emails in total`);
      
      if (allMessageList.length === 0) {
        moduleLogger.info('No Binance emails found');
        return [];
      }
      
      // Filter messages to only include those from today (in Colombia timezone)
      const messageList = [];
      let skippedCount = 0;
      
      for (const message of allMessageList) {
        try {
          // Fetch minimal message data to check date
          const messageData = await gmailService.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'minimal'
          });
          
          const emailDate = new Date(parseInt(messageData.data.internalDate));
          
          // Check if email is from today in Colombia timezone
          if (emailDate >= startOfDay && emailDate <= endOfDay) {
            messageList.push(message);
          } else {
            skippedCount++;
          }
        } catch (err) {
          moduleLogger.error(`Error checking date for message ${message.id}:`, err);
        }
      }
      
      moduleLogger.info(`Filtered to ${messageList.length} emails from today (Colombia timezone)`);
      moduleLogger.debug(`Skipped ${skippedCount} emails from other days`);
      
      if (messageList.length === 0) {
        moduleLogger.info('No Binance emails found for today');
        return [];
      }
      
      // Fetch full message data for all messages
      const fullMessages = [];
      for (const message of messageList) {
        try {
          const messageData = await gmailService.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          
          fullMessages.push(messageData.data);
        } catch (error) {
          moduleLogger.error(`Error fetching message ${message.id}:`, {
            error: error.message,
            stack: error.stack
          });
        }
      }
      
      // Process all emails
      const transactions = await this.processBinanceEmails(fullMessages);
      
      return transactions;
    } catch (error) {
      moduleLogger.error('Failed to fetch Binance transactions from Gmail:', {
        error: error.message,
        stack: error.stack
      });
      return [];
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
      // Initialize auth client first
      await authClient.initialize();
      const auth = await authClient.getAuthClient();
      
      // Make sure Google Sheets service is initialized
      if (!googleSheetsService.sheets) {
        moduleLogger.info('Initializing Google Sheets service directly');
        googleSheetsService.sheets = google.sheets({ version: 'v4', auth });
        googleSheetsService.auth = auth;
      }
      
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

  /**
   * Processes Binance emails and extracts transaction data
   * @param {Array} messages - Array of Gmail message objects
   * @param {boolean} saveToDb - Whether to save transactions to database (default: true)
   * @param {boolean} syncToSheets - Whether to sync to Google Sheets (default: true)
   * @returns {Promise<Array>} Array of processed transactions
   */
  async processBinanceEmails(messages, saveToDb = true, syncToSheets = true) {
    try {
      moduleLogger.info(`Processing ${messages.length} Binance emails`);
      
      const allTransactions = [];
      
      for (const message of messages) {
        try {
          // Extract email data
          const headers = message.payload.headers || [];
          const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
          const subject = subjectHeader ? subjectHeader.value : 'No Subject';
          
          const emailDate = new Date(parseInt(message.internalDate));
          const body = gmailService.getEmailBody(message.payload);
          
          if (!body) {
            moduleLogger.warn(`Could not extract body from email: ${message.id}`);
            continue;
          }
          
          // Check if we've already processed this message via the database (when running in main app)
          if (saveToDb) {
            try {
              const EmailProcessingRecord = require('../models/emailProcessingRecord');
              const existingRecord = await EmailProcessingRecord.findOne({ messageId: message.id });
              
              if (existingRecord) {
                moduleLogger.info(`Skipping already processed email: ${message.id} (${subject})`);
                continue;
              }
            } catch (dbError) {
              moduleLogger.warn(`Could not check email processing record, will continue: ${dbError.message}`);
            }
          }
          
          // Extract transaction details
          const transactions = gmailService.extractTransactionDetails(body, subject, emailDate);
          
          if (transactions && transactions.length > 0) {
            // Add source, platform info, and message ID reference
            transactions.forEach(tx => {
              tx.sourceType = 'EMAIL';
              tx.platform = 'BINANCE';
              tx.status = 'COMPLETED';
              
              // Add metadata to track which email this transaction came from
              tx.metadata = {
                messageId: message.id,
                subject: subject,
                processedAt: new Date().toISOString()
              };
              
              allTransactions.push(tx);
            });
            
            moduleLogger.debug(`Successfully extracted ${transactions.length} transactions from email: ${subject}`);
            
            // Record this message as processed in the database (when running in main app)
            if (saveToDb) {
              try {
                const EmailProcessingRecord = require('../models/emailProcessingRecord');
                await EmailProcessingRecord.create({
                  messageId: message.id,
                  emailDate: emailDate,
                  subject: subject,
                  status: 'PROCESSED',
                  transactionIds: transactions.map(tx => tx.orderId)
                });
                moduleLogger.debug(`Recorded email ${message.id} as processed in database`);
              } catch (dbError) {
                moduleLogger.warn(`Could not record email processing in database: ${dbError.message}`);
              }
            }
          } else {
            moduleLogger.debug(`No transactions found in email: ${subject}`);
          }
        } catch (error) {
          moduleLogger.error(`Error processing email ${message.id}:`, {
            error: error.message,
            stack: error.stack
          });
        }
      }
      
      moduleLogger.info(`Extracted ${allTransactions.length} transactions from ${messages.length} emails`);
      
      // Save to database if requested
      if (saveToDb && allTransactions.length > 0) {
        await this.saveTransactionsToDatabase(allTransactions);
        moduleLogger.info(`Saved ${allTransactions.length} transactions to database`);
      }
      
      // Sync to Google Sheets if requested
      if (syncToSheets && allTransactions.length > 0) {
        await googleSheetsService.writeTransactions(allTransactions);
        moduleLogger.info(`Synced ${allTransactions.length} transactions to Google Sheets`);
      }
      
      return allTransactions;
    } catch (error) {
      moduleLogger.error('Failed to process Binance emails:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new TransactionService(); 