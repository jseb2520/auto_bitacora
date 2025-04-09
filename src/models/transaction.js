/**
 * @fileoverview Transaction model for storing Binance transactions
 * @module models/transaction
 */

const mongoose = require('mongoose');

/**
 * Transaction Schema
 * @typedef {Object} TransactionSchema
 * @property {string} orderId - Binance order ID
 * @property {string} symbol - Trading pair symbol (e.g., BTCUSDT)
 * @property {string} side - Order side (BUY or SELL)
 * @property {string} type - Order type (LIMIT, MARKET, etc.)
 * @property {number} price - Order price
 * @property {number} quantity - Order quantity
 * @property {number} quoteQuantity - Quote order quantity
 * @property {string} status - Order status
 * @property {Date} time - Order time
 * @property {Date} updateTime - Last update time
 * @property {boolean} isWorking - Whether the order is working
 * @property {boolean} isSynced - Whether the order is synced with Google Sheets
 */

const transactionSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    side: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    quoteQuantity: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    time: {
      type: Date,
      required: true,
      index: true,
    },
    updateTime: {
      type: Date,
      required: true,
    },
    isWorking: {
      type: Boolean,
      default: false,
    },
    isSynced: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Transaction model
 * @type {mongoose.Model}
 */
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction; 