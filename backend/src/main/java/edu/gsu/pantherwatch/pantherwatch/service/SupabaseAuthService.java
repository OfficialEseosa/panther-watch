package edu.gsu.pantherwatch.pantherwatch.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.util.UUID;

@Service
public class SupabaseAuthService {
    
    @Value("${supabase.jwt.secret}")
    private String jwtSecret;
    
    public Claims validateJWT(String token) {
        try {
            SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes());
            
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (Exception e) {
            throw new RuntimeException("Invalid JWT token: " + e.getMessage());
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
