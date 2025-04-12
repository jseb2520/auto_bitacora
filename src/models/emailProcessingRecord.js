/**
 * @fileoverview MongoDB model for tracking processed emails
 * @module models/emailProcessingRecord
 */

const mongoose = require('mongoose');

/**
 * Email Processing Record Schema
 * Stores information about processed emails to prevent duplicate processing
 */
const EmailProcessingRecordSchema = new mongoose.Schema({
  /**
   * Unique Gmail message ID
   */
  messageId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  
  /**
   * Email received date
   */
  emailDate: { 
    type: Date,
    required: true
  },
  
  /**
   * Email subject for reference
   */
  subject: { 
    type: String
  },
  
  /**
   * Timestamp when the email was processed
   */
  processedAt: { 
    type: Date, 
    default: Date.now 
  },
  
  /**
   * Array of transaction IDs created from this email
   */
  transactionIds: [{ 
    type: String 
  }],
  
  /**
   * Email sender address
   */
  from: {
    type: String
  },
  
  /**
   * Processing status
   */
  status: {
    type: String,
    enum: ['PROCESSED', 'FAILED', 'IGNORED'],
    default: 'PROCESSED'
  },
  
  /**
   * Error message if processing failed
   */
  errorMessage: {
    type: String
  }
}, { 
  timestamps: true 
});

// Create indexes for frequent queries
EmailProcessingRecordSchema.index({ emailDate: -1 });
EmailProcessingRecordSchema.index({ status: 1 });

// Create the model
const EmailProcessingRecord = mongoose.model('EmailProcessingRecord', EmailProcessingRecordSchema);

module.exports = EmailProcessingRecord; 