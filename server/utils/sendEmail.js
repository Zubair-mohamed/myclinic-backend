const nodemailer = require('nodemailer');

/**
 * Email utility for sending emails via SMTP
 * Supports various email types with proper templates and error handling
 */
class EmailService {
    static transporter = null;
    static isInitialized = false;

    /**
     * Initialize the email transporter
     */
    static initializeTransporter() {
        if (this.isInitialized) {
            return;
        }

        // Check if SMTP configuration exists
        const { SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD } = process.env;
        
        if (!SMTP_HOST || !SMTP_PORT || !SMTP_EMAIL || !SMTP_PASSWORD) {
            console.warn('⚠️ SMTP configuration missing. Email functionality will be disabled.');
            console.warn('Please configure SMTP_HOST, SMTP_PORT, SMTP_EMAIL, and SMTP_PASSWORD in .env');
            return;
        }

        try {
            // Create transporter based on port
            const port = parseInt(SMTP_PORT);
            const isSecure = port === 465; // Port 465 typically uses SSL
            
            this.transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port: port,
                secure: isSecure, // true for 465, false for other ports
                auth: {
                    user: SMTP_EMAIL,
                    pass: SMTP_PASSWORD
                },
                // Timeouts to avoid long hangs when SMTP is slow/misconfigured
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 10000,
                // Additional configuration for better deliverability
                pool: true, // Use pooled connections
                maxConnections: 5, // Maximum number of simultaneous connections
                maxMessages: 100, // Maximum messages per connection
                rateDelta: 1000, // Rate limiting window in ms
                rateLimit: 5, // Maximum number of messages per rateDelta
            });

            this.isInitialized = true;
            console.log('✅ Email transporter initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize email transporter:', error.message);
            throw error;
        }
    }

    /**
     * Get email template for different types
     * @param {String} type - Email type ('registration', 'password-reset', 'welcome', etc.)
     * @param {Object} data - Template data
     * @returns {Object} - { subject, html, text }
     */
    static getEmailTemplate(type, data = {}) {
        const fromName = process.env.FROM_NAME || 'MyClinic';
        const appUrl = process.env.APP_URL || 'https://myclinic.app';
        
        const templates = {
            registration: {
                subject: `${fromName} - Verify Your Account`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Welcome to ${fromName}!</h2>
                            <p>Thank you for registering with us. To complete your account setup, please use the following verification code:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <div style="display: inline-block; background: #006FEE; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
                                    ${data.otp}
                                </div>
                            </div>
                            <p style="color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
                            <p style="color: #666; font-size: 14px;">If you didn't create this account, please ignore this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Welcome to ${fromName}!
                    
                    Please use the following code to verify your account: ${data.otp}
                    
                    This code will expire in 10 minutes.
                    
                    If you didn't create this account, please ignore this email.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            'password-reset': {
                subject: `${fromName} - Password Reset Code`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
                            <p>We received a request to reset your password. Your verification code is:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <div style="display: inline-block; background: #006FEE; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
                                    ${data.otp}
                                </div>
                            </div>
                            <p style="color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
                            <p style="color: #666; font-size: 14px;">If you didn't request a password reset, please ignore this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Password Reset Request
                    
                    Your verification code is: ${data.otp}
                    
                    This code will expire in 10 minutes.
                    
                    If you didn't request a password reset, please ignore this email.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            welcome: {
                subject: `${fromName} - Welcome Aboard!`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Welcome to ${fromName}!</h2>
                            <p>Congratulations! Your account has been successfully verified and is now active.</p>
                            <p>You can now access all the features of ${fromName}, including:</p>
                            <ul style="color: #666;">
                                <li>Book appointments with healthcare providers</li>
                                <li>Manage your medical records</li>
                                <li>Receive medication reminders</li>
                                <li>Track your health analytics</li>
                            </ul>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${appUrl}" style="display: inline-block; background: #006FEE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                    Get Started
                                </a>
                            </div>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Welcome to ${fromName}!
                    
                    Congratulations! Your account has been successfully verified and is now active.
                    
                    You can now access all the features of ${fromName}, including:
                    - Book appointments with healthcare providers
                    - Manage your medical records
                    - Receive medication reminders
                    - Track your health analytics
                    
                    Visit: ${appUrl}
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            appointment_reminder: {
                subject: `${fromName} - Appointment Reminder`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Appointment Reminder</h2>
                            <p>This is a reminder for your upcoming appointment:</p>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #006FEE;">
                                <p style="margin: 5px 0;"><strong>Doctor:</strong> ${data.doctorName}</p>
                                <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${data.appointmentDate}</p>
                                <p style="margin: 5px 0;"><strong>Location:</strong> ${data.hospitalName}</p>
                                ${data.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${data.notes}</p>` : ''}
                            </div>
                            <p style="color: #666; font-size: 14px;">Please arrive 15 minutes early for check-in.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Appointment Reminder
                    
                    Doctor: ${data.doctorName}
                    Date & Time: ${data.appointmentDate}
                    Location: ${data.hospitalName}
                    ${data.notes ? `Notes: ${data.notes}` : ''}
                    
                    Please arrive 15 minutes early for check-in.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            account_disabled: {
                subject: `${fromName} - Account Disabled`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Account Disabled</h2>
                            <p>Your ${fromName} account has been disabled.</p>
                            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
                            <p>You will not be able to access your account or receive notifications while it is disabled.</p>
                            <p>To reactivate your account, please contact support or use the account reactivation feature.</p>
                            <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification. Please do not reply to this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Account Disabled
                    
                    Your ${fromName} account has been disabled.
                    ${data.reason ? `Reason: ${data.reason}` : ''}
                    You will not be able to access your account or receive notifications while it is disabled.
                    To reactivate your account, please contact support or use the account reactivation feature.
                    
                    This is an automated notification. Please do not reply to this email.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            account_reactivation_code: {
                subject: `${fromName} - Account Reactivation Code`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Account Reactivation Request</h2>
                            <p>You have requested to reactivate your account. Please use the following verification code to confirm:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <div style="display: inline-block; background: #006FEE; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
                                    ${data.otp}
                                </div>
                            </div>
                            <p><strong>This code will expire in 10 minutes.</strong></p>
                            <p>If you did not request this code, please ignore this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Account Reactivation Request
                    
                    You have requested to reactivate your account. Please use the following verification code to confirm: ${data.otp}
                    
                    This code will expire in 10 minutes.
                    
                    If you did not request this code, please ignore this email.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            account_reactivated: {
                subject: `${fromName} - Account Reactivated`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">Account Reactivated</h2>
                            <p>Your ${fromName} account has been successfully reactivated.</p>
                            ${data.byAdmin ? `<p>Your account was reactivated by an administrator.</p>` : ''}
                            <p>You can now log in and access all features.</p>
                            <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification. Please do not reply to this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    Account Reactivated
                    
                    Your ${fromName} account has been successfully reactivated.
                    ${data.byAdmin ? 'Your account was reactivated by an administrator.' : ''}
                    You can now log in and access all features.
                    
                    This is an automated notification. Please do not reply to this email.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            medical_report: {
                subject: `${fromName} - New Medical Report: ${data.title || 'Document Available'}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #333; margin-top: 0;">New Document Added to Your Medical File</h2>
                            <p>${data.doctorName ? `Dr. ${data.doctorName} has` : 'A healthcare provider has'} uploaded a new report or prescription to your file.</p>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #006FEE;">
                                <p style="margin: 5px 0;"><strong>Title:</strong> ${data.title}</p>
                                ${data.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${data.description}</p>` : ''}
                                <p style="margin: 5px 0;"><strong>Date:</strong> ${data.date || new Date().toLocaleDateString()}</p>
                            </div>
                            <p>Please log in to your ${fromName} portal to view and download the full document.</p>
                            <p style="font-size: 12px; color: #888;">This is an automated message from ${fromName}.</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: `
                    New Document Added to Your Medical File
                    
                    ${data.doctorName ? `Dr. ${data.doctorName} has` : 'A healthcare provider has'} uploaded a new report or prescription to your file.
                    
                    Title: ${data.title}
                    ${data.description ? `Description: ${data.description}` : ''}
                    Date: ${data.date || new Date().toLocaleDateString()}
                    
                    Please log in to your ${fromName} portal to view and download the full document.
                    
                    This is an automated message from ${fromName}.
                    
                    © 2024 ${fromName}. All rights reserved.
                `
            },
            generic: {
                subject: data.subject || `${fromName} Notification`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #006FEE; margin: 0;">${fromName}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                            ${data.html || `<p>${data.message || 'You have a new notification.'}</p>`}
                        </div>
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px;">© 2024 ${fromName}. All rights reserved.</p>
                        </div>
                    </div>
                `,
                text: data.message || 'You have a new notification.'
            }
        };

        return templates[type] || templates.generic;
    }

    /**
     * Send email with retry logic
     * @param {Object} options - Email options
     * @param {String} options.email - Recipient email
     * @param {String} options.subject - Email subject
     * @param {String} options.html - HTML content
     * @param {String} options.text - Plain text content
     * @param {String} options.type - Email type for template
     * @param {Object} options.data - Template data
     * @param {Number} retries - Number of retry attempts
     * @returns {Promise<Object>} - Result object
     */
    static async sendEmail(options = {}, retries = 2) {
        // Initialize transporter if not already done
        if (!this.isInitialized) {
            this.initializeTransporter();
        }

        if (!this.transporter) {
            throw new Error('Email service not initialized. Please check SMTP configuration.');
        }

        const { email, subject, html, text, type = 'generic', data = {} } = options;

        if (!email) {
            throw new Error('Recipient email is required');
        }

        try {
            // Get email template if type is specified and no custom content provided
            let emailContent;
            if (type && !html && !subject) {
                emailContent = this.getEmailTemplate(type, data);
            } else {
                emailContent = {
                    subject: subject || data.subject || `${process.env.FROM_NAME || 'MyClinic'} Notification`,
                    html: html || data.html || data.message || 'You have a new notification.',
                    text: text || data.text || data.message || 'You have a new notification.'
                };
            }

            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'MyClinic'}" <${process.env.SMTP_EMAIL}>`,
                to: email,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
                // Additional headers for better deliverability
                headers: {
                    'X-Message-Category': type,
                    'X-Priority': '3',
                    'X-MSMail-Priority': 'Normal'
                }
            };

            console.log(`📧 Sending ${type} email to ${email}...`);
            
            const result = await this.transporter.sendMail(mailOptions);
            
            console.log(`✅ Email sent successfully to ${email}: ${result.messageId}`);
            
            return {
                success: true,
                messageId: result.messageId,
                type: type
            };

        } catch (error) {
            console.error(`❌ Email send error to ${email}:`, error.message);

            // Retry logic
            if (retries > 0) {
                console.log(`🔄 Retrying email to ${email} (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                return this.sendEmail(options, retries - 1);
            }

            throw new Error(`Failed to send email after retries: ${error.message}`);
        }
    }

    /**
     * Send batch emails
     * @param {Array} emails - Array of email addresses
     * @param {Object} options - Email options
     * @returns {Promise<Object>} - Batch result
     */
    static async sendBatchEmails(emails, options = {}) {
        const results = {
            total: emails.length,
            successful: 0,
            failed: 0,
            details: []
        };

        for (const email of emails) {
            try {
                const result = await this.sendEmail({ ...options, email });
                if (result.success) {
                    results.successful++;
                } else {
                    results.failed++;
                }
                results.details.push({ email, ...result });
            } catch (error) {
                results.failed++;
                results.details.push({ 
                    email, 
                    success: false, 
                    error: error.message 
                });
            }
        }

        return results;
    }

    /**
     * Verify SMTP connection
     * @returns {Promise<Object>} - Verification result
     */
    static async verifyConnection() {
        try {
            if (!this.isInitialized) {
                this.initializeTransporter();
            }

            if (!this.transporter) {
                return { success: false, error: 'Email service not initialized' };
            }

            await this.transporter.verify();
            return { success: true, message: 'SMTP connection verified successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Initialize the email service
EmailService.initializeTransporter();

// Export both the class and a convenience function for backward compatibility
const sendEmailFunction = (options) => EmailService.sendEmail(options);
module.exports = sendEmailFunction;
module.exports.EmailService = EmailService;
module.exports.sendEmail = sendEmailFunction;