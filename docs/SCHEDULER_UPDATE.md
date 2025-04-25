# Scheduler & Alert System Update Documentation

## Overview

The scheduler and email alert systems have been significantly enhanced to improve reliability, error handling, and monitoring. These updates address issues with cron job execution and add robust email notifications for missed jobs.

## Key Changes

### 1. Enhanced Scheduler Architecture

#### Multiple Processing Times
- **Previous**: Single cron job running at 7:00 PM Colombia time (UTC-5)
- **Current**: Two scheduled jobs:
  - Afternoon job: 3:30 PM Colombia time (8:30 PM UTC)
  - Evening job: 7:00 PM Colombia time (12:00 AM UTC)

#### Improved Timezone Handling
- **Previous**: Used 'America/Bogota' timezone with potential compatibility issues
- **Current**: Uses UTC timezone directly with adjusted times to avoid timezone conflicts
- Cron pattern for afternoon job: `'30 20 * * *'` (8:30 PM UTC)
- Cron pattern for evening job: `'0 0 * * *'` (12:00 AM UTC)

#### Robust Error Handling
- Comprehensive try/catch blocks at multiple levels
- Individual error handling for each job's execution
- Graceful startup that won't crash the server if initialization fails
- Each cron job now has its own isolated error handling

### 2. Job Monitoring System

#### Missed Job Detection
- New monitoring job that runs hourly to detect missed scheduled runs
- Detects if jobs didn't execute at their scheduled time
- Sends email alerts for missed jobs
- Tracks statistics about job execution and failure history

#### Job Execution Tracking
```javascript
const jobExecutionHistory = {
  afternoon: {
    lastRun: null,
    lastResult: null,
    missedRuns: 0,
    totalRuns: 0
  },
  evening: {
    lastRun: null,
    lastResult: null,
    missedRuns: 0,
    totalRuns: 0
  }
};
```

#### Startup Grace Period
- 5-minute grace period after server startup
- Prevents false alerts when the server first starts
- Monitoring job automatically skips initial checks during this period

### 3. Email Alert System

#### New Alert System
- Dedicated `emailAlert.js` utility for sending notification emails
- Uses the same Gmail account credentials as the email processing
- Sends detailed HTML-formatted alerts with relevant information
- Multiple fallback mechanisms for email sending

#### Alert Types
1. **Missed Job Alerts**: When a scheduled job doesn't run at its expected time
2. **Job Error Alerts**: When a job runs but encounters errors during execution

#### Resilient Design
- Lazy-loading of dependencies to prevent circular dependencies
- Fallback to application password if OAuth fails
- Multiple levels of error handling to ensure the alert system itself doesn't crash
- Graceful degradation if email sending fails

### 4. API Endpoints for Scheduler Management

#### Status & Diagnostics
- GET `/api/scheduler/status`: Get the current scheduler status
- GET `/api/scheduler/diagnostics`: Get detailed diagnostic information

#### Manual Control
- POST `/api/scheduler/run`: Manually run the scheduled email processing task
- POST `/api/scheduler/reschedule`: Force reschedule the email processing task
- POST `/api/scheduler/check-missed`: Manually check for missed scheduled jobs

## Technical Implementation Details

### Lazy Loading Alert Module
```javascript
// Define a lazy-loaded function to avoid circular dependencies
let sendAlertEmailFn = null;
const getSendAlertEmail = () => {
  if (!sendAlertEmailFn) {
    try {
      const { sendAlertEmail } = require('./utils/emailAlert');
      sendAlertEmailFn = sendAlertEmail;
    } catch (error) {
      // Return a noop function as fallback
      sendAlertEmailFn = (subject, body) => {
        schedulerLogger.warn(`Alert email not sent (module not loaded): ${subject}`);
        return Promise.resolve(false);
      };
    }
  }
  return sendAlertEmailFn;
};
```

### Example Alert Email Structure
```html
<h2>Missed Scheduled Job</h2>
<p><strong>Job:</strong> Afternoon (3:30 PM Colombia time / 8:30 PM UTC)</p>
<p><strong>Current time:</strong> 2023-04-25T21:05:32.456Z</p>
<p><strong>Last successful run:</strong> 2023-04-24T20:30:15.123Z</p>
<p><strong>Missed runs count:</strong> 1</p>
```

### Resilient Scheduler Initialization
```javascript
// In index.js
try {
  initializeScheduler();
  logger.info('Scheduler initialized for email processing at 3:30 PM and 7:00 PM Colombia time');
} catch (error) {
  logger.error('Failed to initialize scheduler, but will continue server startup', {
    error: error.message,
    stack: error.stack
  });
}
```

## Usage for Developers

### Checking Scheduler Status
- View the home page to see the basic status (Running/Stopped)
- Access `/api/scheduler/diagnostics` for detailed diagnostics (requires API key)

### Manual Operations
- Use `/api/scheduler/run` to manually trigger email processing
- Use `/api/scheduler/check-missed` to manually check for missed jobs
- Use `/api/scheduler/reschedule` if the scheduler appears to be malfunctioning

### Alert System Configuration
- The system uses the existing Gmail OAuth credentials for sending alerts
- Alerts are sent to `johanseb2520@gmail.com`
- If OAuth fails, it will fall back to using GMAIL_APP_PASSWORD if configured

## Troubleshooting

### Common Issues
1. **Server crashes during startup**: 
   - Check for missing dependencies or credential issues
   - The latest update should prevent crashes, but check logs for specific errors

2. **Jobs not running at scheduled times**:
   - Check server timezone settings
   - Verify the scheduler status via the diagnostic endpoint
   - Look for email alerts about missed jobs

3. **Not receiving alert emails**:
   - Check Gmail API credentials and token
   - Verify that the application has necessary Gmail access permissions
   - Check spam folder as alerts contain [ALERT] in the subject

### Logs to Monitor
- Scheduler logs with `module: 'scheduler'`
- Email alert logs with `module: 'emailAlert'`
- Job execution logs containing 'Running scheduled email processing task'

## Future Improvements

1. **Enhanced Monitoring Dashboard**:
   - Visual representation of job execution history
   - Real-time alerts in the admin dashboard

2. **Additional Alert Channels**:
   - SMS alerts for critical failures
   - Slack/Teams integration for team notifications

3. **Auto-recovery Mechanisms**:
   - Automatic job rescheduling after repeated failures
   - Self-healing capabilities for common failure modes 