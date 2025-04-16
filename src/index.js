/**
 * @fileoverview Main application entry point
 * @module index
 */

const express = require('express');
const helmet = require('helmet');
const { connectDatabase } = require('./utils/database');
const config = require('./config');
const routes = require('./routes');
const { initializeScheduler } = require('./scheduler'); // Import our new scheduler
const middleware = require('./middleware');
const { logger } = require('./utils/logger');
const { getInstance } = require('./utils/emailCache');
const EmailProcessingRecord = require('./models/emailProcessingRecord');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// Request parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply global error logging middleware
app.use(middleware.errorLogger);

// Apply health check middleware
app.use(middleware.healthCheck);

// API Routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  logger.info('Resource not found', { path: req.path });
  res.status(404).json({ error: 'Resource not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack });
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.server.env === 'development' ? err.message : undefined
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', { error: err.message, stack: err.stack });
  
  // Try to gracefully shut down
  shutdown(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason: reason?.message || reason, stack: reason?.stack });
});

// Graceful shutdown function
const shutdown = (code = 0) => {
  logger.info('Shutting down gracefully...');
  
  // Force close after timeout
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(code);
  }, 10000); // 10 seconds
  
  // Close server if it exists
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(code);
    });
  } else {
    process.exit(code);
  }
};

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();
    
    // Initialize the email cache with the model for production use
    const emailCache = getInstance({ model: EmailProcessingRecord });
    logger.info('EmailCache initialized for production use with database');
    
    // Start the Express server
    const PORT = process.env.PORT || config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.server.env} mode`);
    });
    
    // Initialize our scheduler for email processing
    initializeScheduler();
    logger.info('Scheduler initialized for email processing at 7PM Colombia time');
    
    // Keep-alive mechanism to prevent Railway from shutting down the app
    setInterval(() => {
      logger.debug('Keep-alive ping to prevent container shutdown');
    }, 5 * 60 * 1000); // Ping every 5 minutes
    
    // Handle graceful shutdown
    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Start the application
let server;
(async () => {
  server = await startServer();
})(); 