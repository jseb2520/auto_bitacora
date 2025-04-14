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

// Colombia timezone (UTC-5)
const TIMEZONE_OFFSET = -5;

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
                      columnCount: 12
                    }
                  }
                }
              }
            ]
          }
        });

        // Add header row with Date as first column
        const headers = [
          'Date', 'Order ID', 'Platform', 'Transaction Type',
          'Symbol', 'Side', 'Type', 'Quantity',
          'Status', 'Time', 'Update Time', 'Source'
        ];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: 'Transactions!A1:L1',
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
      
      // Ensure Transactions sheet exists with headers
      await this.ensureTransactionsSheetExists();
      
      // Define headers for reference
      const headers = [
        'Date', 'Order ID', 'Platform', 'Transaction Type',
        'Symbol', 'Side', 'Type', 'Quantity',
        'Status', 'Time', 'Update Time', 'Source'
      ];
      
      // First, get current content to determine where to append
      const currentContent = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'Transactions!A:L'
      });
      
      const rows = currentContent.data.values || [];
      
      // Find the next available row (rows.length is 0-indexed, but sheet is 1-indexed)
      const nextRow = Math.max(rows.length + 1, 2); // Start at row 2 at minimum (after headers)
      
      moduleLogger.debug(`Appending data starting at row ${nextRow}`);
      
      // If no headers exist, add them
      if (rows.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: 'Transactions!A1:L1',
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [headers]
          }
        });
        moduleLogger.debug('Headers written to the sheet');
      }
      
      // Transform transactions to sheet rows format
      const dataRows = transactions.map(transaction => {
        // Get the email received date from metadata if available
        let emailDate = transaction.time;
        
        // If this is from an email source, try to get the actual received date
        if (transaction.sourceType === 'EMAIL' && transaction.metadata && transaction.metadata.processedAt) {
          emailDate = new Date(transaction.metadata.processedAt);
        }
        
        // Adjust date to Colombia timezone (UTC-5)
        const localDate = new Date(emailDate);
        
        return [
          localDate.toISOString().split('T')[0], // Date column (YYYY-MM-DD)
          transaction.orderId,
          transaction.platform,
          transaction.transactionType || 'OTHER',
          transaction.symbol,
          transaction.side,
          transaction.type,
          transaction.quantity,
          transaction.status,
          new Date(transaction.time).toISOString(),
          new Date(transaction.updateTime || Date.now()).toISOString(),
          transaction.sourceType || 'API'
        ];
      });
      
      // Prepare the values for insertion
      const resource = {
        values: dataRows,
      };
      
      // Append to the sheet starting at the determined row
      moduleLogger.debug(`Writing ${dataRows.length} rows to Google Sheets at row ${nextRow}`);
      
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `Transactions!A${nextRow}:L${nextRow + dataRows.length - 1}`,
        valueInputOption: 'USER_ENTERED',
        resource,
      });
      
      moduleLogger.info('Successfully appended transactions to Google Sheets', {
        updatedRows: dataRows.length,
        startRow: nextRow,
        endRow: nextRow + dataRows.length - 1,
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