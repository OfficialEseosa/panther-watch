package edu.gsu.pantherwatch.pantherwatch.session;

import java.time.Duration;
import java.time.Instant;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;

@Component
public class CookieManager {
    private static final Duration EXP_DURATION = Duration.ofHours(1);
    private static final String BASE_URL = "https://registration.gosolar.gsu.edu";

    private String cookie;
    private String syncToken;
    private Instant lastAccessed;

    private final WebClient webClient;

    public CookieManager(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .baseUrl(BASE_URL)
                .filter((request, next) -> {
                    System.out.println("Request: " + request.method() + " " + request.url());
                    request.headers().forEach((name, values) -> 
                        values.forEach(value -> System.out.println("Header: " + name + " = " + value))
                    );
                    return next.exchange(request);
                })
                .build();
    }

    public synchronized String getCookie() {
        if (cookie == null || lastAccessed == null || Duration.between(lastAccessed, Instant.now()).compareTo(EXP_DURATION) > 0) {
            cookie = fetchNewCookie();
            lastAccessed = Instant.now();
        }
        return cookie;
    }

    public synchronized String getSyncToken() {
    if (syncToken == null || lastAccessed == null || Duration.between(lastAccessed, Instant.now()).compareTo(EXP_DURATION) > 0) {
        fetchNewCookie();
        lastAccessed = Instant.now();
    }
    return syncToken;
}

    private String fetchNewCookie() {
        String response = webClient.get()
                .uri("/StudentRegistrationSsb/ssb/classSearch/classSearch")
                .retrieve()
                .toEntity(String.class)
                .map(entity -> {
                    var headers = entity.getHeaders().get(HttpHeaders.SET_COOKIE);
                    if (headers != null && !headers.isEmpty()) {
                        cookie = headers.stream()
                                .map(cookie -> cookie.split(";", 2)[0])
                                .reduce((a, b) -> a + "; " + b)
                                .orElseThrow(() -> new RuntimeException("Failed to combine cookies"));
                        System.out.println("New cookie retrieved: " + cookie);
                    } else {
                        throw new RuntimeException("No Set-Cookie header found");
                    }
                    return entity.getBody();
                })
                .block();

        if (response != null) {
            var matcher = Pattern.compile("<meta name=\"synchronizerToken\" content=\"([^\"]+)\"")
                    .matcher(response);
            if (matcher.find()) {
                syncToken = matcher.group(1);
                System.out.println("New sync token retrieved: " + syncToken);
            } else {
                throw new RuntimeException("No sync token found in response");
            }
        } else {
            throw new RuntimeException("Empty body while trying to fetch session info");
        }

        return cookie;
    }
}
