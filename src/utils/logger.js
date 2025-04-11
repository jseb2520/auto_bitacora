/**
 * @fileoverview Structured logger utility using Winston
 * @module utils/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    info => `[${info.timestamp}] [${info.level}]: ${info.message} ${info.stack || ''}`
  )
);

// Create the logger
const logger = winston.createLogger({
  level: config.server.env === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'auto-bitacora' },
  transports: [
    // Write logs with level 'error' and above to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// If not in production, also log to the console
if (config.server.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

/**
 * Create a child logger with additional metadata
 * @param {string} module - Module name
 * @returns {Object} Child logger
 */
const createModuleLogger = (module) => {
  return logger.child({ module });
};

// Export the logger and helper function
module.exports = {
  logger,
  createModuleLogger
}; 