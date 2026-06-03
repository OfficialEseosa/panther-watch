package edu.gsu.pantherwatch.pantherwatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.http.HttpHeaders;

import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Configuration
public class WebClientConfig {
    public static final String ACCEPT = "application/json, text/javascript, */*; q=0.01";
    public static final String X_REQUESTED_WITH = "XMLHttpRequest";

    @Value("${pantherwatch.api.base-url}")
    private String baseUrl;

    @Bean
    public WebClient webClient() {
        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(10 * 1024 * 1024))
                .build();

        // GoSolar (GSU Banner) sits behind an F5 BIG-IP load balancer. Course search is a
        // two-step flow: declare the term (POST /term/search) to create server-side session
        // state on one backend node, then GET the results from that SAME node. The F5 pins a
        // session to its node via the `BIGipServerregistration.gosolar.gsu.edu` cookie, which
        // the term-declaration response carries alongside JSESSIONID.
        //
        // Critically, the F5 only emits that BIGipServer cookie on a *fresh* TCP connection.
        // On a reused HTTP keep-alive connection it omits it (the connection is already pinned
        // at the F5). With a normal pooled WebClient, under steady load the connection pool
        // stays warm, so the declaration reuses a connection and never receives the BIGipServer
        // cookie. The follow-up search is then load-balanced to a different node that has no
        // record of the declared term and replies success:true,data:null. This was the root
        // cause of the production-only "search / tracked classes returns null" bug: locally
        // (and in single requests) every call opens a fresh connection, so it always worked.
        //
        // Fix: use a non-pooling connector so every request is a fresh connection. The F5 then
        // always issues the BIGipServer cookie on the declaration, and PantherWatchService
        // forwards both cookies to the search, keeping the two steps pinned to the same node.
        // The extra TLS handshake per call is negligible for this low-volume workload and is the
        // price of correctness.
        HttpClient httpClient = HttpClient.newConnection()
                .responseTimeout(Duration.ofSeconds(15));

        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .exchangeStrategies(strategies)
                .defaultHeader(HttpHeaders.ACCEPT, ACCEPT)
                .defaultHeader("X-Requested-With", X_REQUESTED_WITH)
                .build();
    }
}
