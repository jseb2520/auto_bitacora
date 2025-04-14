/**
 * @fileoverview Test utility for email parsing with real Gmail API and Google Sheets integration
 * @module utils/testEmailParser
 * 
 * Run this script with: node src/utils/testEmailParser.js
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const gmailService = require('../services/gmailService');
const googleSheetsService = require('../services/googleSheetsService');
const transactionService = require('../services/transactionService');
const authClient = require('../utils/authClient');
const EmailProcessingRecord = require('../models/emailProcessingRecord');
const emailCacheModule = require('../utils/emailCache');
// Create a testing-specific instance with file cache forced
const emailCache = emailCacheModule.createInstance({ forceFileCache: true });
const { logger } = require('../utils/logger');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Colombia timezone (UTC-5)
const TIMEZONE_OFFSET = -5; // Colombia (UTC-5)

// Main execution - run the tests
testWithRealEmails()
  .then(() => {
    console.log('Test completed successfully');
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });

/**
 * Test with real emails from Gmail API
 */
async function testWithRealEmails() {
  try {
    console.log('\n📧 Testing email retrieval and parsing with real emails from Gmail...');
    
    // Initialize authentication for both services
    await authClient.initialize();
    const auth = await authClient.getAuthClient();
    
    // Initialize Gmail
    const gmail = google.gmail({ version: 'v1', auth });
    
    // Initialize Google Sheets with the same auth
    const sheets = google.sheets({ version: 'v4', auth });
    googleSheetsService.sheets = sheets;
    googleSheetsService.auth = auth;
    
    // Clear old emails from cache (older than 30 days)
    const removedCount = await emailCache.clearOldEmails(30);
    if (removedCount > 0) {
      console.log(`Cleared ${removedCount} old emails from cache`);
    }
    
    // Fetch emails for the current day in Colombia timezone (UTC-5)
    const startOfDay = new Date();
    // Set to start of day in Colombia timezone
    startOfDay.setUTCHours(0 - TIMEZONE_OFFSET, 0, 0, 0);
    
    const endOfDay = new Date();
    // Set to end of day in Colombia timezone
    endOfDay.setUTCHours(23 - TIMEZONE_OFFSET, 59, 59, 999);
    
    console.log(`Searching for emails between: ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);
    
    // Remove the after/before filters that are causing issues with Gmail API
    // According to Gmail API docs, we need simpler query syntax
    const query = `from:donotreply@directmail.binance.com OR subject:[Binance]`;
    console.log(`\n🔍 Searching for Binance emails with query: ${query}`);
    
    // Get message list
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20
    });
    
    const messages = response.data.messages || [];
    console.log(`\n📬 Found ${messages.length} Binance emails in total`);
    
    if (messages.length === 0) {
      console.log('No emails found. Try adjusting the search query or date range.');
      return [];
    }
    
    // Filter messages to only those from today in Colombia timezone (UTC-5)
    const todayMessages = [];
    let skippedDueDateCount = 0;
    
    for (const message of messages) {
      // Get basic message data to check date
      const messageData = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'minimal'
      });
      
      const emailDate = new Date(parseInt(messageData.data.internalDate));
      
      // Check if email is from today in Colombia timezone
      if (emailDate >= startOfDay && emailDate <= endOfDay) {
        todayMessages.push(message);
      } else {
        skippedDueDateCount++;
      }
    }
    
    console.log(`\n📬 Filtered to ${todayMessages.length} emails from today (Colombia timezone)`);
    console.log(`🗓️ Skipped ${skippedDueDateCount} emails from other days`);
    
    if (todayMessages.length === 0) {
      console.log('No emails from today found.');
      return [];
    }
    
    // Fetch full message data for all messages from today
    const fullMessages = [];
    let skippedCount = 0;
    
    for (const message of todayMessages) {
      // Check if this email has already been processed
      const isProcessed = await emailCache.isProcessed(message.id);
      if (isProcessed) {
        console.log(`\n📨 Skipping already processed email ID: ${message.id}`);
        skippedCount++;
        continue;
      }
      
      console.log(`\n📨 Fetching email ID: ${message.id}`);
      
      // Get full message content
      const messageData = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      
      // Extract subject for logging
      const subjectHeader = messageData.data.payload.headers.find(
        header => header.name.toLowerCase() === 'subject'
      );
      const subject = subjectHeader ? subjectHeader.value : 'No Subject';
      console.log(`📑 Subject: ${subject}`);
      
      fullMessages.push(messageData.data);
    }
    
    console.log(`\n📊 Skipped ${skippedCount} already processed emails`);
    
    if (fullMessages.length === 0) {
      console.log('All emails have already been processed.');
      return [];
    }
    
    // Process the emails using the transaction service
    // Note: We're setting saveToDb=false since this is just a test
    // Setting syncToSheets=false because we'll handle it manually for better error handling
    const allTransactions = await transactionService.processBinanceEmails(fullMessages, false, false);
    
    console.log(`\n📊 Total transactions parsed: ${allTransactions.length}`);
    
    // Mark all processed emails as processed in cache
    for (const message of fullMessages) {
      const subjectHeader = message.payload.headers.find(
        header => header.name.toLowerCase() === 'subject'
      );
      const subject = subjectHeader ? subjectHeader.value : 'No Subject';
      
      // Store related transaction IDs if available
      const relatedTransactions = allTransactions.filter(tx => 
        tx.metadata && tx.metadata.messageId === message.id
      );
      
      const transactionIds = relatedTransactions.map(tx => tx.orderId || '');
      
      await emailCache.markProcessed(message.id, {
        subject,
        date: new Date(parseInt(message.internalDate)).toISOString(),
        transactionCount: relatedTransactions.length,
        transactionIds
      });
    }
    
    // Save results to a JSON file
    if (allTransactions.length > 0) {
      const resultsFile = path.join(process.cwd(), 'email-parsing-results.json');
      fs.writeFileSync(resultsFile, JSON.stringify(allTransactions, null, 2));
      console.log(`\n💾 Saved ${allTransactions.length} transactions to ${resultsFile}`);
      
      // Try to write to Google Sheets
      try {
        console.log('\n📝 Writing transaction data to Google Sheets...');
        
        // Get Sheets ID from environment
        const sheetId = process.env.GOOGLE_SHEETS_ID;
        console.log(`Using Google Sheet ID: ${sheetId}`);
        
        // Define headers - removed Customer, Title, Wallet Address, Payment Info, Price, Quote Quantity
        const headers = [
          'Date', 'Order ID', 'Platform', 'Transaction Type',
          'Symbol', 'Side', 'Type', 'Quantity',
          'Status', 'Time', 'Update Time', 'Source'
        ];
        
        // Get current sheet content to determine where to append
        const currentContent = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: 'Transactions!A:L'
        });
        
        const existingRows = currentContent.data.values || [];
        console.log(`Found ${existingRows.length > 0 ? existingRows.length - 1 : 0} existing rows of data in sheet`);
        
        // Find the next available row (rows.length is 0-indexed, but sheet is 1-indexed)
        const nextRow = Math.max(existingRows.length + 1, 2); // Start at row 2 at minimum (after headers)
        
        // If no headers exist or sheet is empty, add them
        if (existingRows.length === 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Transactions!A1:L1',
            valueInputOption: 'USER_ENTERED',
            resource: { 
              values: [headers] 
            },
          });
          console.log('Added headers to empty sheet');
        }
        
        // Transform transactions to sheet rows format - removed Customer, Title, Wallet Address, Payment Info, Price, Quote Quantity
        const rows = allTransactions.map(transaction => {
          // Get the received date from the message
          const messageId = transaction.metadata?.messageId;
          const relatedMessage = fullMessages.find(msg => msg.id === messageId);
          const emailReceivedDate = relatedMessage ? new Date(parseInt(relatedMessage.internalDate)) : new Date();
          
          // Adjust to Colombia timezone (UTC-5)
          const localDate = new Date(emailReceivedDate);
          
          return [
            localDate.toISOString().split('T')[0], // Date column (YYYY-MM-DD)
            transaction.orderId || '',
            transaction.platform || 'BINANCE',
            transaction.transactionType || 'OTHER',
            transaction.symbol || '',
            transaction.side || '',
            transaction.type || '',
            transaction.quantity || 0,
            transaction.status || 'COMPLETED',
            new Date(transaction.time).toISOString(),
            new Date().toISOString(),  // Update time
            transaction.sourceType || 'EMAIL'
          ];
        });
        
        // Append to the sheet at the next available row
        console.log(`Appending ${rows.length} transactions at row ${nextRow}`);
        const response = await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Transactions!A${nextRow}:L${nextRow + rows.length - 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: rows },
        });
        
        console.log('✅ Successfully wrote transaction data to Google Sheets');
      } catch (error) {
        console.error('❌ Error writing to Google Sheets:', error.message);
        console.log('📋 Continuing with local file only');
      }
    }
    
    console.log('\n✅ Email testing completed');
    return allTransactions;
  } catch (error) {
    console.error('❌ Error during email testing:', error);
    throw error;
  }
}

/**
 * Test with sample emails for offline testing
 * @returns {Promise<Array>} Array of transaction objects
 */
async function testWithSampleEmail() {
  try {
    console.log('\n📧 Running offline test with sample emails...');

    // Array to collect all transaction results
    const allTransactions = [];

    // Test different types of emails
    const paymentResults = await testSampleEmail('payment', '[Binance]Payment Transaction Detail - 2025-04-11 14:25:02 (UTC)');
    const withdrawalResults = await testSampleEmail('withdrawal', '[Binance] USDT Withdrawal Successful - 2025-04-11 23:33:07 (UTC)');
    const depositResults = await testSampleEmail('deposit', '[Binance] USDT Deposit Confirmed - 2025-04-11 21:18:16(UTC)');

    // Collect all successful results
    if (paymentResults) allTransactions.push(...paymentResults);
    if (withdrawalResults) allTransactions.push(...withdrawalResults);
    if (depositResults) allTransactions.push(...depositResults);

    // Save results to a JSON file
    if (allTransactions.length > 0) {
      const resultsFile = path.join(process.cwd(), 'email-parsing-results.json');
      fs.writeFileSync(resultsFile, JSON.stringify(allTransactions, null, 2));
      console.log(`\n💾 Saved ${allTransactions.length} transactions to ${resultsFile}`);
    }

    console.log('\n✅ Sample email testing completed');

    return allTransactions;
  } catch (error) {
    console.error('❌ Error during sample email testing:', error);
    throw error;
  }
}

/**
 * Test parsing with a specific email type and subject
 * @param {string} type - Type of email (payment, withdrawal, deposit)
 * @param {string} subject - Subject line for the email
 * @returns {Array|null} - Array of parsed transactions or null if parsing failed
 */
async function testSampleEmail(type, subject) {
  console.log(`\n📧 Testing ${type} email parsing...`);

  // Create sample email content
  let emailContent = '';
  let expectedAmount = 0;
  let expectedSymbol = 'USDT';

  switch (type) {
    case 'payment':
      emailContent = `
Payment Transaction Detail
You made the following payment:
Time: 2025-04-11 14:25:02(UTC)
Amount: 768.87 USDT
      `;
      expectedAmount = 768.87;
      break;
    case 'withdrawal':
      emailContent = `
USDT Withdrawal Successful
You've successfully withdrawn 628.6200000 USDT from your account.
Withdrawal Address: 0x0cD2CB36963e9D13d8Bf805d21c66AD96C30cFAE
Transaction ID: 0x4b2a44384d6ab6641b093cc2df32b017a2552e5307069a2b4eaa896fa86624d7
      `;
      expectedAmount = 628.62;
      break;
    case 'deposit':
      emailContent = `
USDT Deposit Successful
Your deposit of 10000 USDT is now available in your Binance account. Log in to check your balance. Read our FAQs if you are running into problems.
      `;
      expectedAmount = 10000.00;
      break;
  }

  // Extract transaction details directly
  const emailDate = new Date();
  const transactions = gmailService.extractTransactionDetails(emailContent, subject, emailDate);

  if (transactions && transactions.length > 0) {
    console.log('✅ Successfully extracted transaction details:');

    // Simplified output
    const tx = transactions[0];
    console.log({
      transactionType: tx.transactionType,
      symbol: tx.symbol,
      amount: tx.quantity,
      time: tx.time
    });

    // Verify the results
    if (tx.symbol === expectedSymbol && Math.abs(tx.quantity - expectedAmount) < 0.01) {
      console.log('✅ Transaction data matches expected values');
      return transactions;
    } else {
      console.error('❌ Transaction data does not match expected values:');
      console.error(`  Expected: ${expectedSymbol}, ${expectedAmount}`);
      console.error(`  Got: ${tx.symbol}, ${tx.quantity}`);
      return null;
    }
  } else {
    console.error('❌ Failed to extract transaction details');

    // Try direct parsing for debugging
    console.log('Attempting direct parsing...');
    let directResults = null;

    switch (type) {
      case 'payment':
        directResults = gmailService.parsePaymentEmail(emailContent, subject, emailDate);
        break;
      case 'withdrawal':
        directResults = gmailService.parseWithdrawalEmail(emailContent, emailDate);
        break;
      case 'deposit':
        directResults = gmailService.parseDepositEmail(emailContent, emailDate);
        break;
    }

    if (directResults && directResults.length > 0) {
      console.log('✅ Direct parsing succeeded:', directResults[0].transactionType);
      return directResults;
    } else {
      console.error('❌ Direct parsing also failed');
      return null;
    }
  }
} 