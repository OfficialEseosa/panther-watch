package edu.gsu.pantherwatch.pantherwatch.service;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import edu.gsu.pantherwatch.pantherwatch.model.EmailLog;
import edu.gsu.pantherwatch.pantherwatch.repository.EmailLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

@Service
@Slf4j
public class EmailService {

    private final Resend resend;
    private final EmailLogRepository emailLogRepository;

    public EmailService(@Value("${resend.api.key}") String apiKey, EmailLogRepository emailLogRepository) {
        this.resend = new Resend(apiKey);
        this.emailLogRepository = emailLogRepository;
    }

    private String loadEmailTemplate(String templateName) {
        try {
            ClassPathResource resource = new ClassPathResource("templates/email/" + templateName);
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to load email template: {}", templateName, e);
            throw new RuntimeException("Failed to load email template: " + templateName, e);
        }
    }

    private String loadEmailTemplateWithCSS(String templateName, String cssName) {
        try {
            String htmlTemplate = loadEmailTemplate(templateName);
            String cssContent = loadEmailTemplate(cssName);

            cssContent = cssContent.replace("%", "%%");

            String cssLinkPattern = "<link rel=\"stylesheet\" href=\"" + cssName + "\">";
            String inlineCSS = "<style>\n" + cssContent + "\n    </style>";
            
            return htmlTemplate.replace(cssLinkPattern, inlineCSS);
        } catch (Exception e) {
            log.error("Failed to load email template with CSS: {} + {}", templateName, cssName, e);
            throw new RuntimeException("Failed to load email template with CSS", e);
        }
    }

    public void sendClassAvailabilityNotification(String toEmail, String userName, String courseTitle, 
                                                String courseNumber, String subject, String crn, String term) {
        try {
            String htmlContent = buildClassAvailabilityEmail(userName, courseTitle, courseNumber, subject, crn, term);
            
            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@class.pantherwatch.app>")
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
                    .from("PantherWatch <no-reply@class.pantherwatch.app>")
                    .to(toEmail)
                    .subject(subject)
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Custom email sent successfully to {} with ID: {}", toEmail, data.getId());
            
        } catch (ResendException e) {
            log.error("Failed to send custom email to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send custom email: " + e.getMessage(), e);
        }
    }

    /**
     * Checks if an email of the specified type was recently sent to the given email address
     * @param email The recipient email address
     * @param emailType The type of email (WELCOME, GOODBYE)
     * @return true if email was sent within the last 7 days, false otherwise
     */
    private boolean wasEmailRecentlySent(String email, EmailLog.EmailType emailType) {
        LocalDateTime oneWeekAgo = LocalDateTime.now().minusWeeks(1);
        return emailLogRepository.findRecentEmailByTypeAndEmail(email, emailType, oneWeekAgo).isPresent();
    }

    /**
     * Logs an email that was successfully sent
     * @param email The recipient email address
     * @param emailType The type of email
     * @param subject The email subject
     */
    private void logEmailSent(String email, EmailLog.EmailType emailType, String subject) {
        try {
            EmailLog emailLog = EmailLog.builder()
                    .email(email)
                    .emailType(emailType)
                    .subject(subject)
                    .sentAt(LocalDateTime.now())
                    .build();
            emailLogRepository.save(emailLog);
            log.debug("Email log saved for {} - {} email", email, emailType);
        } catch (Exception e) {
            log.warn("Failed to log sent email for {} - {}: {}", email, emailType, e.getMessage());
            // Don't throw exception here as email was already sent successfully
        }
    }

    public void sendWelcomeEmail(String toEmail, String firstName) {
        // Check if welcome email was recently sent to prevent spam
        if (wasEmailRecentlySent(toEmail, EmailLog.EmailType.WELCOME)) {
            log.info("Skipping welcome email to {} - already sent within the last week", toEmail);
            return;
        }

        try {
            String htmlContent = buildWelcomeEmail(firstName);
            String subject = "🎉 Welcome to PantherWatch!";
            
            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@class.pantherwatch.app>")
                    .to(toEmail)
                    .subject(subject)
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Welcome email sent successfully to {} with ID: {}", toEmail, data.getId());
            
            // Log the successful email send
            logEmailSent(toEmail, EmailLog.EmailType.WELCOME, subject);
            
        } catch (ResendException e) {
            log.error("Failed to send welcome email to {}: {}", toEmail, e.getMessage(), e);
            log.warn("User registration will continue despite welcome email failure");
        }
    }

    public void sendAccountDeletionEmail(String toEmail, String firstName) {
        // Check if goodbye email was recently sent to prevent spam
        if (wasEmailRecentlySent(toEmail, EmailLog.EmailType.GOODBYE)) {
            log.info("Skipping goodbye email to {} - already sent within the last week", toEmail);
            return;
        }

        try {
            String htmlContent = buildAccountDeletionEmail(firstName);
            String subject = "We're sorry to see you go";

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@class.pantherwatch.app>")
                    .to(toEmail)
                    .subject(subject)
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Account deletion email sent successfully to {} with ID: {}", toEmail, data.getId());

            // Log the successful email send
            logEmailSent(toEmail, EmailLog.EmailType.GOODBYE, subject);

        } catch (ResendException e) {
            log.error("Failed to send account deletion email to {}: {}", toEmail, e.getMessage(), e);
            log.warn("Account deletion completed but farewell email could not be delivered");
        }
    }

    private String buildClassAvailabilityEmail(String userName, String courseTitle, String courseNumber, 
                                             String subject, String crn, String term) {
        String htmlTemplate = loadEmailTemplateWithCSS("class-availability.html", "class-availability.css");
        return String.format(htmlTemplate, userName, courseTitle, subject, courseNumber, crn, term, crn);
    }

    private String buildCustomEmail(String userName, String message) {
        String htmlTemplate = loadEmailTemplateWithCSS("custom.html", "custom.css");
        return String.format(htmlTemplate, message);
    }

    private String buildWelcomeEmail(String firstName) {
        String htmlTemplate = loadEmailTemplateWithCSS("welcome.html", "welcome.css");
        return String.format(htmlTemplate, firstName);
    }

    private String buildAccountDeletionEmail(String firstName) {
        String nameForTemplate = firstName != null && !firstName.isBlank() ? firstName : "there";
        String htmlTemplate = loadEmailTemplateWithCSS("account-goodbye.html", "account-goodbye.css");
        return String.format(htmlTemplate, nameForTemplate);
    }

    /**
     * Get email usage statistics for monitoring quota
     * @return Map containing daily and monthly email counts
     */
    public java.util.Map<String, Long> getEmailUsageStats() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        LocalDateTime oneMonthAgo = LocalDateTime.now().minusMonths(1);
        
        long dailyCount = emailLogRepository.countEmailsSentSince(oneDayAgo);
        long monthlyCount = emailLogRepository.countEmailsSentSince(oneMonthAgo);
        
        java.util.Map<String, Long> stats = new java.util.HashMap<>();
        stats.put("dailyCount", dailyCount);
        stats.put("monthlyCount", monthlyCount);
        stats.put("dailyRemaining", Math.max(0, 100 - dailyCount));
        stats.put("monthlyRemaining", Math.max(0, 3000 - monthlyCount));
        
        return stats;
    }

    /**
     * Scheduled cleanup task to remove email logs older than a week
     * Runs daily at 2:00 AM to clean up old logs that are no longer needed for spam prevention
     */
    @Scheduled(cron = "0 0 2 * * *")
    public void cleanupOldEmailLogs() {
        performCleanup();
    }

    /**
     * Manual cleanup method that can be called immediately
     * @return number of email logs deleted
     */
    public int cleanupOldEmailLogsNow() {
        return performCleanup();
    }

    /**
     * Internal method to perform the actual cleanup
     * @return number of email logs deleted
     */
    private int performCleanup() {
        try {
            LocalDateTime oneWeekAgo = LocalDateTime.now().minusWeeks(1);
            int deletedCount = emailLogRepository.deleteEmailLogsOlderThan(oneWeekAgo);
            
            if (deletedCount > 0) {
                log.info("Cleaned up {} old email logs older than one week", deletedCount);
            } else {
                log.debug("No old email logs to clean up");
            }
            
            return deletedCount;
        } catch (Exception e) {
            log.error("Failed to clean up old email logs: {}", e.getMessage(), e);
            return 0;
        }
    }
}
