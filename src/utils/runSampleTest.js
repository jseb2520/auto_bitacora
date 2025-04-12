/**
 * @fileoverview Simple script to test email parsing with sample content without requiring API access
 * @module utils/runSampleTest
 * 
 * Run this script with: node src/utils/runSampleTest.js
 */

const fs = require('fs');
const path = require('path');
const gmailService = require('../services/gmailService');
const { logger, createModuleLogger } = require('../utils/logger');

// Create a logger for this module
const moduleLogger = createModuleLogger('sampleTest');

/**
 * Main function to run sample tests
 */
async function runSampleTests() {
  try {
    console.log('🧪 Running sample email tests for Binance transaction parsing');
    
    // Define sample emails based on what we've seen in screenshots
    const samples = [
      {
        type: 'deposit',
        subject: '[Binance] USDT Deposit Confirmed - 2025-04-11 21:18:16(UTC)',
        content: `
USDT Deposit Successful
Your deposit of 10000 USDT is now available in your Binance account. Log in to check your balance. Read our FAQs if you are running into problems.
        `,
        expected: {
          type: 'DEPOSIT',
          symbol: 'USDT',
          amount: 10000
        }
      },
      {
        type: 'withdrawal',
        subject: '[Binance] USDT Withdrawal Successful - 2025-04-11 23:33:07 (UTC)',
        content: `
USDT Withdrawal Successful
You've successfully withdrawn 628.6200000 USDT from your account.
Withdrawal Address: 0x0cD2CB36963e9D13d8Bf805d21c66AD96C30cFAE
Transaction ID: 0x4b2a44384d6ab6641b093cc2df32b017a2552e5307069a2b4eaa896fa86624d7
        `,
        expected: {
          type: 'WITHDRAWAL',
          symbol: 'USDT',
          amount: 628.62
        }
      },
      {
        type: 'payment',
        subject: '[Binance]Payment Transaction Detail - 2025-04-11 15:22:35 (UTC)',
        content: `
Payment Transaction Detail
You made the following payment:
Time: 2025-04-11 15:22:35(UTC)
Amount: 650.25 USDT
        `,
        expected: {
          type: 'PAYMENT',
          symbol: 'USDT',
          amount: 650.25
        }
      }
    ];
    
    // Process each sample
    const results = [];
    
    for (const sample of samples) {
      console.log(`\n📧 Testing ${sample.type} email:`);
      console.log(`Subject: ${sample.subject}`);
      
      const emailDate = new Date();
      const transactions = gmailService.extractTransactionDetails(sample.content, sample.subject, emailDate);
      
      if (!transactions || transactions.length === 0) {
        console.log(`❌ Failed to parse ${sample.type} email`);
        
        // Try direct parsing methods
        let directResult = null;
        switch (sample.type) {
          case 'deposit':
            directResult = gmailService.parseDepositEmail(sample.content, emailDate);
            break;
          case 'withdrawal':
            directResult = gmailService.parseWithdrawalEmail(sample.content, emailDate);
            break;
          case 'payment':
            directResult = gmailService.parsePaymentEmail(sample.content, sample.subject, emailDate);
            break;
        }
        
        if (directResult && directResult.length > 0) {
          console.log('✅ Direct parsing succeeded:');
          console.log(directResult[0]);
          results.push({
            type: sample.type,
            subject: sample.subject,
            result: directResult[0],
            success: true,
            method: 'direct'
          });
        } else {
          console.log('❌ All parsing methods failed');
          results.push({
            type: sample.type,
            subject: sample.subject,
            success: false
          });
        }
      } else {
        const transaction = transactions[0];
        console.log('✅ Successfully parsed:');
        console.log({
          transactionType: transaction.transactionType,
          symbol: transaction.symbol,
          amount: transaction.quantity
        });
        
        // Verify against expected values
        const success = 
          transaction.transactionType === sample.expected.type &&
          transaction.symbol === sample.expected.symbol &&
          Math.abs(transaction.quantity - sample.expected.amount) < 0.01;
        
        if (success) {
          console.log('✓ Results match expected values');
        } else {
          console.log('✗ Results do not match expected values:');
          console.log(`Expected: ${sample.expected.type}, ${sample.expected.symbol}, ${sample.expected.amount}`);
          console.log(`Actual: ${transaction.transactionType}, ${transaction.symbol}, ${transaction.quantity}`);
        }
        
        results.push({
          type: sample.type,
          subject: sample.subject,
          result: transaction,
          success,
          method: 'standard'
        });
      }
    }
    
    // Output summary
    console.log('\n📊 Test Summary:');
    const successCount = results.filter(r => r.success).length;
    console.log(`${successCount} of ${samples.length} tests passed`);
    
    // Save results to file
    const resultsFile = path.join(process.cwd(), 'sample-test-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved test results to ${resultsFile}`);
    
    return { success: successCount === samples.length, results };
  } catch (error) {
    console.error('❌ Error running sample tests:', error);
    return { success: false, error: error.message };
  }
}

// Run the tests
runSampleTests()
  .then(result => {
    if (result.success) {
      console.log('✅ All tests passed successfully');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Uncaught error running tests:', error);
    process.exit(1);
  }); 