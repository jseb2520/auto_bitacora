/**
 * @fileoverview Monitoring utility for system health checks and metrics
 * @module utils/monitoring
 */

const os = require('os');

/**
 * System metrics collector and reporter
 */
class Monitoring {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        notFound: 0
      },
      api: {
        binance: { calls: 0, errors: 0 },
        revolut: { calls: 0, errors: 0 },
        kraken: { calls: 0, errors: 0 },
        telegram: { calls: 0, errors: 0 },
        googleSheets: { calls: 0, errors: 0 }
      },
      scheduler: {
        jobsRun: 0,
        jobsSucceeded: 0,
        jobsFailed: 0
      },
      database: {
        queries: 0,
        errors: 0
      }
    };
  }

  /**
   * Track a new API request
   * @param {string} type - Type of request (success, error, notFound)
   */
  trackRequest(type = 'success') {
    this.metrics.requests.total += 1;
    
    if (type === 'success') {
      this.metrics.requests.success += 1;
    } else if (type === 'error') {
      this.metrics.requests.error += 1;
    } else if (type === 'notFound') {
      this.metrics.requests.notFound += 1;
    }
  }

  /**
   * Track an external API call
   * @param {string} service - Service name (binance, revolut, kraken, etc.)
   * @param {boolean} isError - Whether the call resulted in an error
   */
  trackApiCall(service, isError = false) {
    if (this.metrics.api[service]) {
      this.metrics.api[service].calls += 1;
      
      if (isError) {
        this.metrics.api[service].errors += 1;
      }
    }
  }

  /**
   * Track a scheduled job execution
   * @param {boolean} success - Whether the job succeeded
   */
  trackScheduledJob(success = true) {
    this.metrics.scheduler.jobsRun += 1;
    
    if (success) {
      this.metrics.scheduler.jobsSucceeded += 1;
    } else {
      this.metrics.scheduler.jobsFailed += 1;
    }
  }

  /**
   * Track a database query
   * @param {boolean} isError - Whether the query resulted in an error
   */
  trackDatabaseQuery(isError = false) {
    this.metrics.database.queries += 1;
    
    if (isError) {
      this.metrics.database.errors += 1;
    }
  }

  /**
   * Get the current system health status
   * @returns {Object} System health metrics
   */
  getHealthMetrics() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    return {
      status: 'healthy',
      uptime: uptime,
      uptimeFormatted: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      system: {
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: (1 - os.freemem() / os.totalmem()) * 100
        },
        cpu: os.loadavg(),
        platform: os.platform(),
        hostname: os.hostname()
      },
      metrics: this.metrics
    };
  }

  /**
   * Reset all metrics counters
   */
  resetMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        notFound: 0
      },
      api: {
        binance: { calls: 0, errors: 0 },
        revolut: { calls: 0, errors: 0 },
        kraken: { calls: 0, errors: 0 },
        telegram: { calls: 0, errors: 0 },
        googleSheets: { calls: 0, errors: 0 }
      },
      scheduler: {
        jobsRun: 0,
        jobsSucceeded: 0,
        jobsFailed: 0
      },
      database: {
        queries: 0,
        errors: 0
      }
    };
  }
}

/**
 * Format uptime in human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / (60 * 60 * 24));
  const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const remainingSeconds = seconds % 60;
  
  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

// Create a singleton instance
const monitoring = new Monitoring();

module.exports = monitoring; 