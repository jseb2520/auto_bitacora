/**
 * @fileoverview Cryptographic utilities for webhook signature verification
 * @module middleware/crypto
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Verifies a Binance webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from request header
 * @returns {boolean} Whether the signature is valid
 */
const verifyBinanceSignature = (payload, signature) => {
  if (!payload || !signature) {
    return false;
  }
  
  try {
    const computedSignature = crypto
      .createHmac('sha256', config.binance.apiSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('Error verifying Binance signature:', error);
    return false;
  }
};

/**
 * Verifies a Revolut webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from request header
 * @returns {boolean} Whether the signature is valid
 */
const verifyRevolutSignature = (payload, signature) => {
  if (!payload || !signature) {
    return false;
  }
  
  try {
    const computedSignature = crypto
      .createHmac('sha256', config.revolut.apiSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('Error verifying Revolut signature:', error);
    return false;
  }
};

/**
 * Verifies a Kraken webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from request header
 * @returns {boolean} Whether the signature is valid
 */
const verifyKrakenSignature = (payload, signature) => {
  if (!payload || !signature) {
    return false;
  }
  
  try {
    const computedSignature = crypto
      .createHmac('sha256', config.kraken.apiSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('Error verifying Kraken signature:', error);
    return false;
  }
};

/**
 * Generates a secure random API key
 * @param {number} length - Length of the API key to generate
 * @returns {string} Generated API key
 */
const generateApiKey = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  verifyBinanceSignature,
  verifyRevolutSignature,
  verifyKrakenSignature,
  generateApiKey
}; 