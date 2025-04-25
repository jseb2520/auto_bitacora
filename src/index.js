/**
 * @fileoverview Main application entry point
 * @module index
 */

const express = require('express');
const helmet = require('helmet');
const { connectDatabase, getConnectionStatus } = require('./utils/database');
const config = require('./config');
const routes = require('./routes');
const { initializeScheduler, getSchedulerStatus } = require('./scheduler');
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

// Root route to display server status
app.get('/', (req, res) => {
  const uptimeSeconds = process.uptime();
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const memoryUsage = process.memoryUsage();
  const dbStatus = getConnectionStatus();
  const schedulerStatus = getSchedulerStatus();

  const dbStatusMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Server Status</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status-ok { color: green; font-weight: bold; }
        .status-warn { color: orange; font-weight: bold; }
        .status-error { color: red; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Server Status</h1>
      
      <h2>Health</h2>
      <table>
        <tr><th>Component</th><th>Status</th></tr>
        <tr>
          <td>Database Connection</td>
          <td class="${dbStatus === 1 ? 'status-ok' : 'status-error'}">${dbStatusMap[dbStatus] || 'Unknown'}</td>
        </tr>
        <tr>
          <td>Scheduler (Email Processing)</td>
          <td class="${schedulerStatus === 'Running' ? 'status-ok' : schedulerStatus === 'Partially Running' ? 'status-warn' : 'status-error'}">${schedulerStatus}</td>
        </tr>
      </table>

      <h2>Metrics</h2>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Environment</td><td>${config.server.env}</td></tr>
        <tr><td>Uptime</td><td>${uptimeHours}h ${uptimeMinutes % 60}m ${Math.floor(uptimeSeconds % 60)}s</td></tr>
        <tr><td>Memory Usage (RSS)</td><td>${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB</td></tr>
        <tr><td>Memory Usage (Heap Total)</td><td>${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB</td></tr>
        <tr><td>Memory Usage (Heap Used)</td><td>${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB</td></tr>
        <tr><td>Node Version</td><td>${process.version}</td></tr>
        <tr><td>Platform</td><td>${process.platform}</td></tr>
        <tr><td>Email Processing Schedule</td><td>3:30 PM and 7:00 PM Colombia time (UTC-5)<br>8:30 PM and 12:00 AM UTC</td></tr>
      </table>
    </body>
    </html>
  `;

  res.send(htmlContent);
});

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