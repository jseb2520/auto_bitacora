/**
 * @fileoverview Controller for handling Binance webhook requests
 * @module controllers/binanceWebhookController
 */

const crypto = require('crypto');
const config = require('../config');
const transactionService = require('../services/transactionService');

/**
 * Validates the webhook request signature from Binance
 * @param {Object} req - Express request object
 * @returns {boolean} Whether the signature is valid
 * @private
 */
const _validateSignature = (req) => {
  const signature = req.headers['x-binance-signature'];
  
  if (!signature) {
    return false;
  }
  
  const payload = JSON.stringify(req.body);
  const computedSignature = crypto
    .createHmac('sha256', config.binance.apiSecret)
    .update(payload)
    .digest('hex');
  
  return signature === computedSignature;
};

/**
 * Handles Binance webhook requests for transaction updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const handleWebhook = async (req, res) => {
  try {
    // For security, validate the request signature
    if (!_validateSignature(req)) {
      console.warn('Invalid Binance webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const transactionData = req.body;
    
    if (!transactionData || !transactionData.orderId) {
      return res.status(400).json({ error: 'Invalid transaction data' });
    }
    
    // Add platform information
    transactionData.platform = 'BINANCE';
    
    // Process the transaction
    const result = await transactionService.processWebhookTransaction(transactionData);
    
    // Return appropriate response even if transaction was not saved (non-completed orders)
    if (!result) {
      return res.status(200).json({ 
        success: true, 
        saved: false, 
        message: `Transaction with status ${transactionData.status} was not saved` 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      saved: true,
      orderId: result.orderId,
      platform: result.platform
    });
  } catch (error) {
    console.error('Binance webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleWebhook,
}; 