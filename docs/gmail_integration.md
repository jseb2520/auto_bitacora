# Gmail Integration for Binance Transaction Tracking

This document explains how to set up and use the Gmail-based approach for tracking Binance transactions.

## Overview

The system now uses Gmail API to fetch transaction emails from Binance, parse them, and record the transactions in MongoDB and Google Sheets. This approach replaces the previous API-based method.

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

1. The system runs every 2 hours from 8am to 10pm (configurable in the scheduler)
2. It fetches emails from Binance (no-reply@binance.com) received during the current day
3. For each email:
   - Checks if it's already been processed (using the EmailProcessingRecord collection)
   - Determines the transaction type from the subject and content
   - Parses transaction details using regex patterns
   - Creates transaction records in the standard format

### Supported Transaction Types

The system can parse the following types of Binance emails:

1. **Deposits** - Subject contains "Deposit Completed"
2. **Withdrawals** - Subject contains "Withdrawal Completed"
3. **P2P Trades** - Subject contains "P2P order completed"
4. **Regular Trades** - Subject contains "Order Filled"

### Duplicate Prevention

To prevent processing the same email twice:
- Each processed email is recorded in the `EmailProcessingRecord` collection
- Before processing an email, the system checks if it's already in this collection
- Each record includes the email ID, subject, date, and processing status

## OAuth Token Management

### Automatic Token Refresh

The system implements automatic token refresh to handle OAuth token expiration:

1. Access tokens typically expire after 1 hour
2. The system uses the refresh token to automatically obtain new access tokens
3. Token refresh happens transparently in the background without manual intervention
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

2. **Email Parsing Issues:**
   - Check the logs for parsing errors
   - You might need to update regex patterns if Binance changes their email format
   - See the EmailProcessingRecord collection for failed emails

3. **No Emails Found:**
   - Verify the email filter is correct
   - Check if emails are arriving in your Gmail account
   - Ensure the date range is correctly set

### Viewing Logs

The system uses detailed logging for troubleshooting:

```bash
# View all logs
cat logs/combined.log

# View error logs
cat logs/error.log

# Search for Gmail-related logs
grep -i "gmail" logs/combined.log

# Search for token-related logs
grep -i "token" logs/combined.log
```

## Maintenance

### Updating Email Parsing Logic

If Binance changes their email format, you'll need to update the parsing logic in `gmailService.js`. The main methods to review are:

- `parseDepositEmail()`
- `parseWithdrawalEmail()`
- `parseP2PEmail()`
- `parseTradeEmail()`

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
- The processing runs every 2 hours to stay well within limits
- Email data is cached in MongoDB to prevent duplicate processing
- Token refreshing is handled automatically without manual intervention 