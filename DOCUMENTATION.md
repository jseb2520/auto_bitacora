# Auto Bitacora - Technical Documentation

## Project Overview

Auto Bitacora is a Node.js microservice designed to fetch and store cryptocurrency transactions from multiple platforms (Binance, Revolut, and Kraken). It uses MongoDB for persistent storage and Google Sheets for data visualization and reporting. The service also includes webhook endpoints for real-time transaction updates from each platform.

## Architecture

The service follows a modular architecture with clear separation of concerns, making it maintainable and extensible:

### Core Components

1. **API Layer**: Express.js server with route definitions
2. **Service Layer**: Business logic handling for each platform
3. **Data Layer**: MongoDB models and persistence
4. **Integration Layer**: Google Sheets integration
5. **Scheduler**: Cron jobs for periodic tasks

### Workflow

1. **Scheduled Data Fetch**:
   - A daily cron job runs at midnight UTC
   - The service fetches all transactions from all configured platforms for the current day
   - Only completed transactions are stored in MongoDB
   - Unsynced transactions are synchronized with Google Sheets

2. **Real-time Updates**:
   - Each platform sends transaction updates to its respective webhook endpoint
   - The service validates the webhook signature
   - Only completed transactions are stored in MongoDB
   - New transactions are immediately synced to Google Sheets

## Module Details

### Config (`src/config/index.js`)

A centralized configuration module that loads environment variables from the `.env` file and provides a structured interface for accessing them throughout the application.

```javascript
// Exported configuration object
const config = {
  server: { port, env },
  mongodb: { uri },
  binance: { apiKey, apiSecret },
  revolut: { apiKey, apiSecret, clientId },
  kraken: { apiKey, apiSecret },
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

Defines the MongoDB schema for storing cryptocurrency transactions from all platforms.

```javascript
// Schema definition with proper types and validation
const transactionSchema = new mongoose.Schema({
  orderId, platform, symbol, side, type, price,
  quantity, quoteQuantity, status,
  time, updateTime, isWorking, isSynced,
});

// Compound index for orderId and platform to ensure uniqueness
transactionSchema.index({ orderId: 1, platform: 1 }, { unique: true });
```

### Platform Services

#### Binance Service (`src/services/binanceService.js`)

Handles communication with the Binance API, including authentication, request signing, and data fetching.

```javascript
// Main method to fetch today's transactions
async fetchTodayTransactions() {
  // Calculate start of day
  // Make authenticated request to Binance API
  // Process and return transaction data
}
```

#### Revolut Service (`src/services/revolutService.js`)

Handles communication with the Revolut API, including authentication, request signing, and data fetching.

```javascript
// Main method to fetch today's transactions
async fetchTodayTransactions() {
  // Calculate start of day
  // Make authenticated request to Revolut API
  // Map to common transaction format
  // Process and return transaction data
}
```

#### Kraken Service (`src/services/krakenService.js`)

Handles communication with the Kraken API, including authentication, request signing, and data fetching.

```javascript
// Main method to fetch today's transactions
async fetchTodayTransactions() {
  // Calculate start of day
  // Make authenticated request to Kraken API
  // Map to common transaction format
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

Coordinates the business logic for fetching, storing, and syncing transactions from all platforms.

```javascript
// Main methods
async fetchAndStoreTransactions() { /* Fetch from all platforms */ }
async fetchBinanceTransactions() { /* Fetch from Binance */ }
async fetchRevolutTransactions() { /* Fetch from Revolut */ }
async fetchKrakenTransactions() { /* Fetch from Kraken */ }
async saveTransactionsToDatabase(transactions) { /* Save completed transactions */ }
async syncTransactionsToGoogleSheets() { /* Sync to Google Sheets */ }
async processWebhookTransaction(transactionData) { /* Process webhook data */ }
```

### Webhook Controllers

#### Binance Webhook Controller (`src/controllers/webhookController.js`)

Handles incoming webhook requests from Binance, validates signatures, and processes transaction updates.

```javascript
// Main webhook handler
const handleWebhook = async (req, res) => {
  // Validate request signature
  // Extract transaction data
  // Add platform identifier
  // Process the transaction
  // Return appropriate response
};
```

#### Revolut Webhook Controller (`src/controllers/revolutWebhookController.js`)

Handles incoming webhook requests from Revolut, validates signatures, and processes transaction updates.

```javascript
// Main webhook handler
const handleWebhook = async (req, res) => {
  // Validate request signature
  // Extract transaction data
  // Map to common format
  // Process the transaction
  // Return appropriate response
};
```

#### Kraken Webhook Controller (`src/controllers/krakenWebhookController.js`)

Handles incoming webhook requests from Kraken, validates signatures, and processes transaction updates.

```javascript
// Main webhook handler
const handleWebhook = async (req, res) => {
  // Validate request signature
  // Extract transaction data
  // Map to common format
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
   - All platform API keys stored securely in environment variables
   - HMAC signature generation for authenticated requests
   - Different authentication methods for each platform

2. **Webhook Validation**:
   - Signature validation for incoming webhook requests from all platforms
   - Rejection of requests with invalid signatures
   - Platform-specific signature validation

3. **Google Sheets Authentication**:
   - Service account credentials with limited permissions
   - JWT authentication for Google API requests

## Extensibility

The modular architecture allows for easy extension:

1. **Additional Platforms**:
   - New platform services can be added following the same pattern
   - The transaction service can integrate with new platform services
   - New webhook controllers can be added for additional platforms

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
   - Platform-specific logging for troubleshooting

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