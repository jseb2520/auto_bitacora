# Auto Bitacora - Technical Documentation

## Project Overview

Auto Bitacora is a Node.js microservice designed to fetch and store Binance transactions. It primarily uses Gmail API to retrieve transaction emails, parse them using specialized algorithms, and then store the transactions in MongoDB and Google Sheets for visualization and reporting. The service also includes webhook endpoints for real-time transaction updates.

## Architecture

The service follows a modular architecture with clear separation of concerns, making it maintainable and extensible:

### Core Components

1. **API Layer**: Express.js server with route definitions
2. **Service Layer**: Business logic handling
3. **Data Layer**: MongoDB models and persistence
4. **Integration Layer**: Google Sheets integration
5. **Scheduler**: Cron jobs for periodic tasks
6. **Email Processing**: Gmail API integration and email parsing

### Workflow

1. **Scheduled Email Processing**:
   - A daily cron job runs at 7PM Colombia time (UTC-5)
   - The service fetches transaction emails from Binance received during the current day
   - Emails are parsed to extract transaction details
   - Transactions are stored in MongoDB
   - Unsynced transactions are synchronized with Google Sheets

2. **Real-time Updates**:
   - Binance sends transaction updates to the webhook endpoint
   - The service validates the webhook signature
   - New transactions are stored in MongoDB
   - Transactions are immediately synced to Google Sheets

## Module Details

### Config (`src/config/index.js`)

A centralized configuration module that loads environment variables from the `.env` file and provides a structured interface for accessing them throughout the application.

```javascript
// Exported configuration object
const config = {
  server: { port, env },
  mongodb: { uri },
  binance: { apiKey, apiSecret },
  googleSheets: { credentialsPath, sheetId },
};
```

### Database Utility (`src/utils/database.js`)

Handles MongoDB connection with error handling and automatic reconnection logic.

```javascript
// Main function to establish database connection
const connectDatabase = async () => {
  // Connection logic with error handling and reconnection
};
```

### Transaction Model (`src/models/transaction.js`)

Defines the MongoDB schema for storing Binance transactions.

```javascript
// Schema definition with proper types and validation
const transactionSchema = new mongoose.Schema({
  orderId, symbol, side, type, price,
  quantity, quoteQuantity, status,
  time, updateTime, isWorking, isSynced,
});
```

### Email Processing Record Model (`src/models/emailProcessingRecord.js`)

Defines the MongoDB schema for tracking processed emails to prevent duplicate processing.

```javascript
// Schema for email processing records
const emailProcessingRecordSchema = new mongoose.Schema({
  messageId, processedAt, emailDate, subject, 
  status, errorMessage, transactionCount, 
  transactionIds, metadata
});
```

### Gmail Service (`src/services/gmailService.js`)

Handles fetching emails from Gmail API, authenticating, and parsing transaction details from email content.

```javascript
// Main methods
async initialize() { /* Authentication logic */ }
async fetchTodayBinanceEmails() { /* Fetch emails from today */ }
async processEmail(messageId) { /* Process a single email */ }
extractTransactionDetails(body, subject, emailDate) { /* Parse transaction details */ }
parseDepositEmail(body, emailDate) { /* Parse deposit emails */ }
parseWithdrawalEmail(body, emailDate) { /* Parse withdrawal emails */ }
parseP2PEmail(body, emailDate) { /* Parse P2P trade emails */ }
parseTradeEmail(body, emailDate, side) { /* Parse trade emails */ }
parsePaymentEmail(body, subject, emailDate) { /* Parse payment emails */ }
```

### Email Cache (`src/utils/emailCache.js`)

Manages caching of processed emails to prevent duplicate processing. Can use either database storage (production) or file-based storage (development).

```javascript
// Main methods
async isProcessed(messageId) { /* Check if an email has been processed */ }
async markProcessed(messageId, metadata) { /* Mark an email as processed */ }
async clearOldEmails(days) { /* Remove old emails from cache */ }
```

### Google Sheets Service (`src/services/googleSheetsService.js`)

Manages authentication and interaction with the Google Sheets API for writing transaction data.

```javascript
// Main method to write transactions to Google Sheets
async writeTransactions(transactions) {
  // Transform transactions to sheet format
  // Append data to the specified Google Sheet
  // Return response from the API
}
```

### Transaction Service (`src/services/transactionService.js`)

Coordinates the business logic for fetching, storing, and syncing transactions.

```javascript
// Main methods
async fetchAndStoreTransactions() { /* ... */ }
async fetchGmailBinanceTransactions() { /* Fetch from Gmail API */ }
async saveTransactionsToDatabase(transactions) { /* ... */ }
async syncTransactionsToGoogleSheets() { /* ... */ }
async processBinanceEmails(messages, saveToDb, syncToSheets) { /* Process emails */ }
```

### Webhook Controller (`src/controllers/webhookController.js`)

Handles incoming webhook requests, validates signatures, and processes transaction updates.

```javascript
// Main webhook handler
const handleWebhook = async (req, res) => {
  // Validate request signature
  // Extract transaction data
  // Process the transaction
  // Return appropriate response
};
```

### Scheduler (`src/scheduler.js`)

Manages scheduled tasks using cron jobs.

```javascript
// Initialize scheduled tasks
function initializeScheduler() {
  // Two scheduled jobs:
  
  // 1. Schedule email processing at 3:30 PM Colombia time (8:30 PM UTC)
  const afternoonJob = new CronJob(
    '30 20 * * *',  // 8:30 PM UTC
    () => jobFunction('afternoon'),
    null,
    false,
    'UTC'
  );
  
  // 2. Schedule email processing at 7:00 PM Colombia time (12:00 AM UTC)
  const eveningJob = new CronJob(
    '0 0 * * *',  // 12:00 AM UTC
    () => jobFunction('evening'),
    null,
    false,
    'UTC'
  );
  
  // 3. Monitoring job to check for missed scheduled runs
  const monitoringJob = new CronJob(
    '0 * * * *',  // Every hour
    checkForMissedJobs,
    null,
    false,
    'UTC'
  );
  
  // Start all jobs with robust error handling
}

// Job function that runs at scheduled times
async function jobFunction(jobType) {
  // Process today's Binance emails
  // Sync unsynced transactions to Google Sheets
  // Track job execution history
  // Send alerts on failures
}

// Monitoring function that checks for missed jobs
async function checkForMissedJobs() {
  // Check if scheduled jobs were missed
  // Send alert emails for missed jobs
  // Update job statistics
}
```

#### New Features

1. **Multiple daily processing times**: Runs at both 3:30 PM and 7:00 PM Colombia time
2. **Job monitoring**: Detects missed jobs and sends email alerts
3. **API endpoints**: Control and diagnostic endpoints to manage scheduler
4. **Error resilience**: Multiple layers of error handling to prevent crashes
5. **Email alerts**: Automatic notifications for errors and missed jobs

See [SCHEDULER_UPDATE.md](./SCHEDULER_UPDATE.md) for detailed documentation on recent scheduler enhancements.

### Main Application (`src/index.js`)

The entry point that orchestrates the entire application.

```javascript
// Express app initialization
// Middleware setup
// Route registration
// Database connection
// Email cache initialization
// Server startup
// Scheduled tasks initialization
// Graceful shutdown handling
```

## Security Considerations

1. **API Authentication**:
   - Binance API keys stored securely in environment variables
   - HMAC SHA256 signature generation for authenticated requests

2. **Webhook Validation**:
   - Signature validation for incoming webhook requests
   - Rejection of requests with invalid signatures

3. **Google Sheets Authentication**:
   - OAuth 2.0 authentication for Google API requests
   - Token refresh handling for long-term operation

4. **Email Processing Security**:
   - Duplicate prevention with EmailCache
   - Validation of email senders

## Extensibility

The modular architecture allows for easy extension:

1. **Additional Data Sources**:
   - New services can be added for other exchanges
   - The transaction model can be extended to accommodate different data formats

2. **Additional Integrations**:
   - New services can be added for other reporting tools
   - The transaction service can be extended to handle additional synchronization needs

3. **Additional Email Parsers**:
   - The gmailService can be extended with new parsers for different email formats
   - The existing parsers can be updated to handle changes in email templates

## Error Handling and Logging

1. **Graceful Error Handling**:
   - Try/catch blocks for async operations
   - Specific error messages for different failure scenarios
   - Global error handler for unhandled exceptions

2. **Logging**:
   - Detailed logs for debugging and monitoring
   - Transaction-specific logging for tracking processing flow
   - Email-specific logging for troubleshooting parsing issues

## Testing

The project includes testing utilities:

1. **Email Parser Testing**:
   - `testEmailParser.js` for testing with real emails
   - Sample email tests for offline testing
   - Cached results to prevent duplicate processing during testing

2. **Email Cache Testing**:
   - Tools for managing the email cache
   - Utilities for clearing old cache entries

## Deployment Considerations

1. **Environment Variables**:
   - Sensitive information stored in environment variables
   - Default values provided for non-sensitive configuration

2. **Database Connection**:
   - Connection string configurable via environment variables
   - Reconnection logic for handling temporary disconnections

3. **Email Processing Configuration**:
   - File-based cache for development
   - Database-based cache for production
   - Timezone configuration for Colombia (UTC-5)

4. **Graceful Shutdown**:
   - Signal handler for cleaning up resources
   - Timeout-based forced shutdown if graceful shutdown fails 