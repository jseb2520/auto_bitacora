/**
 * @fileoverview Utility script to clean the email cache
 * @module utils/cleanEmailCache
 * 
 * Run this script with:
 * - node src/utils/cleanEmailCache.js all         # Cleans all cached emails
 * - node src/utils/cleanEmailCache.js 7           # Cleans emails older than 7 days
 */

const fs = require('fs');
const path = require('path');
const emailCache = require('./emailCache');

// Get command line arguments
const args = process.argv.slice(2);
const action = args[0] || 'status';

// Function to format date to readable string
function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

// Main execution function
async function run() {
  try {
    // Process based on command
    switch(action) {
      case 'all':
        // Clean all emails from cache
        console.log('Cleaning all emails from cache...');
        
        // For file-based cache only, create a backup first
        if (!emailCache.isProduction) {
          const backupPath = path.join(process.cwd(), 'email-cache-backup.json');
          fs.writeFileSync(backupPath, JSON.stringify(emailCache.cache, null, 2));
          console.log(`Created backup at ${backupPath}`);
          
          // Reset the cache
          emailCache.cache = { processedEmails: {}, lastUpdated: new Date().toISOString() };
          emailCache.saveCache();
          console.log('File-based email cache cleared. Backup created before clearing.');
        } else {
          // For database cache, delete all records
          try {
            await emailCache.EmailProcessingRecord.deleteMany({});
            console.log('Database email cache cleared.');
          } catch (error) {
            console.error(`Error clearing database cache: ${error.message}`);
          }
        }
        break;
        
      case 'status':
        // Show cache statistics
        const emailIds = await emailCache.getAllProcessedEmailIds();
        console.log(`Email cache contains ${emailIds.length} emails.`);
        
        if (!emailCache.isProduction) {
          console.log(`Last updated: ${formatDate(emailCache.cache.lastUpdated)}`);
        }
        
        // Group by age
        let last24h = 0;
        let last7d = 0;
        let last30d = 0;
        let older = 0;
        
        const now = new Date();
        const oneDayAgo = new Date(now); oneDayAgo.setDate(now.getDate() - 1);
        const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
        const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
        
        for (const id of emailIds) {
          const info = await emailCache.getEmailInfo(id);
          if (!info) continue;
          
          const processedAt = new Date(info.processedAt);
          
          if (processedAt > oneDayAgo) {
            last24h++;
          } else if (processedAt > sevenDaysAgo) {
            last7d++;
          } else if (processedAt > thirtyDaysAgo) {
            last30d++;
          } else {
            older++;
          }
        }
        
        console.log('\nEmails by age:');
        console.log(`- Last 24 hours: ${last24h}`);
        console.log(`- Last 7 days (excluding last 24h): ${last7d}`);
        console.log(`- Last 30 days (excluding last 7d): ${last30d}`);
        console.log(`- Older than 30 days: ${older}`);
        
        // Show a few sample entries
        if (emailIds.length > 0) {
          console.log('\nSample entries:');
          for (let i = 0; i < Math.min(3, emailIds.length); i++) {
            const id = emailIds[i];
            const info = await emailCache.getEmailInfo(id);
            if (info) {
              console.log(`- ${id.substring(0, 8)}... (${formatDate(info.processedAt)}): ${info.subject || 'No subject'}`);
            }
          }
        }
        break;
        
      default:
        // Try to parse as a number of days
        const days = parseInt(action, 10);
        if (!isNaN(days) && days > 0) {
          console.log(`Cleaning emails older than ${days} days...`);
          const removedCount = await emailCache.clearOldEmails(days);
          console.log(`Cleaned ${removedCount} emails from cache.`);
        } else {
          console.log('Invalid command. Usage:');
          console.log('- node src/utils/cleanEmailCache.js all         # Cleans all cached emails');
          console.log('- node src/utils/cleanEmailCache.js 7           # Cleans emails older than 7 days');
          console.log('- node src/utils/cleanEmailCache.js             # Shows cache status');
        }
        break;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the async function
run(); 