/**
 * @fileoverview Controller for handling Revolut webhook requests
 * @module controllers/revolutWebhookController
 */

const crypto = require('crypto');
const config = require('../config');
const transactionService = require('../services/transactionService');

/**
 * Validates the webhook request signature from Revolut
 * @param {Object} req - Express request object
 * @returns {boolean} Whether the signature is valid
 * @private
 */
const _validateSignature = (req) => {
  const signature = req.headers['x-revolut-signature'];
  
  if (!signature) {
    return false;
  }
  
  const payload = JSON.stringify(req.body);
  const computedSignature = crypto
    .createHmac('sha256', config.revolut.apiSecret)
    .update(payload)
    .digest('hex');
  
  return signature === computedSignature;
};

/**
 * Handles Revolut webhook requests for transaction updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const handleWebhook = async (req, res) => {
  try {
    // For security, validate the request signature
    if (!_validateSignature(req)) {
      console.warn('Invalid Revolut webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const transactionData = req.body;
    
    if (!transactionData || !transactionData.id) {
      return res.status(400).json({ error: 'Invalid transaction data' });
    }
    
    // Adapt Revolut data to the common format
    const adaptedData = {
      orderId: transactionData.id,
      platform: 'REVOLUT',
      symbol: transactionData.symbol,
      side: transactionData.side.toUpperCase(),
      type: transactionData.type.toUpperCase(),
      price: parseFloat(transactionData.price),
      origQty: parseFloat(transactionData.amount),
      cummulativeQuoteQty: parseFloat(transactionData.amount) * parseFloat(transactionData.price),
      status: transactionData.status === 'completed' ? 'FILLED' : transactionData.status.toUpperCase(),
      time: new Date(transactionData.created_at * 1000),
      updateTime: new Date(transactionData.updated_at * 1000),
      isWorking: transactionData.status === 'open',
    };
    
    // Process the transaction
    const result = await transactionService.processWebhookTransaction(adaptedData);
    
    // Return appropriate response even if transaction was not saved (non-completed orders)
    if (!result) {
      return res.status(200).json({ 
        success: true, 
        saved: false, 
        message: `Transaction with status ${adaptedData.status} was not saved` 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      saved: true,
      orderId: result.orderId,
      platform: result.platform
    });
  } catch (error) {
    console.error('Revolut webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleWebhook,
}; 