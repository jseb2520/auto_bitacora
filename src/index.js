/**
 * @fileoverview Main application entry point
 * @module index
 */

const express = require('express');
const helmet = require('helmet');
const { connectDatabase } = require('./utils/database');
const config = require('./config');
const routes = require('./routes');
const scheduler = require('./utils/scheduler');
const monitoring = require('./utils/monitoring');
const middleware = require('./middleware');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// Request parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply global error logging middleware
app.use(middleware.errorLogger);

// API Routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  monitoring.trackRequest('notFound');
  res.status(404).json({ error: 'Resource not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  monitoring.trackRequest('error');
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.server.env === 'development' ? err.message : undefined
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  
  // Try to gracefully shut down
  shutdown(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown function
const shutdown = (code = 0) => {
  console.log('Shutting down gracefully...');
  
  // Stop all scheduled tasks
  scheduler.stopAllTasks();
  
  // Close server (if defined)
  if (server) {
    server.close(() => {
      console.log('Server closed');
      process.exit(code);
    });
    
    // Force close after timeout
    setTimeout(() => {
      console.error('Forcing shutdown after timeout');
      process.exit(code);
    }, 10000); // 10 seconds
  } else {
    process.exit(code);
  }
};

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();
    
    // Start the Express server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${config.server.env} mode`);
    });
    
    // Initialize scheduled tasks
    scheduler.initTasks();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
let server;
(async () => {
  server = await startServer();
})(); 