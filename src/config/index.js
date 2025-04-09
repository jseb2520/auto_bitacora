/**
 * @fileoverview Configuration module to centralize access to environment variables
 * @module config
 */

const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

/**
 * @typedef {Object} Config
 * @property {Object} server - Server configuration
 * @property {number} server.port - Port the server will listen on
 * @property {string} server.env - Environment (development, production, etc.)
 * @property {Object} mongodb - MongoDB configuration
 * @property {string} mongodb.uri - MongoDB connection URI
 * @property {Object} binance - Binance API configuration
 * @property {string} binance.apiKey - Binance API key
 * @property {string} binance.apiSecret - Binance API secret
 * @property {Object} googleSheets - Google Sheets configuration
 * @property {string} googleSheets.credentialsPath - Path to Google credentials file
 * @property {string} googleSheets.sheetId - ID of the Google Sheet
 */

/**
 * Application configuration object
 * @type {Config}
 */
const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/auto_bitacora',
  },
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
  },
  googleSheets: {
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json',
    sheetId: process.env.GOOGLE_SHEET_ID,
  },
};

module.exports = config; 