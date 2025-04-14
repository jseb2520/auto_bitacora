# Auto Bitacora

A Node.js microservice that automatically logs cryptocurrency transactions from Binance by processing transaction emails received in Gmail. The service stores transactions in MongoDB and syncs them to Google Sheets for easy tracking and reporting.

## Features

- Automatic email processing:
  - Fetches Binance transaction emails from Gmail
  - Parses transaction details from email content
  - Supports multiple transaction types (deposits, withdrawals, payments, trades, P2P)
- Persistent storage in MongoDB
- Synchronization with Google Sheets
- Scheduled daily processing at 7PM Colombia time (UTC-5)
- Webhook endpoints for real-time transaction updates
- Duplicate prevention with EmailCache

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Google Cloud Platform account with Gmail API and Google Sheets API enabled
- Gmail account with Binance transaction emails
- Google OAuth credentials (for Gmail API access)

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

# Google API Configuration
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
GOOGLE_SHEETS_ID=your_google_sheet_id

# Optional: API credentials for direct API access (secondary method)
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
```

4. Set up Google API access:
   - Create a project in Google Cloud Platform
   - Enable Gmail API and Google Sheets API
   - Create OAuth credentials and download as `credentials.json`
   - Run the token generation utility: `npm run generate-token`
   - Share your Google Sheet with your Google account

## Google Sheet Setup

Your Google Sheet should have a sheet named "Transactions" with the following columns:
1. Date
2. Order ID
3. Platform
4. Transaction Type
5. Symbol
6. Side
7. Type
8. Quantity
9. Status
10. Time
11. Update Time
12. Source

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

### Email Parser Testing

To test the email parsing functionality:

```bash
# Test with real emails from your Gmail account
npm run test-email-parser

# Test with sample emails (offline testing)
npm run test-sample-emails
```

### Email Cache Management

To manage the email cache (for development/testing):

```bash
# Show cache status
npm run email-cache

# Clear emails older than 30 days
npm run email-cache 30

# Clear all emails (creates backup first)
npm run email-cache all
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
```
Endpoint for receiving transaction updates from Binance platform.

## Scheduled Tasks

- **Daily Email Processing**: Runs at 7:00 PM Colombia time (UTC-5) every day to fetch and process Binance transaction emails for the current day.

## How It Works

### Email Processing Flow

1. The scheduler triggers email processing at 7:00 PM Colombia time (UTC-5)
2. The system uses Gmail API to fetch Binance emails received during the current day
3. For each email, the system:
   - Checks if it's already been processed (to prevent duplicates)
   - Identifies the transaction type based on subject and content
   - Extracts transaction details using specialized parsers
   - Saves the transaction to MongoDB
   - Marks the email as processed in the EmailCache
4. After processing all emails, transactions are synced to Google Sheets

### Email Parsing Logic

The system supports parsing various types of Binance emails:

1. **Deposits** - "USDT Deposit Confirmed"
2. **Withdrawals** - "USDT Withdrawal Successful"
3. **P2P Trades** - "P2P order completed"
4. **Regular Trades** - "Order Filled"
5. **Payments** - "Payment Transaction Detail"

### Duplicate Prevention

To prevent processing the same email twice:
- In production, the system uses MongoDB to track processed emails
- In development/testing, a local JSON file is used
- Each email is tracked by its unique message ID
- Old entries are automatically cleaned up to prevent cache growth

## Architecture

The service follows a modular architecture with clear separation of concerns:

- **Config**: Environment configuration
- **Models**: Data models for MongoDB
- **Services**: Business logic for email processing, parsing, and integration
- **Utils**: Utility functions including EmailCache and logging
- **Scheduler**: Cron job for daily email processing

## Project Structure

```
auto_bitacora/
├── src/
│   ├── config/
│   │   └── index.js
│   ├── models/
│   │   ├── transaction.js
│   │   └── emailProcessingRecord.js
│   ├── services/
│   │   ├── gmailService.js
│   │   ├── googleSheetsService.js
│   │   └── transactionService.js
│   ├── utils/
│   │   ├── authClient.js
│   │   ├── database.js
│   │   ├── emailCache.js
│   │   └── logger.js
│   ├── scheduler.js
│   └── index.js
├── docs/
│   ├── DOCUMENTATION.md
│   └── gmail_integration.md
├── .env
├── credentials.json
├── token.json
├── package.json
└── README.md
```

## Documentation

For more detailed documentation, see:

- [Technical Documentation](docs/DOCUMENTATION.md)
- [Gmail Integration Guide](docs/gmail_integration.md)

## Troubleshooting

### Common Issues

1. **Authentication Problems:**
   - Ensure credentials.json is correctly configured
   - Check that your token.json contains a refresh_token field
   - Try regenerating the token with `npm run generate-token`

2. **Email Parsing Issues:**
   - Check the logs for parsing errors
   - You may need to update regex patterns if Binance changes their email format
   - Test with `npm run test-email-parser`

3. **No Emails Found:**
   - Verify the email query is correct
   - Check if emails are arriving in your Gmail account
   - Ensure the date range is correctly set for Colombia timezone (UTC-5)

4. **MongoDB Connection:**
   - Verify your MongoDB connection string
   - Ensure MongoDB is running and accessible

### Viewing Logs

The system uses detailed logging to help with troubleshooting:

```bash
# View all logs
cat logs/combined.log

# View error logs
cat logs/error.log
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License. 