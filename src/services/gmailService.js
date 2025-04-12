/**
 * @fileoverview Service for fetching and processing Gmail emails from Binance
 * @module services/gmailService
 */

const { google } = require('googleapis');
const authClient = require('../utils/authClient');
const EmailProcessingRecord = require('../models/emailProcessingRecord');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('gmailService');

/**
 * Gmail service for fetching and processing Binance transaction emails
 */
class GmailService {
  constructor() {
    this.gmail = null;
    this.initialized = false;
    this.binanceEmailAddresses = [
      'do_not_reply@mgdirectmail.binance.com',
      'no-reply@binance.com',
      'no_reply@binance.com'
    ];
  }

  /**
   * Initialize and authenticate the Gmail client
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const auth = await this.authenticateWithSavedCredentials();
      if (!auth) {
        moduleLogger.error('Failed to authenticate Gmail client');
        return;
      }
      
      this.gmail = google.gmail({ version: 'v1', auth });
      moduleLogger.info('Gmail service initialized');
    } catch (error) {
      moduleLogger.error('Failed to initialize Gmail service', { error: error.message });
    }
  }

  /**
   * Check if the email is from Binance
   * @param {Object} email - The email message object
   * @returns {boolean} - Whether the email is from Binance
   */
  isFromBinance(email) {
    try {
      const fromHeader = email.payload.headers.find(
        (header) => header.name.toLowerCase() === 'from'
      );

      if (!fromHeader) {
        return false;
      }

      const from = fromHeader.value.toLowerCase();
      
      // List of known Binance sender domains and emails
      const binanceDomains = [
        '@binance.com',
        '@binancemail.com',
        '@info.binance.com',
        '@binance-mail.com',
        '@email.binance.com',
        '@binance.zendesk.com',
        '@dmail.binance.com',
        '@mgdirectmail.binance.com'
      ];
      
      // Check if the email is directly from a Binance domain
      const isDirectlyFromBinance = binanceDomains.some(domain => from.includes(domain));
      
      if (isDirectlyFromBinance) {
        return true;
      }
      
      // Check if this might be a forwarded email
      const body = this.getEmailBody(email);
      if (!body) {
        return false;
      }
      
      // Look for forwarded email marker
      if (body.includes('---------- Forwarded message ---------')) {
        // Extract original sender from forwarded message
        const forwardedFromRegex = /From:\s*.*?[<\s]([^>@\s]+@[^>@\s]+)[>\s]/i;
        const forwardedFromMatch = body.match(forwardedFromRegex);
        
        if (forwardedFromMatch) {
          const originalSender = forwardedFromMatch[1].toLowerCase();
          return binanceDomains.some(domain => originalSender.includes(domain));
        }
      }
      
      return false;
    } catch (error) {
      moduleLogger.error('Error checking if email is from Binance', { 
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Check if the email is a transaction email
   * @param {Object} email - The email message object
   * @returns {boolean} - Whether the email is a transaction email
   */
  isTransactionEmail(email) {
    try {
      const subjectHeader = email.payload.headers.find(
        (header) => header.name.toLowerCase() === 'subject'
      );

      if (!subjectHeader) {
        return false;
      }

      let subject = subjectHeader.value;
      
      // Handle forwarded email subjects
      if (subject.toLowerCase().startsWith('fwd:') || subject.toLowerCase().startsWith('fw:')) {
        subject = subject.replace(/^(fwd:|fw:)\s*/i, '').trim();
      }
      
      const lowerCaseSubject = subject.toLowerCase();
      
      // Check for transaction related keywords in the normalized subject
      return (
        lowerCaseSubject.includes('transaction') ||
        lowerCaseSubject.includes('deposit') ||
        lowerCaseSubject.includes('withdrawal') ||
        lowerCaseSubject.includes('order') ||
        lowerCaseSubject.includes('complete') ||
        lowerCaseSubject.includes('payment') ||
        lowerCaseSubject.includes('trade')
      );
    } catch (error) {
      moduleLogger.error('Error checking if email is a transaction email', { 
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Fetch Binance transaction emails for the current day
   * @returns {Promise<Array>} Array of processed transaction objects
   */
  async fetchTodayBinanceEmails() {
    try {
      await this.initialize();
      
      // Get today's date range
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      // Convert to RFC 3339 format for Gmail API
      const after = startOfDay.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const before = endOfDay.toISOString().replace(/\.\d{3}Z$/, 'Z');
      
      moduleLogger.info(`Fetching Binance emails from ${after} to ${before}`);
      
      // Create search query for Gmail API with all potential Binance email addresses
      const fromQueries = this.binanceEmailAddresses.map(email => `from:${email}`).join(' OR ');
      const query = `(${fromQueries}) after:${after} before:${before}`;
      
      moduleLogger.debug(`Using Gmail query: ${query}`);
      
      // Fetch message list
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100
      });
      
      const messages = response.data.messages || [];
      moduleLogger.info(`Found ${messages.length} Binance emails for today`);
      
      // Process each message
      const processedTransactions = [];
      
      for (const message of messages) {
        try {
          // Check if we already processed this message
          const existingRecord = await EmailProcessingRecord.findOne({ messageId: message.id });
          
          if (existingRecord) {
            moduleLogger.debug(`Skipping already processed email: ${message.id}`);
            continue;
          }
          
          // Fetch and process the message
          const transactions = await this.processEmail(message.id);
          
          if (transactions && transactions.length > 0) {
            processedTransactions.push(...transactions);
          }
        } catch (err) {
          moduleLogger.error(`Error processing email ${message.id}:`, err);
          // Record the failure but continue processing other emails
          await EmailProcessingRecord.create({
            messageId: message.id,
            emailDate: new Date(), // We don't have the exact date without fetching the email
            status: 'FAILED',
            errorMessage: err.message
          });
        }
      }
      
      moduleLogger.info(`Successfully processed ${processedTransactions.length} transactions from ${messages.length} emails`);
      return processedTransactions;
    } catch (error) {
      moduleLogger.error('Failed to fetch Binance emails', { 
        error: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status
      });
      throw error;
    }
  }

  /**
   * Process a single email and extract transaction details
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<Array>} Array of transaction objects
   */
  async processEmail(messageId) {
    try {
      moduleLogger.debug(`Processing email: ${messageId}`);
      
      // Fetch the full message
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });
      
      // Check if it's a Binance email 
      if (!this.isFromBinance(message.data)) {
        moduleLogger.debug(`Skipping non-Binance email: ${messageId}`);
        
        // Record that we looked at this email but ignored it
        await EmailProcessingRecord.create({
          messageId: messageId,
          emailDate: new Date(),
          status: 'IGNORED',
          errorMessage: 'Not a Binance email'
        });
        
        return [];
      }
      
      // Extract email headers
      const headers = message.data.payload.headers;
      const subject = headers.find(header => header.name === 'Subject')?.value || '';
      const from = headers.find(header => header.name === 'From')?.value || '';
      const date = headers.find(header => header.name === 'Date')?.value || '';
      const emailDate = new Date(date);
      
      moduleLogger.debug(`Email details: Subject="${subject}", Date=${emailDate.toISOString()}`);
      
      // Only process transaction-related emails
      if (!this.isTransactionEmail(message.data)) {
        moduleLogger.debug(`Skipping non-transaction email: "${subject}"`);
        
        // Record that we looked at this email but ignored it
        await EmailProcessingRecord.create({
          messageId: messageId,
          emailDate: emailDate,
          subject: subject,
          from: from,
          status: 'IGNORED'
        });
        
        return [];
      }
      
      // Extract email body
      const body = this.getEmailBody(message.data.payload);
      
      // Extract transaction details from the email
      const transactions = this.extractTransactionDetails(body, subject, emailDate);
      
      // If no transactions found, log and return empty array
      if (!transactions || transactions.length === 0) {
        moduleLogger.debug(`No transaction details found in email: "${subject}"`);
        
        await EmailProcessingRecord.create({
          messageId: messageId,
          emailDate: emailDate,
          subject: subject,
          from: from,
          status: 'IGNORED',
          errorMessage: 'No transaction details found'
        });
        
        return [];
      }
      
      // Record the successful processing
      const transactionIds = transactions.map(tx => tx.orderId);
      
      await EmailProcessingRecord.create({
        messageId: messageId,
        emailDate: emailDate,
        subject: subject,
        from: from,
        status: 'PROCESSED',
        transactionIds: transactionIds
      });
      
      moduleLogger.info(`Extracted ${transactions.length} transactions from email: "${subject}"`);
      return transactions;
    } catch (error) {
      moduleLogger.error(`Failed to process email ${messageId}`, { 
        error: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status
      });
      throw error;
    }
  }

  /**
   * Extract email body text from the message payload
   * @param {Object} payload - Gmail message payload
   * @returns {string} Email body text
   */
  getEmailBody(payload) {
    let body = '';
    
    // Handle different email formats
    if (payload.mimeType === 'text/plain') {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.mimeType === 'text/html') {
      // Convert HTML to plain text (simple version)
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8')
        .replace(/<[^>]*>/g, ' '); // Strip HTML tags
    } else if (payload.parts && payload.parts.length) {
      // Find the plain text part
      const textPart = payload.parts.find(part => part.mimeType === 'text/plain');
      
      if (textPart && textPart.body && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      } else {
        // Try HTML part
        const htmlPart = payload.parts.find(part => part.mimeType === 'text/html');
        
        if (htmlPart && htmlPart.body && htmlPart.body.data) {
          body = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8')
            .replace(/<[^>]*>/g, ' '); // Strip HTML tags
        }
      }
    }
    
    return body;
  }

  /**
   * Extract transaction details from email content
   * @param {string} body - Email body text
   * @param {string} subject - Email subject
   * @param {Date} emailDate - Email date
   * @returns {Array} Array of transaction objects
   */
  extractTransactionDetails(body, subject, emailDate) {
    try {
      // Check for and handle forwarded emails
      const isForwarded = subject.toLowerCase().startsWith('fwd:') || subject.toLowerCase().startsWith('fw:');
      const normalizedSubject = isForwarded ? subject.replace(/^(fwd:|fw:)\s*/i, '').trim() : subject;
      
      // If forwarded email, try to extract original content
      let normalizedBody = body;
      if (isForwarded && body.includes('---------- Forwarded message ---------')) {
        const originalEmailSubjectMatch = body.match(/Subject:\s*([^\n]+)/i);
        if (originalEmailSubjectMatch) {
          // If we can extract the original subject, use it for classification
          const originalSubject = originalEmailSubjectMatch[1].trim();
          moduleLogger.debug('Found original subject in forwarded email', { originalSubject });
        }
        
        // Focus on the content after the forwarded message header
        const messageBodyParts = body.split('---------- Forwarded message ---------');
        if (messageBodyParts.length > 1) {
          normalizedBody = messageBodyParts[1]; // Use the content after the forwarded marker
        }
      }
      
      // Determine transaction type based on normalized subject
      let transactionType = 'OTHER';
      let side = '';
      
      // Extract common details from subject pattern "[Binance] TYPE - DATE" 
      const subjectPattern = /\[Binance\]\s*([A-Za-z\s]+)(?:\s*-\s*|\s+)(.*)/i;
      const subjectMatch = normalizedSubject.match(subjectPattern);
      
      // Use more specific patterns for different transaction types
      if (/USDT Deposit Confirmed/i.test(normalizedSubject)) {
        transactionType = 'DEPOSIT';
        side = 'BUY'; // Deposits are considered buys
      } else if (/USDT Withdrawal Successful/i.test(normalizedSubject)) {
        transactionType = 'WITHDRAWAL';
        side = 'SELL'; // Withdrawals are considered sells
      } else if (/P2P order completed/i.test(normalizedSubject)) {
        transactionType = 'P2P_SELL';
        side = 'SELL';
      } else if (/Order Filled/i.test(normalizedSubject)) {
        transactionType = 'TRADE';
        // Need to determine if it's a buy or sell from the email body
        side = /sold/i.test(normalizedBody) ? 'SELL' : 'BUY';
      } else if (/Payment Transaction Detail/i.test(normalizedSubject)) {
        transactionType = 'PAYMENT';
        side = 'SELL'; // Payments are typically outgoing (sell)
      } else {
        // Try more generic pattern matching for less common formats
        if (subjectMatch) {
          const transactionDesc = subjectMatch[1].trim().toLowerCase();
          
          if (transactionDesc.includes('deposit')) {
            transactionType = 'DEPOSIT';
            side = 'BUY';
          } else if (transactionDesc.includes('withdrawal')) {
            transactionType = 'WITHDRAWAL';
            side = 'SELL';
          } else if (transactionDesc.includes('payment')) {
            transactionType = 'PAYMENT';
            side = 'SELL';
          } else if (transactionDesc.includes('order') || transactionDesc.includes('trade')) {
            transactionType = 'TRADE';
            side = /sold/i.test(normalizedBody) ? 'SELL' : 'BUY';
          }
        }
      }
      
      moduleLogger.debug(`Identified transaction type: ${transactionType}`, { subject: normalizedSubject });
      
      // Different parsing logic based on transaction type
      switch (transactionType) {
        case 'DEPOSIT':
          return this.parseDepositEmail(normalizedBody, emailDate);
        case 'WITHDRAWAL':
          return this.parseWithdrawalEmail(normalizedBody, emailDate);
        case 'P2P_SELL':
          return this.parseP2PEmail(normalizedBody, emailDate);
        case 'TRADE':
          return this.parseTradeEmail(normalizedBody, emailDate, side);
        case 'PAYMENT':
          return this.parsePaymentEmail(normalizedBody, normalizedSubject, emailDate);
        default:
          // If we couldn't determine the type from the subject, try based on body content
          if (normalizedBody.includes('deposit') && normalizedBody.includes('completed')) {
            return this.parseDepositEmail(normalizedBody, emailDate);
          } else if (normalizedBody.includes('withdrawal') && (normalizedBody.includes('completed') || normalizedBody.includes('successful'))) {
            return this.parseWithdrawalEmail(normalizedBody, emailDate);
          } else if (normalizedBody.includes('payment') && normalizedBody.includes('transaction')) {
            return this.parsePaymentEmail(normalizedBody, normalizedSubject, emailDate);
          }
          
          moduleLogger.debug('Could not determine transaction type', { subject: normalizedSubject });
          return [];
      }
    } catch (error) {
      moduleLogger.error('Failed to extract transaction details', { 
        error: error.message,
        stack: error.stack,
        subject: subject
      });
      return [];
    }
  }

  /**
   * Parse a deposit email to extract transaction details
   * @param {string} body - Email body
   * @param {Date} emailDate - Email date
   * @returns {Array} Array of transaction objects
   */
  parseDepositEmail(body, emailDate) {
    try {
      moduleLogger.debug('Parsing deposit email');
      
      // Try to match deposit amount and currency with various patterns
      const patterns = [
        // Standard format: "Your deposit of 10.5 BTC has been credited"
        /deposit of ([0-9,]+\.?\d*)\s*([A-Z]{2,10})/i,
        
        // Alternative format: "10.5 BTC has been deposited"
        /([0-9,]+\.?\d*)\s*([A-Z]{2,10})\s+has been deposited/i,
        
        // Simple format: "Your deposit of 10000 USDT is now available"
        /deposit of ([0-9,]+\.?\d*)\s*([A-Z]{2,10})\s+is now available/i,
        
        // Alternative with trailing zeros: "deposit of 100.00000000 USDT"
        /deposit of ([0-9,]+\.\d+)\s*([A-Z]{2,10})/i,
        
        // Match just the number after "deposit of" if currency is in subject
        /deposit of ([0-9,]+)\s+/i,
        
        // Match "Amount: 1000.00 USDT" format
        /Amount:\s*([0-9,]+\.?\d*)\s*([A-Z]{2,10})/i
      ];
      
      let quantity;
      let currency;
      
      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match) {
          quantity = match[1].replace(/,/g, '');
          currency = match[2];
          
          // If we have a pattern that doesn't capture currency, 
          // try to extract from email text or subject
          if (!currency) {
            // Look for currency in the body near the amount
            const currencyMatch = body.match(/\b(USDT|BTC|ETH|BNB|BUSD)\b/i);
            if (currencyMatch) {
              currency = currencyMatch[1].toUpperCase();
            }
          }
          
          moduleLogger.debug(`Found deposit amount with pattern: ${pattern}`);
          break;
        }
      }
      
      if (!quantity || isNaN(parseFloat(quantity))) {
        moduleLogger.warn('Could not parse deposit amount and currency');
        return null;
      }
      
      if (!currency) {
        moduleLogger.warn('Could not determine currency, using USDT as default');
        currency = 'USDT';
      }
      
      const transaction = {
        transactionType: 'DEPOSIT',
        orderId: `DEP${Date.now()}`,
        platform: 'BINANCE',
        status: 'COMPLETED',
        symbol: currency,
        quantity: parseFloat(quantity),
        price: 1,
        side: 'BUY',
        time: emailDate.getTime(),
        updateTime: emailDate.getTime(),
        sourceType: 'EMAIL'
      };
      
      moduleLogger.info('Successfully parsed deposit email');
      
      return [transaction];
    } catch (error) {
      moduleLogger.error('Failed to parse deposit email', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Parse a withdrawal email to extract transaction details
   * @param {string} body - Email body
   * @param {Date} emailDate - Email date
   * @returns {Array} Array of transaction objects
   */
  parseWithdrawalEmail(body, emailDate) {
    try {
      moduleLogger.debug('Parsing withdrawal email');
      
      // Try multiple patterns for amount extraction
      const patterns = [
        // Standard pattern for withdrawal amount
        /withdrawn\s+([0-9,]+\.\d+)\s*([A-Z]{2,10})/i,
        
        // Alternative format
        /Withdrawal Amount:[\s\n]*([0-9,]+\.\d+)\s*([A-Z]{2,10})/i,
        
        // Simple format
        /([0-9,]+\.\d+)\s*([A-Z]{2,10})\s+has been withdrawn/i
      ];
      
      let amountMatch = null;
      
      for (const pattern of patterns) {
        amountMatch = body.match(pattern);
        if (amountMatch) {
          moduleLogger.debug(`Found withdrawal amount with pattern: ${pattern}`);
          break;
        }
      }
      
      if (!amountMatch) {
        moduleLogger.warn('Could not parse withdrawal amount');
        return null;
      }
      
      const quantity = parseFloat(amountMatch[1].replace(/,/g, ''));
      const symbol = amountMatch[2];
      
      // Extract transaction ID/hash if present
      const txIdMatch = body.match(/Transaction ID:?\s*([a-zA-Z0-9-]+)/i) || 
                       body.match(/TxID:?\s*([a-zA-Z0-9-]+)/i) ||
                       body.match(/Transaction ID:?\s*(0x[a-fA-F0-9]+)/i) ||
                       body.match(/Hash:?\s*([a-zA-Z0-9-]+)/i);
      
      // Extract wallet address if present
      const addressMatch = 
        body.match(/Withdrawal Address:?\s*(0x[a-fA-F0-9]+)/i) ||
        body.match(/Withdrawal Address:?\s*([a-zA-Z0-9]{24,})/i) || 
        body.match(/Receiving Address:?\s*([a-zA-Z0-9]{24,})/i) || 
        body.match(/Address:?\s*([a-zA-Z0-9]{24,})/i) ||
        body.match(/to:?\s*([a-zA-Z0-9]{24,})/i);
      
      const walletAddress = addressMatch ? addressMatch[1] : '';
      const txId = txIdMatch ? txIdMatch[1] : '';
      
      const transaction = {
        transactionType: 'WITHDRAWAL',
        orderId: txId || `WD${Date.now()}`,
        platform: 'BINANCE',
        status: 'COMPLETED',
        symbol: symbol,
        quantity: quantity,
        price: 1,
        side: 'SELL',
        time: emailDate.getTime(),
        updateTime: emailDate.getTime(),
        walletAddress: walletAddress,
        sourceType: 'EMAIL'
      };
      
      moduleLogger.info('Successfully parsed withdrawal email');
      
      return [transaction];
    } catch (error) {
      moduleLogger.error('Failed to parse withdrawal email', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Parse P2P trade email content
   * @param {string} body - Email body text
   * @param {Date} emailDate - Email date
   * @returns {Array} Array containing a P2P transaction object
   */
  parseP2PEmail(body, emailDate) {
    try {
      // Extract crypto amount
      const cryptoMatch = body.match(/(\d+(\.\d+)?)\s*([A-Z]{2,10})/);
      
      // Extract fiat amount
      const fiatMatch = body.match(/(\d+(\.\d+)?)\s*(USD|EUR|GBP|ARS)/i);
      
      if (!cryptoMatch || !fiatMatch) {
        moduleLogger.warn('Could not parse P2P amounts');
        return [];
      }
      
      const quantity = parseFloat(cryptoMatch[1]);
      const symbol = cryptoMatch[3];
      const quoteQuantity = parseFloat(fiatMatch[1]);
      const fiatCurrency = fiatMatch[3].toUpperCase();
      
      // Calculate price
      const price = quoteQuantity / quantity;
      
      // Extract payment method if present
      const paymentMethodMatch = body.match(/payment method:?\s*([a-zA-Z]+)/i);
      const paymentMethod = paymentMethodMatch ? paymentMethodMatch[1] : '';
      
      // Generate a unique order ID
      const orderId = `p2p-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return [{
        orderId: orderId,
        platform: 'BINANCE',
        transactionType: 'P2P_SELL',
        symbol: symbol,
        side: 'SELL',
        type: 'P2P',
        price: price,
        quantity: quantity,
        quoteQuantity: quoteQuantity,
        status: 'COMPLETED',
        time: emailDate,
        updateTime: emailDate,
        paymentDetails: {
          method: paymentMethod,
          currency: fiatCurrency
        },
        sourceType: 'GMAIL'
      }];
    } catch (error) {
      moduleLogger.error('Failed to parse P2P email', { 
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Parse trade email content
   * @param {string} body - Email body text
   * @param {Date} emailDate - Email date
   * @param {string} side - Trade side (BUY or SELL)
   * @returns {Array} Array containing a trade transaction object
   */
  parseTradeEmail(body, emailDate, side) {
    try {
      // Extract quantity and symbol
      const quantityMatch = body.match(/(\d+(\.\d+)?)\s*([A-Z]{2,10})/);
      
      if (!quantityMatch) {
        moduleLogger.warn('Could not parse trade quantity and symbol');
        return [];
      }
      
      const quantity = parseFloat(quantityMatch[1]);
      const symbol = quantityMatch[3];
      
      // Extract price if present
      const priceMatch = body.match(/price:?\s*(\d+(\.\d+)?)/i) || 
                       body.match(/at:?\s*(\d+(\.\d+)?)/i);
      
      const price = priceMatch ? parseFloat(priceMatch[1]) : 1;
      
      // Calculate quote quantity
      const quoteQuantity = price * quantity;
      
      // Generate a unique order ID
      const orderId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return [{
        orderId: orderId,
        platform: 'BINANCE',
        transactionType: 'TRADE',
        symbol: symbol,
        side: side,
        type: 'MARKET',
        price: price,
        quantity: quantity,
        quoteQuantity: quoteQuantity,
        status: 'FILLED',
        time: emailDate,
        updateTime: emailDate,
        sourceType: 'GMAIL'
      }];
    } catch (error) {
      moduleLogger.error('Failed to parse trade email', { 
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Parse payment transaction emails from Binance
   * @param {string} body - Email body text
   * @param {string} subject - Email subject
   * @param {Date} emailDate - Email date
   * @returns {Array} - Array of parsed transaction objects or empty array
   */
  parsePaymentEmail(body, subject, emailDate) {
    try {
      moduleLogger.debug('Parsing payment transaction email', { subject });
      
      // Handle forwarded emails by normalizing the subject
      if (subject.toLowerCase().startsWith('fwd:') || subject.toLowerCase().startsWith('fw:')) {
        subject = subject.replace(/^(fwd:|fw:)\s*/i, '').trim();
      }

      // Extract the title from the subject
      const titleRegex = /\[Binance\](.*?)(?:\s*-\s*|$)/;
      const titleMatch = subject.match(titleRegex);
      const title = titleMatch ? titleMatch[1].trim() : 'Payment Transaction Detail';

      if (!title.includes('Payment Transaction Detail')) {
        moduleLogger.debug('Not a payment transaction email', { subject });
        return [];
      }

      // Parse timestamp from subject or use email timestamp as fallback
      let timestamp;
      const timestampRegex = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
      const timestampMatch = subject.match(timestampRegex);
      
      if (timestampMatch) {
        timestamp = new Date(timestampMatch[1] + 'Z'); // Assuming UTC
      } else {
        // Fallback to email date
        timestamp = emailDate;
      }

      // Extract amount and currency - try multiple patterns in sequence
      let amountMatch = null;
      
      // Array of patterns to try
      const patterns = [
        // Standard amount format with label
        /Amount:[\s\n]*([0-9,]+\.\d+)\s*([A-Z]+)/i,
        
        // Multi-line format with Amount: label
        /Amount:\s*[\r\n]+([0-9,]+\.\d+)\s*([A-Z]+)/i,
        
        // Format with time and amount on separate lines
        /Time:[\s\n]*.*?[\s\n]+([0-9,]+\.\d+)\s*([A-Z]{3,5})/is,
        
        // "for X.XX USDT" format
        /for\s+([0-9,]+\.\d+)\s*([A-Z]{3,5})/i,
        
        // "of X.XX USDT" format (common in deposit emails)
        /of\s+([0-9,]+\.\d+)\s*([A-Z]{3,5})/i,
        
        // Has been sent/paid format
        /([0-9,]+\.\d+)\s*([A-Z]{3,5})\s*(?:has been sent|paid)/i,
        
        // Most general pattern - any number followed by currency code
        /([0-9,]+\.\d+)\s*([A-Z]{3,5})/i
      ];
      
      // Try each pattern until we find a match
      for (const pattern of patterns) {
        amountMatch = body.match(pattern);
        if (amountMatch) {
          moduleLogger.debug(`Found amount with pattern: ${pattern}`, { 
            match: amountMatch[0]
          });
          break;
        }
      }
      
      if (!amountMatch) {
        moduleLogger.warn('Could not parse amount and currency from payment email', { 
          bodyPreview: body.substring(0, 200) 
        });
        return [];
      }
      
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const currency = amountMatch[2];

      // Extract or generate transaction ID
      const txIdRegex = /(?:Order|Transaction)\s*(?:No|ID|Number)?\.?:\s*([A-Za-z0-9-]+)/i;
      const txIdMatch = body.match(txIdRegex);
      
      // Generate a unique ID if no transaction ID found
      const orderId = txIdMatch ? txIdMatch[1] : 
        `binance-payment-${timestamp.getTime()}-${Math.random().toString(36).substring(2, 10)}`;

      moduleLogger.info('Successfully parsed payment email', { 
        title, 
        timestamp: timestamp.toISOString(), 
        amount, 
        currency,
        orderId
      });

      return [{
        orderId,
        platform: 'BINANCE',
        transactionType: 'PAYMENT',
        symbol: currency,
        quantity: amount,
        side: 'SELL',  // Payments are typically outgoing
        type: 'PAYMENT',
        status: 'COMPLETED',
        time: timestamp,
        updateTime: timestamp,
        price: null,
        quoteQuantity: amount,
        sourceType: 'GMAIL',
        paymentDetails: {
          currency: currency,
          method: 'BINANCE_PAY'
        }
      }];
    } catch (error) {
      moduleLogger.error('Error parsing payment email', { 
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }
}

// Export a singleton instance
module.exports = new GmailService(); 