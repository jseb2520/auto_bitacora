/**
 * @fileoverview Email alerting utility for system notifications
 * @module utils/emailAlert
 */

const { logger } = require('./logger');

// Create a logger for email alerts
const alertLogger = logger.child({ module: 'emailAlert' });

// Safely load dependencies
let nodemailer, fs, path, authClient;
try {
  nodemailer = require('nodemailer');
  fs = require('fs');
  path = require('path');
  authClient = require('./authClient');
} catch (error) {
  alertLogger.error('Failed to load emailAlert dependencies', {
    error: error.message,
    stack: error.stack
  });
}

/**
 * Send an alert email notification
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML supported)
 * @returns {Promise<boolean>} Success status
 */
async function sendAlertEmail(subject, body) {
  try {
    // Check if required modules are loaded
    if (!nodemailer) {
      alertLogger.error('Cannot send email - nodemailer module not available');
      return false;
    }
    
    alertLogger.info('Preparing to send alert email', { subject });
    
    // Determine the email sender using fallbacks
    let userEmail = process.env.GMAIL_EMAIL || 'johanseb2520@gmail.com';
    
    // Only try to get auth if fs, path and authClient are available
    if (fs && path && authClient) {
      try {
        // Get credentials file path
        const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                              path.join(process.cwd(), 'credentials.json');
        
        // Check if credentials exist
        if (fs.existsSync(credentialsPath)) {
          // Try to get the authenticated client only if we need to
          await authClient.initialize();
          const auth = await authClient.getAuthClient();
          
          // Try to get user email from environment, token data, or fallback
          userEmail = process.env.GMAIL_EMAIL || 
                     (authClient.tokenData && authClient.tokenData.email) || 
                     userEmail;
          
          // Get access token
          const accessToken = await auth.getAccessToken();
          
          // Create transporter with OAuth
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              type: 'OAuth2',
              user: userEmail,
              clientId: auth._clientId,
              clientSecret: auth._clientSecret,
              refreshToken: authClient.tokenData ? authClient.tokenData.refresh_token : null,
              accessToken: accessToken.token
            }
          });
          
          // Email options
          const mailOptions = {
            from: `Auto Bitacora <${userEmail}>`,
            to: 'johanseb2520@gmail.com',
            subject: `[ALERT] ${subject}`,
            html: body
          };
          
          // Send email
          const info = await transporter.sendMail(mailOptions);
          alertLogger.info('Alert email sent successfully', { 
            messageId: info.messageId,
            subject
          });
          
          return true;
        } else {
          alertLogger.warn('No credentials file found for sending email');
        }
      } catch (authError) {
        // Log the auth error but continue to try a fallback method
        alertLogger.error('Failed to use OAuth for email sending', {
          error: authError.message,
          stack: authError.stack
        });
      }
    }
    
    // If we got here, try app password as fallback
    if (process.env.GMAIL_APP_PASSWORD) {
      try {
        // Create transporter with app password
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: userEmail,
            pass: process.env.GMAIL_APP_PASSWORD
          }
        });
        
        // Email options
        const mailOptions = {
          from: `Auto Bitacora <${userEmail}>`,
          to: 'johanseb2520@gmail.com',
          subject: `[ALERT] ${subject}`,
          html: body
        };
        
        // Send email
        const info = await transporter.sendMail(mailOptions);
        alertLogger.info('Alert email sent successfully using app password', { 
          messageId: info.messageId,
          subject
        });
        
        return true;
      } catch (appPasswordError) {
        alertLogger.error('Failed to send email using app password', {
          error: appPasswordError.message
        });
      }
    }
    
    // Record the attempted alert since we couldn't send it
    alertLogger.warn('Unable to send alert email, no working method available', {
      subject,
      bodyPreview: body.substring(0, 100) + '...'
    });
    
    return false;
  } catch (error) {
    alertLogger.error('Failed to send alert email', {
      error: error.message,
      stack: error.stack,
      subject
    });
    return false;
  }
}

module.exports = {
  sendAlertEmail
}; 