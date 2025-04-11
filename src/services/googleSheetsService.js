/**
 * @fileoverview Service for interacting with the Google Sheets API
 * @module services/googleSheetsService
 */

const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('googleSheetsService');

/**
 * Google Sheets API service for writing transaction data
 */
class GoogleSheetsService {
  constructor() {
    this.sheetId = config.googleSheets.sheetId;
    this.credentialsPath = config.googleSheets.credentialsPath;
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
      moduleLogger.debug('Using credentials from path:', this.credentialsPath);
      
      // Load credentials
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      
      // Create JWT client
      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      // Create Google Sheets API client
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      moduleLogger.info('Google Sheets service initialized successfully');
    } catch (error) {
      moduleLogger.error('Failed to initialize Google Sheets service', { 
        error: error.message,
        stack: error.stack,
        path: this.credentialsPath
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
          transaction.symbol,
          transaction.side,
          transaction.type,
          transaction.price,
          transaction.quantity,
          transaction.quoteQuantity,
          transaction.status,
          new Date(transaction.time).toISOString(),
          new Date(transaction.updateTime).toISOString(),
          transaction.walletAddress || '',
          paymentInfo
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
      
      // Append to the sheet
      moduleLogger.debug(`Appending rows to sheet: ${this.sheetId}, range: Transactions`);
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Transactions', // Assumes sheet named "Transactions"
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