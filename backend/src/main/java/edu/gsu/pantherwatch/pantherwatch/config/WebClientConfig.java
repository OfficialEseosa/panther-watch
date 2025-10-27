package edu.gsu.pantherwatch.pantherwatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.http.HttpHeaders;

import java.net.URI;

@Configuration
public class WebClientConfig {
    public static final String ACCEPT = "application/json, text/javascript, */*; q=0.01";
    public static final String X_REQUESTED_WITH = "XMLHttpRequest";
    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    private static final String CLASS_SEARCH_PATH = "/classSearch/classSearch";

    @Value("${pantherwatch.api.base-url}")
    private String baseUrl;

    @Bean
    public WebClient webClient() {
        URI baseUri = URI.create(baseUrl);
        String origin = baseUri.getScheme() + "://" + baseUri.getHost();
        String referer = baseUrl + CLASS_SEARCH_PATH;

        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(10 * 1024 * 1024))
                .build();

        return WebClient.builder()
                .baseUrl(baseUrl)
                .exchangeStrategies(strategies)
                .defaultHeader(HttpHeaders.ACCEPT, ACCEPT)
                .defaultHeader("X-Requested-With", X_REQUESTED_WITH)
                .defaultHeader(HttpHeaders.REFERER, referer)
                .defaultHeader(HttpHeaders.ORIGIN, origin)
                .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
                .build();
    }
}
