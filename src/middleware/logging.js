/**
 * @fileoverview Logging middleware for tracking API requests and responses
 * @module middleware/logging
 */

/**
 * Request logging middleware
 * Logs details about each incoming request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const requestLogger = (req, res, next) => {
  // Generate a unique request ID
  const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  req.requestId = requestId;
  
  // Log request details
  const startTime = Date.now();
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || 'unknown',
    body: req.method === 'POST' || req.method === 'PUT' ? sanitizeRequestBody(req.body) : null
  };
  
  console.log(`[${logData.timestamp}] [REQUEST] [${requestId}] ${logData.method} ${logData.url} from ${logData.ip}`);
  
  // Add response logging
  const originalSend = res.send;
  res.send = function(body) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log response details
    const responseLog = {
      requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      size: Buffer.byteLength(body, 'utf8')
    };
    
    const logLevel = res.statusCode >= 500 ? 'ERROR' :
                    res.statusCode >= 400 ? 'WARN' : 'INFO';
    
    console.log(`[${responseLog.timestamp}] [RESPONSE] [${requestId}] ${res.statusCode} sent in ${duration}ms - ${responseLog.size} bytes`);
    
    // If error, log additional error details
    if (res.statusCode >= 400) {
      try {
        const parsedBody = JSON.parse(body);
        if (parsedBody.error) {
          console.log(`[${responseLog.timestamp}] [${logLevel}] [${requestId}] Error: ${parsedBody.error}`);
        }
      } catch (e) {
        // Not JSON or can't parse, just log the status
        console.log(`[${responseLog.timestamp}] [${logLevel}] [${requestId}] Error status: ${res.statusCode}`);
      }
    }
    
    // Call the original send function
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Sanitize request body for logging by removing sensitive information
 * @param {Object} body - Request body object
 * @returns {Object} Sanitized body
 */
const sanitizeRequestBody = (body) => {
  if (!body) return null;
  
  // Create a deep copy of the body
  const sanitized = JSON.parse(JSON.stringify(body));
  
  // Define fields to redact
  const sensitiveFields = [
    'password', 'secret', 'token', 'key', 'apiKey', 
    'apiSecret', 'credential', 'pin', 'creditCard'
  ];
  
  // Recursive function to redact sensitive fields
  const redact = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // If it's a sensitive field, redact it
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } 
        // If it's an object or array, recurse
        else if (typeof obj[key] === 'object') {
          redact(obj[key]);
        }
      }
    }
  };
  
  redact(sanitized);
  return sanitized;
};

/**
 * Error logging middleware
 * Logs details about errors that occur during request processing
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || 'unknown';
  
  console.error(`[${timestamp}] [ERROR] [${requestId}] ${err.stack || err.message || 'Unknown error'}`);
  
  next(err);
};

module.exports = {
  requestLogger,
  errorLogger
}; 