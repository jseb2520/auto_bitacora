# Auto Bitacora - Technical Documentation

## Project Overview

Auto Bitacora is a Node.js microservice designed to fetch and store Binance transactions from the current day. It uses MongoDB for persistent storage and Google Sheets for data visualization and reporting. The service also includes a webhook endpoint for real-time transaction updates from Binance.

## Architecture

The service follows a modular architecture with clear separation of concerns, making it maintainable and extensible:

### Core Components

1. **API Layer**: Express.js server with route definitions
2. **Service Layer**: Business logic handling
3. **Data Layer**: MongoDB models and persistence
4. **Integration Layer**: Google Sheets integration
5. **Scheduler**: Cron jobs for periodic tasks

### Workflow

1. **Scheduled Data Fetch**:
   - A daily cron job runs at midnight UTC
   - The service fetches all transactions from Binance for the current day
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

### Binance Service (`src/services/binanceService.js`)

Handles communication with the Binance API, including authentication, request signing, and data fetching.

```javascript
// Main method to fetch today's transactions
async fetchTodayTransactions() {
  // Calculate start of day
  // Make authenticated request to Binance API
  // Process and return transaction data
}
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
async saveTransactionsToDatabase(transactions) { /* ... */ }
async syncTransactionsToGoogleSheets() { /* ... */ }
async processWebhookTransaction(transactionData) { /* ... */ }
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

### Scheduler (`src/utils/scheduler.js`)

Manages scheduled tasks using node-cron.

```javascript
// Initialize scheduled tasks
initTasks() {
  // Schedule the daily transaction fetch
  // Schedule other tasks as needed
}
```

### Main Application (`src/index.js`)

The entry point that orchestrates the entire application.

```javascript
// Express app initialization
// Middleware setup
// Route registration
// Database connection
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
   - Service account credentials with limited permissions
   - JWT authentication for Google API requests

## Extensibility

The modular architecture allows for easy extension:

1. **Additional Data Sources**:
   - New services can be added for other exchanges
   - The transaction model can be extended to accommodate different data formats

2. **Additional Integrations**:
   - New services can be added for other reporting tools
   - The transaction service can be extended to handle additional synchronization needs

3. **Additional Scheduled Tasks**:
   - The scheduler can be extended to include more cron jobs
   - Existing services can be leveraged for new periodic tasks

## Error Handling and Logging

1. **Graceful Error Handling**:
   - Try/catch blocks for async operations
   - Specific error messages for different failure scenarios
   - Global error handler for unhandled exceptions

2. **Logging**:
   - Detailed logs for debugging and monitoring
   - Timestamp information for tracking operation sequence
   - Error-specific logging for troubleshooting

## Testing

The project structure supports different types of tests:

1. **Unit Tests**:
   - Testing individual functions and methods
   - Mocking external dependencies

2. **Integration Tests**:
   - Testing interactions between modules
   - Testing database operations

3. **End-to-End Tests**:
   - Testing the complete workflow
   - Testing API endpoints

## Deployment Considerations

1. **Environment Variables**:
   - Sensitive information stored in environment variables
   - Default values provided for non-sensitive configuration

2. **Database Connection**:
   - Connection string configurable via environment variables
   - Reconnection logic for handling temporary disconnections

3. **Port Configuration**:
   - Server port configurable via environment variables
   - Default port provided for local development

4. **Graceful Shutdown**:
   - Signal handler for cleaning up resources
   - Stopping scheduled tasks before exit 