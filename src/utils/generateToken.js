/**
 * @fileoverview Utility script to generate token.json for Google API access
 * @module utils/generateToken
 * 
 * Run this script with: node src/utils/generateToken.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const opener = require('opener');
const { google } = require('googleapis');

// Define scopes - include both Gmail and Sheets APIs
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets'
];

// Paths
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(process.cwd(), 'token.json');

// The port where the server will listen for OAuth2 callback
const PORT = 3000;

/**
 * Creates a local server to handle the OAuth redirect
 * @param {google.auth.OAuth2} oAuth2Client - The OAuth2 client
 * @returns {Promise<Object>} The tokens from OAuth flow
 */
function runLocalServer(oAuth2Client) {
  return new Promise((resolve, reject) => {
    // Create a local server to receive the callback
    const server = http.createServer(async (req, res) => {
      try {
        // Parse the URL and query parameters
        const parsedUrl = url.parse(req.url, true);
        const { code } = parsedUrl.query;

        if (parsedUrl.pathname === '/oauth2callback' && code) {
          // Close response with a success message
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <h1>Authentication successful!</h1>
            <p>You can close this window and return to the application.</p>
            <script>window.close();</script>
          `);
          
          // Close the server
          server.close();
          
          try {
            // Exchange code for tokens
            const { tokens } = await oAuth2Client.getToken(code);
            resolve(tokens);
          } catch (err) {
            reject(new Error(`Error retrieving access token: ${err.message}`));
          }
        } else {
          // Handle other requests or missing code
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Invalid Request</h1><p>Missing authorization code.</p>');
        }
      } catch (err) {
        reject(err);
      }
    });

    // Start the server
    server.listen(PORT, () => {
      // Generate the authorization URL with the correct redirect URI
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Force to get refresh token
        redirect_uri: `http://localhost:${PORT}/oauth2callback`
      });

      // Open the authorization URL in the default browser
      console.log(`Opening browser to authorize access: ${authUrl}`);
      opener(authUrl);
    });

    // Handle server errors
    server.on('error', (err) => {
      reject(new Error(`Server error: ${err.message}`));
    });
  });
}

/**
 * Creates an OAuth2 client and generates the token
 */
async function generateToken() {
  try {
    // Check if credentials file exists
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error(`Error: Google API credentials not found at ${CREDENTIALS_PATH}`);
      process.exit(1);
    }
    
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    
    // Create OAuth client
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    // Create OAuth client with the localhost redirect
    const oAuth2Client = new google.auth.OAuth2(
      client_id, 
      client_secret, 
      `http://localhost:${PORT}/oauth2callback`
    );
    
    console.log('Starting local server to handle authentication...');
    
    // Start local server and get tokens
    const tokens = await runLocalServer(oAuth2Client);
    
    // Save the token
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log(`Token saved to ${TOKEN_PATH}`);
    
    // Log token expiration information
    if (tokens.expiry_date) {
      const expiryDate = new Date(tokens.expiry_date);
      console.log(`Access token expires on: ${expiryDate.toLocaleString()}`);
    }
    
    if (tokens.refresh_token) {
      console.log('Refresh token received and saved. This can be used for automatic token renewal.');
    } else {
      console.warn('No refresh token received. You might need to revoke access and try again.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error generating token:', error.message);
    process.exit(1);
  }
}

// Run the token generation process
generateToken(); 