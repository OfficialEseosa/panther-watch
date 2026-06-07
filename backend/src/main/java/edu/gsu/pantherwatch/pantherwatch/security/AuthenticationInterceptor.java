package edu.gsu.pantherwatch.pantherwatch.security;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.JwtService;
import edu.gsu.pantherwatch.pantherwatch.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import java.util.UUID;

@Component
public class AuthenticationInterceptor implements HandlerInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(AuthenticationInterceptor.class);

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserService userService;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, 
                           @NonNull HttpServletResponse response, 
                           @NonNull Object handler) throws Exception {
        
        if ("OPTIONS".equals(request.getMethod())) {
            return true;
        }

        String authHeader = request.getHeader("Authorization");
        logger.debug("Auth header received: {}", authHeader != null ? "Bearer [REDACTED]" : "null");
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            logger.warn("Missing or invalid authorization header for request: {}", request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\": false, \"message\": \"Missing or invalid authorization header\"}");
            return false;
        }

        try {
            String token = authHeader.replace("Bearer ", "");
            logger.debug("Attempting to validate token for request: {}", request.getRequestURI());
            UUID userId = jwtService.getUserIdFromToken(token);

            // The user row is always created during the OAuth callback, so a valid token
            // must map to an existing user. If it doesn't, treat the token as invalid.
            User user = userService.findById(userId);
            if (user == null) {
                logger.warn("Valid token for unknown user {} on {}", userId, request.getRequestURI());
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.getWriter().write("{\"success\": false, \"message\": \"Invalid or expired token\"}");
                return false;
            }

            request.setAttribute("currentUser", user);
            logger.debug("Authentication successful for user: {}", user.getEmail());
            return true;
            
        } catch (Exception e) {
            logger.error("Authentication failed for request {}: {}", request.getRequestURI(), e.getMessage());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\": false, \"message\": \"Invalid or expired token\"}");
            return false;
        }
    }
}
