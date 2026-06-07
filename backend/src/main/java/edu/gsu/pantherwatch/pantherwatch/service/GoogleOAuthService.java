package edu.gsu.pantherwatch.pantherwatch.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Handles the Google OAuth 2.0 "authorization code" flow:
 *  1. {@link #buildAuthorizeUrl} → where we send the browser to grant consent.
 *  2. {@link #exchangeCode} → swap the returned code for an access token, then fetch
 *     the user's profile from Google's userinfo endpoint.
 *
 * Uses {@link RestTemplate} for a couple of plain HTTPS calls to a well-behaved Google
 * endpoint (no F5 affinity quirks like GoSolar, so the special non-pooling WebClient is
 * unnecessary here).
 */
@Service
public class GoogleOAuthService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleOAuthService.class);

    private static final String AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

    @Value("${google.client-id}")
    private String clientId;

    @Value("${google.client-secret}")
    private String clientSecret;

    @Value("${google.redirect-uri}")
    private String redirectUri;

    private final RestTemplate restTemplate = new RestTemplate();

    /** Profile fields we care about from Google's userinfo response. */
    public record GoogleProfile(String sub, String email, String name, String picture) {}

    public String buildAuthorizeUrl(String state) {
        return UriComponentsBuilder.fromUriString(AUTHORIZE_ENDPOINT)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", "openid email profile")
                .queryParam("state", state)
                .queryParam("access_type", "online")
                .queryParam("prompt", "select_account")
                .encode(StandardCharsets.UTF_8)
                .toUriString();
    }

    public GoogleProfile exchangeCode(String code) {
        String accessToken = requestAccessToken(code);
        return fetchProfile(accessToken);
    }

    @SuppressWarnings("unchecked")
    private String requestAccessToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        form.add("redirect_uri", redirectUri);
        form.add("grant_type", "authorization_code");

        try {
            Map<String, Object> body = restTemplate.postForObject(
                    TOKEN_ENDPOINT, new HttpEntity<>(form, headers), Map.class);
            if (body == null || body.get("access_token") == null) {
                throw new RuntimeException("Google token response missing access_token");
            }
            return (String) body.get("access_token");
        } catch (Exception e) {
            logger.error("Google token exchange failed: {}", e.getMessage());
            throw new RuntimeException("Failed to exchange Google authorization code");
        }
    }

    @SuppressWarnings("unchecked")
    private GoogleProfile fetchProfile(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);

        try {
            Map<String, Object> body = restTemplate.exchange(
                    USERINFO_ENDPOINT,
                    org.springframework.http.HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class).getBody();

            if (body == null || body.get("email") == null) {
                throw new RuntimeException("Google userinfo response missing email");
            }

            return new GoogleProfile(
                    (String) body.get("sub"),
                    (String) body.get("email"),
                    (String) body.get("name"),
                    (String) body.get("picture"));
        } catch (Exception e) {
            logger.error("Google userinfo fetch failed: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch Google profile");
        }
    }
}
