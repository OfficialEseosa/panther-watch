package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.repository.UserRepository;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private WatchedClassRepository watchedClassRepository;

    public User findById(UUID id) {
        return userRepository.findById(id).orElse(null);
    }
    
    /**
     * Resolves the PantherWatch user for a Google sign-in. Matches on email so that
     * users who existed under the old Supabase auth keep their account (and their
     * existing user_id / related data) — we just backfill the Google subject and
     * refresh the profile. Brand-new emails get a fresh app-generated UUID and a
     * welcome email.
     */
    @Transactional
    public User upsertGoogleUser(String googleSub, String email, String name, String picture) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Google profile is missing an email");
        }

        User existing = userRepository.findByEmail(email).orElse(null);
        if (existing != null) {
            existing.setGoogleSub(googleSub);
            if (name != null) existing.setName(name);
            if (picture != null) existing.setPicture(picture);
            return userRepository.save(existing);
        }

        User user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .name(name)
                .picture(picture)
                .googleSub(googleSub)
                .build();

        User savedUser = userRepository.save(user);

        try {
            String firstName = name != null && !name.trim().isEmpty()
                    ? name.trim().split("\\s+")[0]
                    : email.split("@")[0];
            emailService.sendWelcomeEmail(email, firstName);
            logger.info("Welcome email sent to new user: {}", email);
        } catch (Exception e) {
            logger.error("Failed to send welcome email to {}: {}", email, e.getMessage(), e);
        }

        return savedUser;
    }

    @Transactional
    public void deleteUserAccount(User user) {
        if (user == null) {
            throw new IllegalArgumentException("User cannot be null when deleting account");
        }

        String email = user.getEmail();
        String name = user.getName();
        String firstName = null;
        if (name != null && !name.trim().isEmpty()) {
            firstName = name.trim().split("\\s+")[0];
        } else if (email != null && email.contains("@")) {
            firstName = email.split("@")[0];
        }

        try {
            logger.info("Deleting account and related data for user {}", user.getEmail());
            watchedClassRepository.deleteAllByUser(user);
            userRepository.delete(user);
            logger.info("Successfully deleted account from database for user {}", user.getEmail());
        } catch (Exception e) {
            logger.error("Failed to delete user account from database for {}: {}", user.getEmail(), e.getMessage(), e);
            throw new RuntimeException("Failed to delete user account");
        }

        try {
            emailService.sendAccountDeletionEmail(email, firstName);
        } catch (Exception e) {
            logger.warn("Account deletion confirmation email failed for {}: {}", email, e.getMessage(), e);
        }
    }
}
