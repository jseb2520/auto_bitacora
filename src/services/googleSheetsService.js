/**
 * @fileoverview Service for interacting with the Google Sheets API
 * @module services/googleSheetsService
 */

const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config');
const authClient = require('../utils/authClient');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('googleSheetsService');

/**
 * Google Sheets API service for writing transaction data
 */
class GoogleSheetsService {
  constructor() {
    this.sheetId = config.googleSheets.sheetId;
    this.sheets = null;
    this.auth = null;
  }

  /**
   * Initializes the Google Sheets API client
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      moduleLogger.info('Initializing Google Sheets service');
      
      // Use the same auth client as Gmail
      this.auth = await authClient.getAuthClient();
      
      // Create Google Sheets API client
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      moduleLogger.info('Google Sheets service initialized successfully');
    } catch (error) {
      moduleLogger.error('Failed to initialize Google Sheets service', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Ensures the Transactions sheet exists, creates it if not
   * @returns {Promise<void>}
   */
  async ensureTransactionsSheetExists() {
    try {
      // Get sheet info to check if it exists
      const sheetInfo = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId
      });
      
      // Check if Transactions sheet exists
      let transactionsSheetExists = false;
      if (sheetInfo && sheetInfo.data && sheetInfo.data.sheets) {
        transactionsSheetExists = sheetInfo.data.sheets.some(
          sheet => sheet.properties.title === 'Transactions'
        );
      }
      
      // Create Transactions sheet if it doesn't exist
      if (!transactionsSheetExists) {
        moduleLogger.info('Transactions sheet does not exist. Creating it...');
        
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: 'Transactions',
                    gridProperties: {
                      rowCount: 2000,
                      columnCount: 20
                    }
                  }
                }
              }
            ]
          }
        });
        
        // Add header row
        const headers = [
          'Order ID', 'Platform', 'Transaction Type', 'Customer', 'Title',
          'Symbol', 'Side', 'Type', 'Price', 'Quantity', 'Quote Quantity',
          'Status', 'Time', 'Update Time', 'Wallet Address', 'Payment Info', 'Source'
        ];
        
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: 'Transactions!A1:Q1',
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [headers]
          }
        });
        
        moduleLogger.info('Transactions sheet created with headers');
      }
    } catch (error) {
      moduleLogger.error('Failed to ensure Transactions sheet exists', { 
        error: error.message,
        stack: error.stack,
        sheetId: this.sheetId
      });
      throw error;
    }
  }

  /**
   * Writes transactions to Google Sheets
   * @param {Array} transactions - Array of transaction objects
   * @returns {Promise<Object>} Response from Google Sheets API
   */
  async writeTransactions(transactions) {
    if (!this.sheets) {
      moduleLogger.debug('Google Sheets client not initialized, initializing now');
      await this.initialize();
    }
    
    try {
      moduleLogger.info(`Writing ${transactions.length} transactions to Google Sheets`);
      
      // Ensure Transactions sheet exists
      await this.ensureTransactionsSheetExists();
      
      // Transform transactions to sheet rows format
      const rows = transactions.map(transaction => {
        const customerConfig = require('../config/customers');
        let customerName = 'Unknown';
        
        // Try to identify customer
        if (transaction.customerId) {
          const customer = customerConfig.getCustomerById(transaction.customerId);
          if (customer) {
            customerName = customer.name;
          }
        } else if (transaction.walletAddress) {
          const customer = customerConfig.getCustomerByWalletAddress(transaction.walletAddress);
          if (customer) {
            customerName = customer.name;
          }
        }
        
        // Get payment details if available
        let paymentInfo = '';
        if (transaction.paymentDetails) {
          const details = transaction.paymentDetails;
          paymentInfo = [
            details.method,
            details.accountId,
            details.email,
            details.phone,
            details.reference
          ].filter(Boolean).join(', ');
        }
        
        return [
          transaction.orderId,
          transaction.platform,
          transaction.transactionType || 'OTHER',
          customerName,
          transaction.title || '',
          transaction.symbol,
          transaction.side,
          transaction.type,
          transaction.price,
          transaction.quantity,
          transaction.quoteQuantity,
          transaction.status,
          new Date(transaction.time).toISOString(),
          new Date(transaction.updateTime || Date.now()).toISOString(),
          transaction.walletAddress || '',
          paymentInfo,
          transaction.sourceType || 'API'
        ];
      });
      
      moduleLogger.debug('Transactions transformed to sheets format', {
        rowCount: rows.length,
        sampleRow: rows.length > 0 ? rows[0] : 'No rows'
      });
      
      // Prepare the values for insertion
      const resource = {
        values: rows,
      };
      
      // Append to the sheet with a specific range
      moduleLogger.debug(`Appending rows to sheet: ${this.sheetId}, range: Transactions!A2`);
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Transactions!A2',
        valueInputOption: 'USER_ENTERED',
        resource,
      });
      
      moduleLogger.info('Successfully wrote transactions to Google Sheets', {
        updatedRows: response.data.updates.updatedRows,
        updatedColumns: response.data.updates.updatedColumns,
        updatedCells: response.data.updates.updatedCells,
        sheetId: this.sheetId
      });
      
      return response.data;
    } catch (error) {
      moduleLogger.error('Failed to write transactions to Google Sheets', { 
        error: error.message,
        stack: error.stack,
        transactionCount: transactions.length,
        sheetId: this.sheetId
      });
      throw error;
    }
  }
}

module.exports = new GoogleSheetsService(); 