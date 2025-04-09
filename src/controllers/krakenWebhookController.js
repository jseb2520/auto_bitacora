/**
 * @fileoverview Controller for handling Kraken webhook requests
 * @module controllers/krakenWebhookController
 */

const crypto = require('crypto');
const config = require('../config');
const transactionService = require('../services/transactionService');

/**
 * Validates the webhook request signature from Kraken
 * @param {Object} req - Express request object
 * @returns {boolean} Whether the signature is valid
 * @private
 */
const _validateSignature = (req) => {
  const signature = req.headers['x-kraken-signature'];
  
  if (!signature) {
    return false;
  }
  
  const payload = JSON.stringify(req.body);
  const secret = Buffer.from(config.kraken.apiSecret, 'base64');
  
  const computedSignature = crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('base64');
  
  return signature === computedSignature;
};

/**
 * Handles Kraken webhook requests for transaction updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const handleWebhook = async (req, res) => {
  try {
    // For security, validate the request signature
    if (!_validateSignature(req)) {
      console.warn('Invalid Kraken webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const transactionData = req.body;
    
    if (!transactionData || !transactionData.orderid) {
      return res.status(400).json({ error: 'Invalid transaction data' });
    }
    
    // Adapt Kraken data to the common format
    const adaptedData = {
      orderId: transactionData.orderid,
      platform: 'KRAKEN',
      symbol: transactionData.pair,
      side: transactionData.type.toUpperCase(),
      type: transactionData.ordertype.toUpperCase(),
      price: parseFloat(transactionData.price),
      origQty: parseFloat(transactionData.vol),
      cummulativeQuoteQty: parseFloat(transactionData.cost),
      status: transactionData.status === 'closed' ? 'FILLED' : transactionData.status.toUpperCase(),
      time: new Date(transactionData.opentm * 1000),
      updateTime: new Date(transactionData.closetm * 1000),
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
    console.error('Kraken webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleWebhook,
}; 