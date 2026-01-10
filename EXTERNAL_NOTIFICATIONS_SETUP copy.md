# External Notifications Setup Guide

## Overview

The external notification system supports three channels:
- **Push Notifications** (Firebase Cloud Messaging)
- **SMS** (Twilio - optional)
- **Email** (SMTP - already configured)

## Environment Variables

Add the following to your `server/.env` file:

### Firebase Cloud Messaging (FCM)

```env
# Option 1: Service Account JSON (Recommended for production)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id",...}

# Option 2: Individual credentials
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Twilio SMS (Optional)

```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Email (Already configured)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_EMAIL=your-email@example.com
SMTP_PASSWORD=your-password
FROM_NAME=MyClinic
```

## Installation

```bash
cd server
npm install
```

This will install:
- `firebase-admin` - For FCM push notifications
- `twilio` - For SMS notifications

## Features

### 1. User Notification Preferences
- Users can manage preferences in Profile Settings
- Preferences stored in MongoDB
- Supports per-channel and per-type preferences

### 2. Automatic External Notifications
All in-app notifications automatically trigger external notifications:
- Appointment confirmations
- Reminders
- Wallet updates
- System notifications

### 3. Retry Mechanism
- Push notifications: 2 retries with 1-second delay
- Email: 2 retries with 2-second delay
- SMS: No retry (Twilio handles this)

### 4. Failure Handling
- Invalid FCM tokens are automatically removed
- External notification failures don't break in-app notifications
- Errors are logged but don't interrupt user flow

### 5. Localization
- Supports English and Arabic
- Messages are localized based on user preferences
- Defaults to English if language not specified

### 6. Data Sanitization
- Sensitive medical data is removed from notifications
- Only safe, non-PII data is included in push notifications

## API Endpoints

### Register FCM Token
```
POST /api/notifications/register-token
Body: { "token": "fcm-token-string" }
```

### Get Notification Preferences
```
GET /api/notifications/preferences
Response: { preferences: {...}, hasFcmToken: true/false }
```

### Update Notification Preferences
```
PUT /api/notifications/preferences
Body: { preferences: { push: true, email: true, ... } }
```

## Frontend Integration

### Register FCM Token (React/Web)

```javascript
// Request notification permission
const permission = await Notification.requestPermission();

if (permission === 'granted') {
  // Get FCM token (requires Firebase SDK setup)
  const token = await getMessaging().getToken();
  
  // Register with backend
  await apiFetch('/api/notifications/register-token', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
}
```

### For Mobile Apps
- Use Firebase SDK to get FCM token
- Register token via the API endpoint
- Handle token refresh and re-registration

## Testing

### Test Push Notifications
1. Register an FCM token
2. Create an appointment or trigger any notification
3. Check device for push notification

### Test Email
- Already working if SMTP is configured
- Check email inbox for notifications

### Test SMS
1. Enable SMS in user preferences
2. Ensure Twilio is configured
3. Trigger a notification
4. Check phone for SMS

## Notes

- External notifications are sent asynchronously (non-blocking)
- If external notification fails, in-app notification still succeeds
- Disabled accounts don't receive external notifications
- Users can opt-out of specific notification types or channels

