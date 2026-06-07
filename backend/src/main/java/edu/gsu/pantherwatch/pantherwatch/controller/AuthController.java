package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.GoogleOAuthService;
import edu.gsu.pantherwatch.pantherwatch.service.GoogleOAuthService.GoogleProfile;
import edu.gsu.pantherwatch.pantherwatch.service.JwtService;
import edu.gsu.pantherwatch.pantherwatch.service.UserService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * PantherWatch-owned Google sign-in. Replaces the Supabase OAuth flow so the consent
 * screen shows PantherWatch / pantherwatch.app instead of {@code <ref>.supabase.co}.
 *
 *   GET /api/auth/google/login    → redirect the browser to Google's consent screen
 *   GET /api/auth/google/callback → exchange code, upsert the user, issue our JWT,
 *                                    redirect back to the frontend with the token
 *
 * Both routes are interceptor-excluded (see WebMvcConfig {@code /api/auth/**}).
 */
@RestController
@RequestMapping("/api/auth/google")
@Slf4j
public class AuthController {

    private static final String STATE_COOKIE = "pw_oauth_state";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Autowired
    private GoogleOAuthService googleOAuthService;

    @Autowired
    private UserService userService;

    @Autowired
    private JwtService jwtService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @GetMapping("/login")
    public void login(HttpServletResponse response) throws java.io.IOException {
        String state = randomToken();

        // CSRF protection: stash the state in a short-lived httpOnly cookie and verify
        // it matches on the callback.
        Cookie stateCookie = new Cookie(STATE_COOKIE, state);
        stateCookie.setHttpOnly(true);
        stateCookie.setSecure(true);
        stateCookie.setPath("/");
        stateCookie.setMaxAge(600); // 10 minutes
        response.addCookie(stateCookie);

        response.sendRedirect(googleOAuthService.buildAuthorizeUrl(state));
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            HttpServletRequest request,
            HttpServletResponse response) {

        if (error != null) {
            log.warn("Google OAuth returned error: {}", error);
            return redirectToFrontend("/?auth_error=" + urlEncode(error));
        }

        if (code == null || state == null || !state.equals(readStateCookie(request))) {
            log.warn("OAuth callback rejected: missing code or state mismatch");
            return redirectToFrontend("/?auth_error=invalid_state");
        }

        // Clear the state cookie now that it has served its purpose.
        clearStateCookie(response);

        try {
            GoogleProfile profile = googleOAuthService.exchangeCode(code);
            User user = userService.upsertGoogleUser(
                    profile.sub(), profile.email(), profile.name(), profile.picture());
            String token = jwtService.generateToken(user);

            // Hand the token to the SPA via the URL fragment (never sent to a server,
            // not logged). The frontend's /auth/callback route stores it.
            return redirectToFrontend("/auth/callback#token=" + urlEncode(token));
        } catch (Exception e) {
            log.error("OAuth callback failed: {}", e.getMessage(), e);
            return redirectToFrontend("/?auth_error=login_failed");
        }
    }

    private ResponseEntity<Void> redirectToFrontend(String pathWithLeadingSlash) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(java.net.URI.create(frontendUrl + pathWithLeadingSlash))
                .build();
    }

    private String readStateCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (STATE_COOKIE.equals(c.getName())) return c.getValue();
        }
        return null;
    }

    private void clearStateCookie(HttpServletResponse response) {
        Cookie cleared = new Cookie(STATE_COOKIE, "");
        cleared.setPath("/");
        cleared.setMaxAge(0);
        response.addCookie(cleared);
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
