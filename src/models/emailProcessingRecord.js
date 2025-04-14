/**
 * @fileoverview MongoDB model for storing email processing records
 * @module models/emailProcessingRecord
 */

const mongoose = require('mongoose');

/**
 * Schema for email processing records
 */
const emailProcessingRecordSchema = new mongoose.Schema({
  // The Gmail message ID used as the primary key
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // When was this email first processed
  processedAt: {
    type: Date,
    default: Date.now
  },
  
  // The date from the original email's timestamp
  emailDate: {
    type: Date,
    required: false
  },
  
  // Subject line of the email
  subject: {
    type: String,
    required: false
  },
  
  // Status of processing
  status: {
    type: String,
    enum: ['PROCESSED', 'IGNORED', 'ERROR', 'SKIPPED'],
    default: 'PROCESSED'
  },
  
  // Optional error message if status is ERROR
  errorMessage: {
    type: String,
    required: false
  },
  
  // Number of transactions extracted from this email
  transactionCount: {
    type: Number,
    default: 0
  },
  
  // IDs of transactions extracted from this email (e.g. order IDs)
  transactionIds: {
    type: [String],
    default: []
  },
  
  // Any additional metadata, stored as JSON
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  // Enable timestamps for createdAt and updatedAt
  timestamps: true
});

// Index for finding emails by date range
emailProcessingRecordSchema.index({ emailDate: 1 });
emailProcessingRecordSchema.index({ processedAt: 1 });

// Static method to find emails with a specific status
emailProcessingRecordSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

// Static method to clear old records based on email date
emailProcessingRecordSchema.statics.clearOldRecords = function(days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.deleteMany({
    processedAt: { $lt: cutoffDate }
  });
};

// Static method to count records by status
emailProcessingRecordSchema.statics.countByStatus = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Create and export the model
const EmailProcessingRecord = mongoose.model('EmailProcessingRecord', emailProcessingRecordSchema);
module.exports = EmailProcessingRecord; 