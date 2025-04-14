# Gmail Integration for Binance Transaction Tracking

This document explains how to set up and use the Gmail-based approach for tracking Binance transactions.

## Overview

The system uses Gmail API to fetch transaction emails from Binance, parse them, and record the transactions in MongoDB and Google Sheets. This approach is the primary method for capturing transaction details.

## Setup Instructions

### 1. Enable Gmail API & Get Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Navigate to "APIs & Services" > "Library"
4. Enable both the Gmail API and Google Sheets API
5. Go to "APIs & Services" > "Credentials"
6. Click "Create Credentials" > "OAuth client ID"
7. Choose "Desktop Application" as the application type
8. Download the credentials.json file and place it in the root of your project

### 2. Generate OAuth Token

1. Run the token generation utility:
   ```bash
   npm run generate-token
   ```
2. A browser window will automatically open with the Google authorization flow
3. Select your Google account and grant the requested permissions
4. The browser will be redirected to a local server that captures the authorization code
5. The token.json file will be automatically created in your project root

### 3. Configure Environment Variables

Update your .env file to include:

```
# Google API Configuration
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
GOOGLE_SHEETS_ID=your_google_sheet_id
```

## How It Works

### Email Fetching Process

1. The system runs once per day at 7:00 PM Colombia time (UTC-5), configured in the scheduler
2. It fetches emails from Binance (including donotreply@directmail.binance.com and other Binance domains) received during the current day
3. For each email:
   - Checks if it's already been processed (using the EmailCache)
   - Determines the transaction type from the subject and content
   - Parses transaction details using specialized parsers for each type
   - Creates transaction records in the standard format
   - Marks the email as processed to prevent duplicate processing

### Supported Transaction Types

The system can parse the following types of Binance emails:

1. **Deposits** - Subject contains "USDT Deposit Confirmed"
2. **Withdrawals** - Subject contains "USDT Withdrawal Successful"
3. **P2P Trades** - Subject contains "P2P order completed"
4. **Regular Trades** - Subject contains "Order Filled"
5. **Payments** - Subject contains "Payment Transaction Detail"

### Email Processing Flow

The workflow for email processing is:

1. **Fetching**: Retrieve emails from Gmail using query filters
2. **Filtering**: Filter to only include emails from the current day (Colombia timezone)
3. **Deduplication**: Skip emails that have already been processed
4. **Parsing**: Extract transaction details based on email type
5. **Storage**: Save transactions to MongoDB
6. **Synchronization**: Write transactions to Google Sheets
7. **Caching**: Mark emails as processed to prevent future duplication

### Duplicate Prevention

To prevent processing the same email twice:
- Each processed email is recorded using the `EmailCache` utility
- In production mode, emails are recorded in the `EmailProcessingRecord` MongoDB collection
- In development/testing mode, emails are recorded in a local JSON file
- Each record includes the email ID, subject, date, and processing status
- Before processing an email, the system checks if it exists in the cache
- The cache can be configured to automatically clear old records after a certain period

## OAuth Token Management

### Automatic Token Refresh

The system implements automatic token refresh to handle OAuth token expiration:

1. Access tokens typically expire after 1 hour
2. The system uses the refresh token to automatically obtain new access tokens
3. Token refresh happens transparently in the background
4. Refreshed tokens are saved to the token.json file automatically

### For Deployment (Railway)

When deploying to Railway:

1. Generate the token locally first using `npm run generate-token`
2. Upload the token.json file to your Railway deployment
3. Set the environment variable `GOOGLE_TOKEN_PATH` to point to the token location
4. The automatic refresh mechanism will handle token expiration

### Handling Token Failures

If token refresh fails (rare, but possible):

1. Check the logs for "Failed to refresh token" errors
2. Regenerate the token locally using `npm run generate-token`
3. Upload the new token.json to your deployment
4. Restart the service

## Troubleshooting

### Common Issues

1. **Authentication Problems:**
   - Ensure credentials.json is correctly configured
   - Check that your token.json contains a refresh_token field
   - Verify the scopes include both Gmail and Sheets
   - Try regenerating the token if issues persist

2. **Email Parsing Issues:**
   - Check the logs for parsing errors
   - You might need to update regex patterns if Binance changes their email format
   - See the EmailProcessingRecord collection for failed emails

3. **No Emails Found:**
   - Verify the email filter is correct (current query: `from:donotreply@directmail.binance.com OR subject:[Binance]`)
   - Check if emails are arriving in your Gmail account
   - Ensure the date range is correctly set for Colombia timezone (UTC-5)

4. **Timezone Issues:**
   - The system uses Colombia timezone (UTC-5) for all date calculations
   - Check that server time is correctly configured
   - Verify that scheduler is running at the correct time

### Viewing Logs

The system uses detailed logging for troubleshooting:

```bash
# View all logs
cat logs/combined.log

# View error logs
cat logs/error.log

# Search for Gmail-related logs
grep -i "gmail" logs/combined.log

# Search for transaction-related logs
grep -i "transaction" logs/combined.log

# Search for token-related logs
grep -i "token" logs/combined.log
```

## Testing and Development

### Email Parser Testing

The system includes a test utility for the email parser:

```bash
# Test with real emails from your Gmail account
npm run test-email-parser

# Test with sample emails (offline testing)
npm run test-sample-emails
```

### Email Cache Management

For development and testing, you can manage the email cache:

```bash
# Show cache status
npm run email-cache

# Clear emails older than 30 days
npm run email-cache 30

# Clear all emails (creates backup first)
npm run email-cache all
```

## Maintenance

### Updating Email Parsing Logic

If Binance changes their email format, you'll need to update the parsing logic in `gmailService.js`. The main methods to review are:

- `extractTransactionDetails()` - Main logic for identifying transaction type
- `parseDepositEmail()` - For deposit confirmations
- `parseWithdrawalEmail()` - For withdrawal confirmations
- `parseP2PEmail()` - For P2P trade confirmations
- `parseTradeEmail()` - For trade executions
- `parsePaymentEmail()` - For payment transactions

### Token Renewal

OAuth tokens are automatically refreshed when they expire. However, in some rare cases (like if access is revoked), you may need to generate a new token:

1. Delete the existing token.json file
2. Run the token generation utility again:
   ```bash
   npm run generate-token
   ```
3. Update the token in your deployment environment

## Performance Considerations

- The Gmail API has rate limits (1,000 requests per day per user)
- The processing runs once per day to stay well within limits
- Email data is cached to prevent duplicate processing
- Token refreshing is handled automatically to maintain continuous access
- Colombia timezone (UTC-5) is used for all date calculations to ensure consistent processing 