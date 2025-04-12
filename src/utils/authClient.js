/**
 * @fileoverview Shared Google API authentication client for Gmail and Google Sheets
 * @module utils/authClient
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { logger, createModuleLogger } = require('./logger');

// Create a module-specific logger
const moduleLogger = createModuleLogger('authClient');

/**
 * Google API authentication client
 */
class GoogleAuthClient {
  constructor() {
    this.credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');
    this.tokenPath = process.env.GOOGLE_TOKEN_PATH || path.join(process.cwd(), 'token.json');
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/spreadsheets'
    ];
    this.auth = null;
    this.tokenData = null;
  }

  /**
   * Initialize the authentication client
   * @returns {Promise<google.auth.OAuth2>} Authenticated OAuth2 client
   */
  async initialize() {
    try {
      moduleLogger.info('Initializing Google Auth client');
      
      // Check if credentials file exists
      if (!fs.existsSync(this.credentialsPath)) {
        throw new Error(`Google API credentials not found at ${this.credentialsPath}`);
      }
      
      // Load credentials
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      
      // Create OAuth client
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      this.auth = new google.auth.OAuth2(
        client_id, 
        client_secret, 
        redirect_uris[0] || 'http://localhost'
      );
      
      // Check if we have a saved token
      if (fs.existsSync(this.tokenPath)) {
        this.tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        this.auth.setCredentials(this.tokenData);
        
        // Set up token refresh listener
        this.setupTokenRefreshHandler();
        
        // Check if token is expired and refresh if needed
        await this.checkAndRefreshToken();
        
        moduleLogger.info('Found existing auth token, authentication successful');
        return this.auth;
      } else {
        throw new Error('Token file not found. Please run the authorization flow to generate token.json');
      }
    } catch (error) {
      moduleLogger.error('Failed to initialize Google Auth client', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Setup token refresh event handler
   */
  setupTokenRefreshHandler() {
    this.auth.on('tokens', (tokens) => {
      moduleLogger.info('Token refreshed automatically');
      
      // If we have new tokens but not a refresh token, add the existing refresh token
      if (!tokens.refresh_token && this.tokenData && this.tokenData.refresh_token) {
        tokens.refresh_token = this.tokenData.refresh_token;
      }
      
      // Update the token data with new values
      this.tokenData = Object.assign(this.tokenData || {}, tokens);
      
      // Save updated tokens to file
      fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokenData, null, 2));
      moduleLogger.info('Updated tokens saved to disk');
    });
  }

  /**
   * Check if the access token is expired and refresh if needed
   * @returns {Promise<void>}
   */
  async checkAndRefreshToken() {
    // If token is missing or there's no expiry date, we can't check
    if (!this.tokenData || !this.tokenData.expiry_date) {
      moduleLogger.warn('Cannot check token expiration - missing expiry data');
      return;
    }
    
    // Get current time and expiry time (with 5 min buffer)
    const now = Date.now();
    const expiryTime = this.tokenData.expiry_date;
    const fiveMinInMs = 5 * 60 * 1000;
    
    // If token is expired or will expire in the next 5 minutes
    if (now >= expiryTime - fiveMinInMs) {
      moduleLogger.info('Access token is expired or will expire soon, refreshing...');
      
      try {
        // Force token refresh if we have a refresh token
        if (this.tokenData.refresh_token) {
          const { credentials } = await this.auth.refreshAccessToken();
          
          moduleLogger.info('Token refreshed successfully');
          
          // Make sure we keep the refresh token
          if (!credentials.refresh_token && this.tokenData.refresh_token) {
            credentials.refresh_token = this.tokenData.refresh_token;
          }
          
          // Update token data
          this.tokenData = credentials;
          this.auth.setCredentials(credentials);
          
          // Save the refreshed token
          fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokenData, null, 2));
          
          // Log when the new token will expire
          const newExpiryDate = new Date(this.tokenData.expiry_date);
          moduleLogger.info(`New token expires at: ${newExpiryDate.toISOString()}`);
        } else {
          moduleLogger.error('Token is expired but no refresh token is available');
          throw new Error('No refresh token available. Please re-authenticate.');
        }
      } catch (error) {
        moduleLogger.error('Failed to refresh token:', error);
        throw new Error(`Failed to refresh token: ${error.message}. Please re-authenticate.`);
      }
    } else {
      // Log when the token will expire
      const expiryDate = new Date(expiryTime);
      moduleLogger.debug(`Current access token valid until: ${expiryDate.toISOString()}`);
    }
  }

  /**
   * Gets the authenticated client, initializing if necessary
   * @returns {Promise<google.auth.OAuth2>} Authenticated OAuth2 client
   */
  async getAuthClient() {
    if (!this.auth) {
      await this.initialize();
    } else {
      // If auth exists, still check if token needs refresh
      await this.checkAndRefreshToken();
    }
    return this.auth;
  }
}

// Export a singleton instance
module.exports = new GoogleAuthClient(); 