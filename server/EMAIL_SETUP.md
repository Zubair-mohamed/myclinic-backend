# Email Sending Feature Setup Guide

## Overview

The MyClinic server now includes a comprehensive email sending feature that supports multiple email types with professional templates, error handling, and retry logic. This feature is used across various parts of the application for user notifications, account management, and medical report alerts.

## Features

### ✅ Implemented Email Templates

1. **Registration Verification** (`registration`)
   - Sends OTP for account verification during registration
   - Professional template with company branding

2. **Password Reset** (`password-reset`)
   - Sends OTP for password reset requests
   - Secure 6-digit code with 10-minute expiry

3. **Welcome Email** (`welcome`)
   - Confirmation email after successful account verification
   - Introduces users to platform features

4. **Appointment Reminders** (`appointment_reminder`)
   - Sends appointment reminders to patients
   - Includes doctor, time, location, and notes

5. **Account Management**
   - `account_disabled` - Notifies users when account is disabled
   - `account_reactivation_code` - Sends OTP for account reactivation
   - `account_reactivated` - Confirms successful account reactivation

6. **Medical Reports** (`medical_report`)
   - Notifies patients when doctors upload new medical documents
   - Includes report details and doctor information

7. **Generic** (`generic`)
   - Flexible template for custom notifications

### 🔧 Technical Features

- **Nodemailer Integration**: Uses SMTP for reliable email delivery
- **Connection Pooling**: Optimized for high-volume email sending
- **Retry Logic**: Automatic retry on failure (up to 3 attempts)
- **Template System**: Dynamic content with data interpolation
- **Error Handling**: Comprehensive error logging and graceful failure
- **Email Verification**: Built-in SMTP connection testing
- **Batch Sending**: Support for sending emails to multiple recipients
- **Professional Templates**: Responsive HTML emails with branding

## Configuration

### Environment Variables

Add the following variables to your `.env` file:

```env
# SMTP Email Configuration
SMTP_HOST=mail.neoteam.ly
SMTP_PORT=465
SMTP_EMAIL=server@neoteam.ly
SMTP_PASSWORD=your_smtp_password
FROM_NAME=MyClinic

# Optional: Application URL for links in emails
APP_URL=https://myclinic.app
```

### SMTP Configuration Details

#### Port Options:
- **465** - SSL/TLS (secure, recommended)
- **587** - STARTTLS (secure)
- **25** - Non-encrypted (not recommended for production)

#### Common SMTP Providers:

**Gmail:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**Outlook/Hotmail:**
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_EMAIL=your-email@outlook.com
SMTP_PASSWORD=your-password
```

**Yahoo:**
```
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_EMAIL=your-email@yahoo.com
SMTP_PASSWORD=your-app-password
```

**Custom SMTP Server:**
```
SMTP_HOST=your-smtp-server.com
SMTP_PORT=465
SMTP_EMAIL=noreply@yourdomain.com
SMTP_PASSWORD=your-secure-password
```

## Usage Examples

### Basic Email Sending

```javascript
const sendEmail = require('../utils/sendEmail');

// Send registration verification email
await sendEmail({
    email: 'user@example.com',
    type: 'registration',
    data: {
        otp: '123456'
    }
});

// Send password reset email
await sendEmail({
    email: 'user@example.com',
    type: 'password-reset',
    data: {
        otp: '789012'
    }
});

// Send appointment reminder
await sendEmail({
    email: 'patient@example.com',
    type: 'appointment_reminder',
    data: {
        doctorName: 'Dr. Smith',
        appointmentDate: '2024-01-15 at 2:00 PM',
        hospitalName: 'City General Hospital',
        notes: 'Please bring previous X-rays'
    }
});
```

### Custom Email Content

```javascript
// Send custom email with HTML content
await sendEmail({
    email: 'user@example.com',
    subject: 'Custom Notification',
    html: '<h1>Custom HTML Content</h1><p>Your message here</p>',
    text: 'Plain text version of your message'
});
```

### Using EmailService Class

```javascript
const { EmailService } = require('../utils/sendEmail');

// Test SMTP connection
const result = await EmailService.verifyConnection();
console.log(result);

// Send batch emails
const results = await EmailService.sendBatchEmails([
    'user1@example.com',
    'user2@example.com',
    'user3@example.com'
], {
    type: 'welcome'
});
```

## File Structure

```
server/
├── utils/
│   └── sendEmail.js          # Main email utility
├── services/
│   ├── accountDisableService.js   # Uses email templates
│   ├── externalNotificationService.js # Email notifications
│   └── doctorReminderService.js     # Appointment reminders
└── routes/
    ├── auth.js               # Registration & password reset
    ├── reports.js            # Medical report notifications
    └── users.js              # User management emails
```

## Integration Points

### 1. Authentication Routes (`routes/auth.js`)
- User registration verification
- Password reset OTP
- Account activation confirmations

### 2. Account Management (`services/accountDisableService.js`)
- Account disabled notifications
- Reactivation code delivery
- Reactivation confirmations

### 3. Medical Reports (`routes/reports.js`)
- Doctor-to-patient document notifications
- Medical file update alerts

### 4. External Notifications (`services/externalNotificationService.js`)
- Multi-channel notifications (Email, SMS, Push)
- User preference-based delivery

### 5. Appointment Reminders (`services/doctorReminderService.js`)
- Automated appointment reminders
- Schedule-based notifications

## Error Handling

The email service includes comprehensive error handling:

- **Connection Errors**: Automatic retry with exponential backoff
- **Authentication Failures**: Clear error messages for SMTP issues
- **Template Errors**: Graceful fallback to generic template
- **Rate Limiting**: Respects SMTP server rate limits
- **Logging**: Detailed console logging for debugging

## Testing

### Manual Testing

1. **Test SMTP Connection:**
```javascript
const { EmailService } = require('./utils/sendEmail');
const result = await EmailService.verifyConnection();
console.log(result);
```

2. **Test Individual Email:**
```javascript
const sendEmail = require('./utils/sendEmail');
await sendEmail({
    email: 'test@example.com',
    type: 'registration',
    data: { otp: '123456' }
});
```

### Automated Testing

Create test files to verify email functionality:

```javascript
// test/email.test.js
const sendEmail = require('../utils/sendEmail');

describe('Email Service', () => {
    test('should send registration email', async () => {
        const result = await sendEmail({
            email: 'test@example.com',
            type: 'registration',
            data: { otp: '123456' }
        });
        expect(result.success).toBe(true);
    });
});
```

## Troubleshooting

### Common Issues

1. **SMTP Connection Failed**
   - Check SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD
   - Verify firewall settings
   - Test with telnet: `telnet SMTP_HOST SMTP_PORT`

2. **Authentication Error**
   - Ensure SMTP_EMAIL and SMTP_PASSWORD are correct
   - For Gmail, use App Passwords instead of regular passwords
   - Check if 2FA is enabled on the email account

3. **Emails Not Being Received**
   - Check spam/junk folders
   - Verify recipient email addresses
   - Check SMTP provider's sending limits
   - Ensure domain reputation is good

4. **Template Rendering Issues**
   - Check data parameters match template expectations
   - Verify HTML content is properly formatted
   - Test with simple generic template first

### Debug Mode

Enable detailed logging by setting debug mode in your environment:

```javascript
// Add to your application startup
process.env.NODE_ENV = 'development';
```

## Security Considerations

1. **SMTP Credentials**: Never commit `.env` files to version control
2. **Email Content**: Sanitize dynamic content to prevent injection attacks
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Template Security**: Escape user-generated content in templates
5. **SPF/DKIM**: Configure proper email authentication for your domain

## Performance Optimization

1. **Connection Pooling**: Nodemailer automatically pools connections
2. **Batch Sending**: Use `sendBatchEmails` for multiple recipients
3. **Template Caching**: Templates are cached in memory for performance
4. **Async Operations**: All email operations are non-blocking
5. **Queue Management**: Consider using a job queue for high-volume scenarios

## Support

For issues or questions about the email implementation:

1. Check the console logs for detailed error messages
2. Verify SMTP configuration in `.env` file
3. Test SMTP connection using the built-in verification
4. Review template data requirements for each email type
5. Check network connectivity and firewall settings

## Future Enhancements

Potential improvements for the email system:

- [ ] Email queue with Redis/Bull for high-volume scenarios
- [ ] Template versioning and A/B testing
- [ ] Email analytics and delivery tracking
- [ ] Multilingual email templates
- [ ] Email template editor UI
- [ ] SMTP provider failover
- [ ] Email bounce handling
- [ ] Unsubscribe management
- [ ] Email scheduling/delayed sending

---

**Note**: This email system is production-ready and includes all necessary features for a healthcare application. The templates are professional, responsive, and include proper error handling and retry logic.