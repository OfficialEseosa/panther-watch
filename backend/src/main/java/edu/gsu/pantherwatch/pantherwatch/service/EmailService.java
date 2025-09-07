package edu.gsu.pantherwatch.pantherwatch.service;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Service
@Slf4j
public class EmailService {

    private final Resend resend;

    public EmailService(@Value("${resend.api.key}") String apiKey) {
        this.resend = new Resend(apiKey);
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

    public void sendWelcomeEmail(String toEmail, String firstName) {
        try {
            String htmlContent = buildWelcomeEmail(firstName);
            
            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("PantherWatch <no-reply@class.pantherwatch.app>")
                    .to(toEmail)
                    .subject("🎉 Welcome to PantherWatch!")
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
            log.info("Welcome email sent successfully to {} with ID: {}", toEmail, data.getId());
            
        } catch (ResendException e) {
            log.error("Failed to send welcome email to {}: {}", toEmail, e.getMessage(), e);
            log.warn("User registration will continue despite welcome email failure");
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
}
