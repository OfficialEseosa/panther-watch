package edu.gsu.pantherwatch.pantherwatch.service;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class EmailService {

    private final Resend resend;

    public EmailService(@Value("${resend.api.key}") String apiKey) {
        this.resend = new Resend(apiKey);
    }

    public void sendClassAvailabilityNotification(String toEmail, String userName, String courseTitle, 
                                                String courseNumber, String subject, String crn, String term) {
        try {
            String htmlContent = buildClassAvailabilityEmail(userName, courseTitle, courseNumber, subject, crn, term);
            
            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@pantherwatch.app>")
                    .to(toEmail)
                    .subject("🎉 Class Spot Available: " + subject + " " + courseNumber)
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Email sent successfully to {} for course {} with ID: {}", toEmail, crn, data.getId());
            
        } catch (ResendException e) {
            log.error("Failed to send email to {} for course {}: {}", toEmail, crn, e.getMessage(), e);
            throw new RuntimeException("Failed to send email notification", e);
        }
    }

    public void sendCustomEmail(String toEmail, String userName, String subject, String message) {
        try {
            String htmlContent = buildCustomEmail(userName, message);
            
            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@pantherwatch.app>")
                    .to(toEmail)
                    .subject(subject)
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Custom email sent successfully to {} with ID: {}", toEmail, data.getId());
            
        } catch (ResendException e) {
            log.error("Failed to send custom email to {}: {}", toEmail, e.getMessage(), e);
            throw new RuntimeException("Failed to send custom email", e);
        }
    }

    private String buildClassAvailabilityEmail(String userName, String courseTitle, String courseNumber, 
                                             String subject, String crn, String term) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Class Spot Available</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                    
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f8fafc;
                    }
                    
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 12px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                        overflow: hidden;
                        margin-top: 20px;
                        margin-bottom: 20px;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                    }
                    
                    .header h1 {
                        margin: 0;
                        font-size: 28px;
                        font-weight: 700;
                    }
                    
                    .header p {
                        margin: 8px 0 0 0;
                        font-size: 16px;
                        opacity: 0.9;
                    }
                    
                    .content {
                        padding: 40px 30px;
                    }
                    
                    .greeting {
                        font-size: 18px;
                        font-weight: 500;
                        margin-bottom: 20px;
                        color: #1f2937;
                    }
                    
                    .course-card {
                        background-color: #f9fafb;
                        border: 2px solid #e5e7eb;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 20px 0;
                    }
                    
                    .course-title {
                        font-size: 20px;
                        font-weight: 600;
                        color: #1f2937;
                        margin-bottom: 10px;
                    }
                    
                    .course-details {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    
                    .detail-item {
                        font-size: 14px;
                    }
                    
                    .detail-label {
                        font-weight: 500;
                        color: #6b7280;
                        margin-right: 5px;
                    }
                    
                    .detail-value {
                        color: #1f2937;
                        font-weight: 400;
                    }
                    
                    .cta-button {
                        display: inline-block;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        padding: 12px 24px;
                        border-radius: 6px;
                        font-weight: 500;
                        text-align: center;
                        margin: 20px 0;
                        transition: transform 0.2s;
                    }
                    
                    .cta-button:hover {
                        transform: translateY(-1px);
                    }
                    
                    .footer {
                        background-color: #f9fafb;
                        padding: 20px 30px;
                        text-align: center;
                        border-top: 1px solid #e5e7eb;
                    }
                    
                    .footer p {
                        margin: 5px 0;
                        font-size: 14px;
                        color: #6b7280;
                    }
                    
                    .urgent-badge {
                        background-color: #dc2626;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Class Spot Available!</h1>
                        <p>A spot just opened up in your watched class</p>
                    </div>
                    
                    <div class="content">
                        <div class="greeting">
                            Hi %s! 👋
                        </div>
                        
                        <p>Great news! A spot has just become available in the class you've been watching. 
                           <span class="urgent-badge">Act Fast</span> - spots fill up quickly!</p>
                        
                        <div class="course-card">
                            <div class="course-title">%s</div>
                            <div class="course-details">
                                <div class="detail-item">
                                    <span class="detail-label">Course:</span>
                                    <span class="detail-value">%s %s</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">CRN:</span>
                                    <span class="detail-value">%s</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Term:</span>
                                    <span class="detail-value">%s</span>
                                </div>
                            </div>
                        </div>
                        
                        <p>🚀 <strong>What to do next:</strong></p>
                        <ol>
                            <li>Log into GoSolar immediately</li>
                            <li>Search for CRN <strong>%s</strong></li>
                            <li>Register for the class before someone else does!</li>
                        </ol>
                        
                        <a href="https://gosolar.gsu.edu" class="cta-button">Go to GoSolar →</a>
                        
                        <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                            ⏰ <em>This notification was sent because the waitlist for this class dropped to zero. 
                            We'll continue monitoring this class for you.</em>
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p><strong>PantherWatch</strong> - Your GSU Class Monitoring Service</p>
                        <p>Keeping Georgia State students ahead of the registration game</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(userName, courseTitle, subject, courseNumber, crn, term, crn);
    }

    private String buildCustomEmail(String userName, String message) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Message from PantherWatch</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                    
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f8fafc;
                    }
                    
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 12px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                        overflow: hidden;
                        margin-top: 20px;
                        margin-bottom: 20px;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                    }
                    
                    .header h1 {
                        margin: 0;
                        font-size: 28px;
                        font-weight: 700;
                    }
                    
                    .content {
                        padding: 40px 30px;
                    }
                    
                    .greeting {
                        font-size: 18px;
                        font-weight: 500;
                        margin-bottom: 20px;
                        color: #1f2937;
                    }
                    
                    .message-content {
                        background-color: #f9fafb;
                        border-left: 4px solid #667eea;
                        padding: 20px;
                        margin: 20px 0;
                        border-radius: 0 8px 8px 0;
                        white-space: pre-wrap;
                    }
                    
                    .footer {
                        background-color: #f9fafb;
                        padding: 20px 30px;
                        text-align: center;
                        border-top: 1px solid #e5e7eb;
                    }
                    
                    .footer p {
                        margin: 5px 0;
                        font-size: 14px;
                        color: #6b7280;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📧 Message from PantherWatch</h1>
                    </div>
                    
                    <div class="content">
                        <div class="greeting">
                            Hi %s! 👋
                        </div>
                        
                        <div class="message-content">
                            %s
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p><strong>PantherWatch</strong> - Your GSU Class Monitoring Service</p>
                        <p>Keeping Georgia State students ahead of the registration game</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(userName, message);
    }
}
