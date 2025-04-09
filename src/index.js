/**
 * @fileoverview Main application entry point
 * @module index
 */

const express = require('express');
const { connectDatabase } = require('./utils/database');
const config = require('./config');
const routes = require('./routes');
const scheduler = require('./utils/scheduler');

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();
    
    // Start the Express server
    const PORT = config.server.port;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${config.server.env} mode`);
    });
    
    // Initialize scheduled tasks
    scheduler.initTasks();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      scheduler.stopAllTasks();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer(); 