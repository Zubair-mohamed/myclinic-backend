# Doctor Appointment Reminder System

## Overview

Automated appointment reminder system that sends out-of-app notifications to doctors before their scheduled appointments. The system runs in the background and respects doctor preferences.

## Features

### 1. Automated Reminders
- **24-hour reminder**: Sent 24 hours before appointment
- **1-hour reminder**: Sent 1 hour before appointment
- Both reminders are configurable per doctor

### 2. Smart Filtering
Reminders are NOT sent if:
- Appointment is canceled (`status !== 'Upcoming'`)
- Appointment is rescheduled (tracked via status)
- Doctor's account is disabled (`isDisabled === true`)
- Doctor's account is inactive (`isActive === false`)
- Reminder has already been sent (tracked in appointment)
- Doctor has disabled reminders in preferences

### 3. Notification Content
Each reminder includes:
- Patient name or identifier
- Appointment date and time
- Visit/consultation type (appointment type)
- Hospital name
- Localized messages (English/Arabic)

### 4. Scalability
- Runs every 15 minutes via cron scheduler
- Processes appointments in batches
- Non-blocking execution
- Efficient database queries with proper indexing

### 5. Logging & Monitoring
- Detailed logs for each reminder sent
- Processing summaries with success/failure counts
- Error logging for debugging
- Admin endpoint for manual triggering

## Architecture

### Components

1. **Doctor Reminder Service** (`server/services/doctorReminderService.js`)
   - Core logic for finding and sending reminders
   - Handles appointment datetime parsing
   - Validates doctor preferences
   - Sends external notifications

2. **Reminder Scheduler** (`server/services/reminderScheduler.js`)
   - Manages cron jobs
   - Runs every 15 minutes
   - Handles scheduler lifecycle

3. **Database Models**
   - `Appointment`: Tracks reminder status (`doctorReminder24hSent`, `doctorReminder1hSent`)
   - `User`: Stores doctor preferences (`doctorReminderPreferences`)

## API Endpoints

### Get Doctor Reminder Preferences
```
GET /api/users/profile/doctor-reminders
Access: Doctor only
Response: { preferences: { enabled, reminder24h, reminder1h } }
```

### Update Doctor Reminder Preferences
```
PUT /api/users/profile/doctor-reminders
Access: Doctor only
Body: { preferences: { enabled, reminder24h, reminder1h } }
```

### Manually Trigger Reminders (Admin)
```
POST /api/notifications/trigger-reminders
Access: Super Admin only
Response: Processing results and statistics
```

## Configuration

### Default Settings
- Reminders enabled by default
- Both 24h and 1h reminders enabled by default
- Scheduler runs every 15 minutes

### Doctor Preferences
Doctors can configure:
- Enable/disable all reminders
- Enable/disable 24-hour reminders
- Enable/disable 1-hour reminders

## Scheduler Details

### Timing
- Runs every 15 minutes (`*/15 * * * *`)
- Checks appointments within time windows:
  - 24h reminders: ±30 minutes window
  - 1h reminders: ±7 minutes window

### Processing Flow
1. Query upcoming appointments
2. Filter by reminder status (not sent yet)
3. Check appointment datetime against windows
4. Validate doctor preferences and account status
5. Send external notifications
6. Update appointment tracking fields
7. Log results

## Notification Channels

Reminders are sent via the external notification service:
- **Push Notifications** (if FCM token registered)
- **Email** (if email notifications enabled)
- **SMS** (if SMS notifications enabled)

All channels respect the doctor's notification preferences.

## Frontend Integration

### Doctor Reminder Settings UI
Located in Profile component, visible only to doctors:
- Toggle to enable/disable reminders
- Checkboxes for 24h and 1h reminders
- Save button to update preferences

## Testing

### Manual Testing
1. Create an appointment for a doctor
2. Use admin endpoint to trigger reminders manually:
   ```bash
   POST /api/notifications/trigger-reminders
   ```
3. Check logs for processing results
4. Verify notifications received

### Automated Testing
- Scheduler runs automatically every 15 minutes
- No manual intervention needed
- System handles edge cases gracefully

## Monitoring

### Logs
- Success: `✅ Doctor reminder sent: {type} reminder for appointment {id}`
- Failure: `❌ Error sending doctor reminder: {error}`
- Summary: `📊 Reminder Processing Summary: {sent} sent, {failed} failed`

### Metrics
Each processing run returns:
- Total appointments checked
- Reminders sent successfully
- Reminders failed
- Appointments skipped (outside window)
- Processing time

## Troubleshooting

### Reminders Not Sending
1. Check doctor preferences (enabled?)
2. Verify appointment status (Upcoming?)
3. Check doctor account status (active, not disabled?)
4. Verify reminder hasn't already been sent
5. Check notification preferences (push/email/SMS enabled?)
6. Review server logs for errors

### Scheduler Not Running
1. Check server startup logs
2. Verify MongoDB connection
3. Check for cron errors in logs
4. Verify node-cron is installed

## Future Enhancements

- Custom reminder times (not just 24h/1h)
- Reminder templates customization
- Reminder history/analytics
- Bulk reminder configuration
- Timezone support for accurate timing

