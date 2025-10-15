package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.repository.UserRepository;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import io.jsonwebtoken.Claims;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;

@Service
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private SupabaseAuthService supabaseAuthService;
    
    @Autowired
    private EmailService emailService;

    @Autowired
    private WatchedClassRepository watchedClassRepository;

    public User findByAuthUserId(UUID authUserId) {
        return userRepository.findById(authUserId).orElse(null);
    }

    public User findById(UUID id) {
        return userRepository.findById(id).orElse(null);
    }
    
    public User createFromSupabaseAuth(UUID authUserId, String email, String token) {
        try {
            Claims claims = supabaseAuthService.validateJWT(token);

            @SuppressWarnings("unchecked")
            Map<String, Object> userMetadata = (Map<String, Object>) claims.get("user_metadata");
            String name = userMetadata != null ? (String) userMetadata.get("full_name") : null;
            String picture = userMetadata != null ? (String) userMetadata.get("avatar_url") : null;
            
            User user = User.builder()
                    .id(authUserId)
                    .email(email)
                    .name(name)
                    .picture(picture)
                    .build();
            
            User savedUser = userRepository.save(user);

            try {
                String firstName = name != null && !name.trim().isEmpty() ? 
                    name.trim().split("\\s+")[0] :
                    email.split("@")[0];
                
                emailService.sendWelcomeEmail(email, firstName);
                logger.info("Welcome email sent to new user: {}", email);
            } catch (Exception e) {
                logger.error("Failed to send welcome email to {}: {}", email, e.getMessage(), e);
            }
            
            return savedUser;
            
        } catch (Exception e) {
            logger.error("Failed to create user from Supabase auth for user {}: {}", authUserId, e.getMessage(), e);
            throw new RuntimeException("Failed to create user account");
        }
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
            logger.info("Successfully deleted account for user {}", user.getEmail());
        } catch (Exception e) {
            logger.error("Failed to delete user account for {}: {}", user.getEmail(), e.getMessage(), e);
            throw new RuntimeException("Failed to delete user account");
        }

        try {
            emailService.sendAccountDeletionEmail(email, firstName);
        } catch (Exception e) {
            logger.warn("Account deletion confirmation email failed for {}: {}", email, e.getMessage(), e);
        }
    }
}
