package edu.gsu.pantherwatch.pantherwatch.security;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.SupabaseAuthService;
import edu.gsu.pantherwatch.pantherwatch.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import java.util.UUID;

@Component
public class AuthenticationInterceptor implements HandlerInterceptor {

    @Autowired
    private SupabaseAuthService supabaseAuthService;
    
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
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\": false, \"message\": \"Missing or invalid authorization header\"}");
            return false;
        }

        try {
            String token = authHeader.replace("Bearer ", "");
            UUID authUserId = supabaseAuthService.getUserIdFromToken(token);
            
            User user = userService.findByAuthUserId(authUserId);
            if (user == null) {
                String email = supabaseAuthService.getEmailFromToken(token);
                user = userService.createFromSupabaseAuth(authUserId, email, token);
            }
            
            request.setAttribute("currentUser", user);
            return true;
            
        } catch (Exception e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\": false, \"message\": \"Invalid or expired token\"}");
            return false;
        }
    }
}
