/**
 * @fileoverview Service for interacting with the Telegram Bot API
 * @module services/telegramService
 */

const axios = require('axios');
const config = require('../config');

/**
 * Telegram service for sending notifications to customers
 */
class TelegramService {
  constructor() {
    this.token = config.telegram.botToken;
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
  }

  /**
   * Sends a message to a Telegram chat
   * @param {string} chatId - Telegram chat ID
   * @param {string} text - Message text (supports HTML formatting)
   * @returns {Promise<Object>} Telegram API response
   */
  async sendMessage(chatId, text) {
    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      });
      
      console.log(`Message sent to Telegram chat ${chatId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to send Telegram message:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Formats a daily summary message for a customer
   * @param {Object} customer - Customer object
   * @param {Array} deposits - Array of deposit transactions
   * @param {Array} p2pSells - Array of P2P sell transactions
   * @returns {string} Formatted message text
   */
  formatDailySummary(customer, deposits, p2pSells) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    
    // Calculate totals
    const totalDeposits = deposits.reduce((sum, tx) => sum + tx.quantity, 0);
    const totalSells = p2pSells.reduce((sum, tx) => sum + tx.quoteQuantity, 0);
    
    // Format message with HTML
    let message = `<b>Daily Summary for ${dateStr}</b>\n\n`;
    message += `Hello <b>${customer.name}</b>,\n\n`;
    
    // Add deposit summary
    message += `<b>📥 USDT Received:</b> ${totalDeposits.toFixed(2)} USDT\n`;
    if (deposits.length > 0) {
      message += `<i>${deposits.length} deposit(s) from your wallet</i>\n\n`;
    } else {
      message += "<i>No deposits today</i>\n\n";
    }
    
    // Add P2P sell summary
    message += `<b>💰 Payments to your Revolut:</b> ${totalSells.toFixed(2)} USD\n`;
    if (p2pSells.length > 0) {
      message += `<i>${p2pSells.length} payment(s) to your account</i>\n\n`;
    } else {
      message += "<i>No payments today</i>\n\n";
    }
    
    // Add individual transaction details if there are any
    if (deposits.length > 0 || p2pSells.length > 0) {
      message += "<b>Transaction Details:</b>\n";
      
      // Add deposit details
      deposits.forEach((deposit, index) => {
        const time = new Date(deposit.time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        message += `${index+1}. ${time} - Received ${deposit.quantity.toFixed(2)} USDT\n`;
      });
      
      // Add a separator between deposits and sells
      if (deposits.length > 0 && p2pSells.length > 0) {
        message += "\n";
      }
      
      // Add P2P sell details
      p2pSells.forEach((sell, index) => {
        const time = new Date(sell.time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        message += `${deposits.length + index + 1}. ${time} - Paid ${sell.quoteQuantity.toFixed(2)} USD to your Revolut\n`;
      });
    }
    
    // Add footer
    message += "\nThank you for your business!";
    
    return message;
  }
}

module.exports = new TelegramService(); 