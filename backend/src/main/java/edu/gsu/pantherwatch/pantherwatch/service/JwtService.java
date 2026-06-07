package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and validates PantherWatch's own HS256 JWTs. Replaces the Supabase-issued
 * tokens we used to trust (the old SupabaseAuthService has been retired).
 *
 * The token's subject is our own {@code users.user_id} (UUID). It also carries
 * email/name/picture so the frontend can render the user without an extra round-trip.
 */
@Service
public class JwtService {

    private static final Logger logger = LoggerFactory.getLogger(JwtService.class);

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    // Default ~30 days (in ms). Long-lived single token, stored in the browser's
    // localStorage and sent as a Bearer header (mirrors the previous Supabase flow).
    @Value("${app.jwt.expiration:2592000000}")
    private long jwtExpirationMs;

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(User user) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("email", user.getEmail())
                .claim("name", user.getName())
                .claim("picture", user.getPicture())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey())
                .compact();
    }

    public Claims validateToken(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(signingKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (Exception e) {
            logger.warn("JWT validation failed: {}", e.getMessage());
            throw new RuntimeException("Invalid JWT token");
        }
    }

    public UUID getUserIdFromToken(String token) {
        return UUID.fromString(validateToken(token).getSubject());
    }

    public String getEmailFromToken(String token) {
        return validateToken(token).get("email", String.class);
    }
}
