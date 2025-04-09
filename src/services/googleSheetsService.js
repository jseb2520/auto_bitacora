/**
 * @fileoverview Service for interacting with the Google Sheets API
 * @module services/googleSheetsService
 */

const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config');

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
      
      console.log('Google Sheets service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Sheets service:', error);
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
      await this.initialize();
    }
    
    try {
      // Transform transactions to sheet rows format
      const rows = transactions.map(transaction => [
        transaction.orderId,
        transaction.symbol,
        transaction.side,
        transaction.type,
        transaction.price,
        transaction.quantity,
        transaction.quoteQuantity,
        transaction.status,
        new Date(transaction.time).toISOString(),
        new Date(transaction.updateTime).toISOString()
      ]);
      
      // Prepare the values for insertion
      const resource = {
        values: rows,
      };
      
      // Append to the sheet
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Transactions', // Assumes sheet named "Transactions"
        valueInputOption: 'USER_ENTERED',
        resource,
      });
      
      console.log(`${response.data.updates.updatedRows} rows appended to Google Sheet`);
      
      return response.data;
    } catch (error) {
      console.error('Failed to write transactions to Google Sheets:', error);
      throw error;
    }
  }
}

module.exports = new GoogleSheetsService(); 