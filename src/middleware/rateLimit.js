/**
 * @fileoverview Rate limiting middleware to prevent API abuse
 * @module middleware/rateLimit
 */

/**
 * Simple in-memory rate limiter
 * In production, use a more robust solution like Redis-based rate limiting
 */
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Clean up every minute
  }

  /**
   * Check if a client has exceeded their rate limit
   * @param {string} clientIp - Client's IP address
   * @param {number} maxRequests - Maximum allowed requests per window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} Whether the client has exceeded their limit
   */
  isRateLimited(clientIp, maxRequests, windowMs) {
    const now = Date.now();
    
    if (!this.requests.has(clientIp)) {
      this.requests.set(clientIp, [now]);
      return false;
    }
    
    const clientRequests = this.requests.get(clientIp);
    
    // Filter out requests outside the current time window
    const recentRequests = clientRequests.filter(time => now - time < windowMs);
    
    // Update the requests for this client
    this.requests.set(clientIp, [...recentRequests, now]);
    
    return recentRequests.length >= maxRequests;
  }

  /**
   * Remove old entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    
    for (const [clientIp, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(time => now - time < 3600000); // Keep last hour
      
      if (recentRequests.length === 0) {
        this.requests.delete(clientIp);
      } else {
        this.requests.set(clientIp, recentRequests);
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop() {
    clearInterval(this.cleanupInterval);
  }
}

// Create a singleton instance
const limiter = new RateLimiter();

/**
 * Rate limiting middleware for Express
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 ms = 1 minute)
 * @param {number} options.maxRequests - Maximum allowed requests per window (default: 60)
 * @returns {Function} Express middleware function
 */
const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60000; // Default: 1 minute
  const maxRequests = options.maxRequests || 60; // Default: 60 requests per minute
  
  return (req, res, next) => {
    // Get client IP
    const clientIp = req.ip || 
      req.connection.remoteAddress || 
      req.headers['x-forwarded-for'] || 
      'unknown';
    
    // Check if rate limited
    if (limiter.isRateLimited(clientIp, maxRequests, windowMs)) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later'
      });
    }
    
    next();
  };
};

// Export the middleware and the limiter (for cleanup in tests)
module.exports = {
  rateLimiter,
  limiter
}; 