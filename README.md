# Auto Bitacora

A Node.js microservice that fetches cryptocurrency transactions from multiple platforms (Binance, Revolut, and Kraken) for the current day, stores them in MongoDB, and syncs them to Google Sheets. The service also provides webhook endpoints for real-time updates from all supported platforms.

## Features

- Daily fetching of cryptocurrency transactions from multiple platforms:
  - Binance
  - Revolut
  - Kraken
- Persistent storage in MongoDB
- Synchronization with Google Sheets
- Webhook endpoints for real-time transaction updates
- Scheduled tasks using node-cron

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Google Cloud Platform account with Google Sheets API enabled
- Accounts with API credentials for one or more of:
  - Binance
  - Revolut
  - Kraken

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd auto_bitacora
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/auto_bitacora

# Binance API Credentials
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret

# Revolut API Credentials
REVOLUT_API_KEY=your_revolut_api_key
REVOLUT_API_SECRET=your_revolut_api_secret
REVOLUT_CLIENT_ID=your_revolut_client_id

# Kraken API Credentials
KRAKEN_API_KEY=your_kraken_api_key
KRAKEN_API_SECRET=your_kraken_api_secret

# Google Sheets API
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_SHEETS_ID=your_google_sheet_id
```

4. Set up Google Sheets API:
   - Create a project in Google Cloud Platform
   - Enable Google Sheets API
   - Create a service account and download the credentials as `credentials.json`
   - Place the `credentials.json` file in the root directory
   - Share your Google Sheet with the service account email

## Google Sheet Setup

Your Google Sheet should have a sheet named "Transactions" with the following columns:
1. Order ID
2. Platform (BINANCE, REVOLUT, or KRAKEN)
3. Symbol
4. Side
5. Type
6. Price
7. Quantity
8. Quote Quantity
9. Status
10. Time
11. Update Time

## Usage

### Development Mode

```bash
npm run dev
```

This will start the service with nodemon for automatic reloading on file changes.

### Production Mode

```bash
npm start
```

### Testing

```bash
npm test
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns the status of the service.

### Webhooks for Transaction Updates
```
POST /api/webhook/binance
POST /api/webhook/revolut
POST /api/webhook/kraken
```
Endpoints for receiving transaction updates from respective platforms.

## Scheduled Tasks

- **Daily Transaction Fetch**: Runs at midnight UTC every day to fetch all transactions for the current day from all configured platforms.

## Webhook Configuration

### Binance Webhook Setup
1. Log in to your Binance account
2. Navigate to API Management
3. Set up a webhook with the URL of your deployed service (e.g., `https://your-service.com/api/webhook/binance`)
4. Configure the webhook to listen for order updates

### Revolut Webhook Setup
1. Log in to your Revolut Business account
2. Go to Developer Settings
3. Create a new webhook with the URL of your deployed service (e.g., `https://your-service.com/api/webhook/revolut`)
4. Select "Transactions" as the event type

### Kraken Webhook Setup
1. Log in to your Kraken account
2. Go to Settings > API
3. Set up a webhook with the URL of your deployed service (e.g., `https://your-service.com/api/webhook/kraken`)
4. Configure the webhook to listen for order updates

## Architecture

The service follows a modular architecture with clear separation of concerns:

- **Config**: Environment configuration
- **Controllers**: Request handlers
- **Models**: Data models
- **Routes**: API routes
- **Services**: Business logic
- **Utils**: Utility functions and helpers

## Project Structure

```
auto_bitacora/
├── src/
│   ├── config/
│   │   └── index.js
│   ├── controllers/
│   │   ├── webhookController.js
│   │   ├── revolutWebhookController.js
│   │   └── krakenWebhookController.js
│   ├── models/
│   │   └── transaction.js
│   ├── routes/
│   │   └── index.js
│   ├── services/
│   │   ├── binanceService.js
│   │   ├── revolutService.js
│   │   ├── krakenService.js
│   │   ├── googleSheetsService.js
│   │   └── transactionService.js
│   ├── utils/
│   │   ├── database.js
│   │   └── scheduler.js
│   └── index.js
├── .env
├── .gitignore
├── package.json
├── credentials.json
└── README.md
```

## License

This project is licensed under the ISC License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

# Binance Email Transaction Logger

Automatically log Binance cryptocurrency transactions from Gmail emails to Google Sheets.

## Features
- Automatically retrieves Binance transaction emails from Gmail
- Parses transaction details from email content
- Logs transactions to Google Sheets
- Optionally stores transactions in MongoDB (main application only)
- Prevents duplicate email processing with caching mechanism
- Supports multiple transaction types:
  - Deposits
  - Withdrawals
  - Payment Transactions

## Prerequisites
- Node.js installed
- Gmail account with Binance transaction emails
- Google Cloud Project with Gmail and Google Sheets APIs enabled
- OAuth credentials (token.json) for Gmail API
- Google Sheets ID (in .env file)
- MongoDB (optional, for main app)

## Setup
1. Clone the repository
2. Install dependencies with `npm install`
3. Set up environment variables in `.env`:
```
GOOGLE_SHEETS_ID=your_google_sheet_id
MONGO_URI=your_mongodb_connection_string  # Optional for main app
```
4. Ensure OAuth credentials are set up in `token.json`

## Scripts

### Email Parser Test
Test script to retrieve and parse real Binance transaction emails:
```
npm run test-email-parser
```
This script:
1. Connects to Gmail using OAuth
2. Searches for Binance-related emails
3. Skips already processed emails using local cache
4. Parses transaction details from the emails
5. Saves results to a local JSON file
6. Writes data to Google Sheets

### Sample Email Test
Test the email parsing functionality with sample email content:
```
npm run test-sample-emails
```
This script tests the parsing logic with sample emails that match the format of real Binance emails.

### Email Cache Management
Manage the local email cache to prevent duplicate processing:
```
# Show cache status and statistics
npm run email-cache

# Remove emails older than 7 days
npm run email-cache -- 7

# Clear entire cache (creates a backup first)
npm run email-cache -- all
```

### Main Application
Run the main application which includes database storage:
```
npm start
```

## Duplicate Prevention

The application implements two methods to prevent duplicate email processing:

### 1. For the Test Script
- Uses a local JSON file (`email-cache.json`) to track processed emails
- Automatically skips emails that have already been processed
- Stores metadata about processed emails including transaction IDs
- Includes automatic cleanup of old cache entries

### 2. For the Main Application
- Uses MongoDB to track processed emails through the `EmailProcessingRecord` model
- Records message IDs, processing status, and related transaction IDs
- Prevents duplicate processing of the same email
- Maintains a history of all processed emails

## Transaction Types Supported
1. **Deposits** - Funds added to your Binance account
2. **Withdrawals** - Funds withdrawn from your Binance account
3. **Payment Transactions** - P2P payments made through Binance

## Code Structure
- `src/services` - Core services for API communication
- `src/utils` - Utility functions and test scripts
  - `emailCache.js` - Local caching for test script
- `src/models` - Database models for MongoDB
  - `emailProcessingRecord.js` - Schema for tracking processed emails
- `src/controllers` - Request handlers
- `src/routes` - API routes
- `src/middleware` - Express middleware

## Testing
Run the test scripts to verify functionality:
```
# Test with real emails (requires OAuth setup)
npm run test-email-parser

# Test with sample emails (offline testing)
npm run test-sample-emails
```

## Contributing
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License
MIT 