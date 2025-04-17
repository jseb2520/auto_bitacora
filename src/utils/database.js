/**
 * @fileoverview MongoDB database connection utility
 * @module utils/database
 */

const mongoose = require('mongoose');
const config = require('../config');

/**
 * Establishes connection to MongoDB
 * @returns {Promise<mongoose.Connection>} Mongoose connection object
 */
const connectDatabase = async () => {
  try {
    const connection = await mongoose.connect(config.mongodb.uri, {
      // Options for MongoDB connection
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      dbName: 'auto_bitacora' // Specify database name from environment variable
    });
    
    console.log(`MongoDB connected: ${connection.connection.host}`);
    
    // Handle connection errors
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });
    
    // Handle disconnection
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected, attempting to reconnect...');
      setTimeout(connectDatabase, 5000); // Attempt to reconnect after 5 seconds
    });
    
    return connection;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Exit with failure
  }
};

// Function to get the current connection status
const getConnectionStatus = () => {
  return mongoose.connection.readyState;
};

module.exports = {
  connectDatabase,
  getConnectionStatus // Export the status function
}; 