package edu.gsu.pantherwatch.pantherwatch.service;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import java.time.Duration;

import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import reactor.core.publisher.Mono;

@Service
public class PantherWatchService {
    private static final Duration TIMEOUT = Duration.ofMillis(5000);
    private static final String SORT_COLUMN = "subjectDescription";
    private static final String SORT_DIRECTION = "asc";
    private final WebClient webClient;
    private static final String SEARCH_PATH = "term/search";
    private static final String RETRIEVE_INFO_PATH = "/searchResults/searchResults";
    private static final String RESET_PATH = "/classSearch/resetDataForm";

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }
    
    public boolean searchMode(String term) {
        return webClient
                .post()
                .uri(uriBuilder -> uriBuilder
                    .path(SEARCH_PATH)
                    .queryParam("mode", "search")
                    .build())
                .bodyValue(String.format("term=%s", term))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return Mono.just(true);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    public RetrieveCourseInfoResponse retrieveCourseInfo(RetrieveCourseInfoRequest request) {
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RETRIEVE_INFO_PATH)
                    .queryParam("txtLevel", request.getTxtLevel())
                    .queryParam("txtSubject", request.getTxtSubject())
                    .queryParam("txtTerm", request.getTxtTerm())
                    .queryParam("txtCourseNumber", request.getTxtCourseNumber())
                    .queryParam("sortColumn", SORT_COLUMN)
                    .queryParam("sortDirection", SORT_DIRECTION)
                    .build())
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(RetrieveCourseInfoResponse.class);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    public boolean resetRequestForm() {
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RESET_PATH)
                    .build())
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return Mono.just(true);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }
}