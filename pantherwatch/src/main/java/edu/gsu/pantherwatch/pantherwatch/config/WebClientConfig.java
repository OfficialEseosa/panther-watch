package edu.gsu.pantherwatch.pantherwatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;

@Configuration
public class WebClientConfig {
    public static final String ACCEPT = "application/json, text/javascript, */*; q=0.01";
    public static final String X_REQUESTED_WITH = "XMLHttpRequest";

    @Value("${pantherwatch.api.base-url}")
    private String baseUrl;

    @Bean
    public WebClient webClient() {
        return WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.ACCEPT, ACCEPT)
                .defaultHeader("X-Requested-With", X_REQUESTED_WITH)
                .build();
    }
}
