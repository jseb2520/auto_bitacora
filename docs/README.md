# Auto Bitacora Documentation

This directory contains documentation for the Auto Bitacora project:

## Documentation Files

- [DOCUMENTATION.md](./DOCUMENTATION.md) - Main technical documentation with complete system overview
- [SCHEDULER_UPDATE.md](./SCHEDULER_UPDATE.md) - Recent updates to the scheduler and alert system
- [gmail_integration.md](./gmail_integration.md) - Gmail API integration details

## Recent Updates

The system has been significantly improved with:

1. **Enhanced Scheduler System**
   - Multiple daily processing times (3:30 PM and 7:00 PM Colombia time)
   - Monitoring system for detecting missed jobs
   - Email alerts for errors and missed runs

2. **Improved Error Handling**
   - Robust error management across all components
   - Graceful degradation when components fail
   - Server resiliency to prevent crashes

3. **New Management API Endpoints**
   - Status and diagnostic endpoints
   - Manual control of scheduler functions
   - Testing and troubleshooting utilities

See [SCHEDULER_UPDATE.md](./SCHEDULER_UPDATE.md) for complete details on these changes. 