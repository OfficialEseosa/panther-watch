package edu.gsu.pantherwatch.pantherwatch.service;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;
import java.time.Duration;

import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import reactor.core.publisher.Mono;

@Service
public class PantherWatchService {
    private static final Duration TIMEOUT = Duration.ofMillis(10000);
    private static final String SORT_COLUMN = "subjectDescription";
    private static final String SORT_DIRECTION = "asc";
    private final WebClient webClient;
    private static final String SEARCH_PATH = "/term/search";
    private static final String RETRIEVE_INFO_PATH = "/searchResults/searchResults";
    private static final String RESET_PATH = "/classSearch/resetDataForm";
    private static final String TERMS_PATH = "/classSearch/getTerms";

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }

    public RetrieveCourseInfoResponse searchCourses(RetrieveCourseInfoRequest request) {
        String sessionCookies = declareTermAndGetCookies(request.getTxtTerm());

        return searchCoursesWithCookies(request, sessionCookies);
    }
    
    private String declareTermAndGetCookies(String term) {
        return webClient
                .post()
                .uri(uriBuilder -> uriBuilder
                    .path(SEARCH_PATH)
                    .build())
                .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
                .bodyValue(String.format("term=%s", term))
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful() || response.statusCode().value() == 302) {
                        var setCookieHeaders = response.headers().header(HttpHeaders.SET_COOKIE);
                        if (!setCookieHeaders.isEmpty()) {
                            String combinedCookies = setCookieHeaders.stream()
                                    .map(cookie -> cookie.split(";", 2)[0])
                                    .reduce((a, b) -> a + "; " + b)
                                    .orElse("");
                            return Mono.just(combinedCookies);
                        } else {
                            return Mono.error(new RuntimeException("No session cookies received from term declaration"));
                        }
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error in term declaration: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    private RetrieveCourseInfoResponse searchCoursesWithCookies(RetrieveCourseInfoRequest request, String cookies) {
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RETRIEVE_INFO_PATH)
                    .queryParam("txt_subject", request.getTxtSubject())
                    .queryParam("txt_courseNumber", request.getTxtCourseNumber())
                    .queryParam("txt_term", request.getTxtTerm())
                    .queryParam("sortColumn", SORT_COLUMN)
                    .queryParam("sortDirection", SORT_DIRECTION)
                    .build())
                .header(HttpHeaders.COOKIE, cookies)
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(RetrieveCourseInfoResponse.class);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error in course search: " + response.statusCode().value())
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

    public String fetchAvailableTerms() {
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(TERMS_PATH)
                    .queryParam("offset", 1)
                    .queryParam("max", 10)
                    .build())
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(String.class);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error fetching terms: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }
}