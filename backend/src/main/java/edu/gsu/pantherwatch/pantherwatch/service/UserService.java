package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.repository.UserRepository;
import io.jsonwebtoken.Claims;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
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
}
