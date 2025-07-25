package edu.gsu.pantherwatch.pantherwatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

import edu.gsu.pantherwatch.pantherwatch.session.CookieManager;

import org.springframework.http.HttpHeaders;

@Configuration
public class WebClientConfig {
    public static final String ACCEPT = "application/json, text/javascript, */*; q=0.01";
    public static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
    public static final String X_REQUESTED_WITH = "XMLHttpRequest";
    public static final String REFERER = "https://registration.gosolar.gsu.edu/StudentRegistrationSsb/ssb/classSearch/classSearch";
    public static final String ORIGIN = "https://registration.gosolar.gsu.edu";

    @Value("${pantherwatch.api.base-url}")
    private String baseUrl;

    @Bean
    public WebClient webClient(CookieManager cookieManager) {
        return WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.ACCEPT, ACCEPT)
                .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
                .defaultHeader("X-Requested-With", X_REQUESTED_WITH)
                .defaultHeader(HttpHeaders.REFERER, REFERER)
                .defaultHeader(HttpHeaders.ORIGIN, ORIGIN)
                .defaultHeader(HttpHeaders.COOKIE, cookieManager.getCookie())
                .defaultHeader("X-Synchronizer-Token", cookieManager.getSyncToken())
                .build();
    }
}
