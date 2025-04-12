/**
 * @fileoverview Transaction model definition
 * @module models/transaction
 */

const mongoose = require('mongoose');

/**
 * Define the payment details schema
 */
const PaymentDetailsSchema = new mongoose.Schema({
  method: {
    type: String,
    default: 'Unknown'
  },
  accountId: {
    type: String,
    default: null
  },
  email: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  reference: {
    type: String,
    default: null
  },
  additionalInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

/**
 * Define the transaction schema
 */
const TransactionSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['BINANCE', 'REVOLUT', 'KRAKEN']
  },
  transactionType: {
    type: String,
    required: true,
    enum: ['DEPOSIT', 'P2P_SELL', 'PAYMENT', 'WITHDRAWAL', 'TRADE', 'OTHER'],
    default: 'OTHER'
  },
  // Optional title field for emails like "Payment Transaction Detail"
  title: {
    type: String
  },
  symbol: {
    type: String,
    required: true
  },
  side: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  quoteQuantity: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    required: true
  },
  time: {
    type: Date,
    required: true
  },
  updateTime: {
    type: Date,
    required: true
  },
  isWorking: {
    type: Boolean,
    default: false
  },
  isSynced: {
    type: Boolean,
    default: false
  },
  isReported: {
    type: Boolean,
    default: false
  },
  customerId: {
    type: String,
    default: null
  },
  walletAddress: {
    type: String,
    default: null
  },
  paymentDetails: {
    type: PaymentDetailsSchema,
    default: null
  },
  // Source of the transaction data
  sourceType: {
    type: String,
    enum: ['API', 'GMAIL', 'MANUAL'],
    default: 'API'
  },
  // Raw time string for reference
  rawTimeString: {
    type: String
  }
}, {
  timestamps: true
});

// Create a compound index for more efficient lookup
TransactionSchema.index({ orderId: 1, platform: 1 }, { unique: true });

// Create indexes for common query patterns
TransactionSchema.index({ isSynced: 1 });
TransactionSchema.index({ isReported: 1 });
TransactionSchema.index({ customerId: 1 });
TransactionSchema.index({ time: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ transactionType: 1 });
TransactionSchema.index({ walletAddress: 1 });
TransactionSchema.index({ sourceType: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema); 