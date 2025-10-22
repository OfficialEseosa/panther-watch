package edu.gsu.pantherwatch.pantherwatch.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class SupabaseAuthService {
    
    private static final Logger logger = LoggerFactory.getLogger(SupabaseAuthService.class);
    
    @Value("${supabase.jwt.secret}")
    private String jwtSecret;
    
    @Value("${supabase.url}")
    private String supabaseUrl;
    
    @Value("${supabase.service.role.key:}")
    private String serviceRoleKey;
    
    public Claims validateJWT(String token) {
        try {
            SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
            
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (Exception e) {
            logger.warn("JWT validation failed: {}", e.getMessage());
            throw new RuntimeException("Invalid JWT token");
        }
    }
    
    public UUID getUserIdFromToken(String token) {
        Claims claims = validateJWT(token);
        return UUID.fromString(claims.getSubject());
    }
    
    public String getEmailFromToken(String token) {
        Claims claims = validateJWT(token);
        return claims.get("email", String.class);
    }
    
    /**
     * Deletes a user from Supabase Auth system using the Admin API
     * @param userId The UUID of the user to delete
     * @return true if deletion was successful, false otherwise
     */
    public boolean deleteUserFromAuth(UUID userId) {
        if (serviceRoleKey == null || serviceRoleKey.trim().isEmpty()) {
            logger.warn("Supabase service role key not configured. Cannot delete user from auth system.");
            return false;
        }
        
        try {
            String deleteUrl = supabaseUrl + "/auth/v1/admin/users/" + userId.toString();
            
            RestTemplate restTemplate = new RestTemplate();
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + serviceRoleKey);
            headers.set("apikey", serviceRoleKey);
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            HttpEntity<String> entity = new HttpEntity<>(headers);
            
            restTemplate.exchange(deleteUrl, HttpMethod.DELETE, entity, String.class);
            
            logger.info("Successfully deleted user {} from Supabase auth", userId);
            return true;
        } catch (Exception e) {
            logger.error("Failed to delete user {} from Supabase auth: {}", userId, e.getMessage(), e);
            return false;
        }
    }
}
