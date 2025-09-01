package edu.gsu.pantherwatch.pantherwatch.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class SupabaseAuthService {
    
    private static final Logger logger = LoggerFactory.getLogger(SupabaseAuthService.class);
    
    @Value("${supabase.jwt.secret}")
    private String jwtSecret;
    
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
}
