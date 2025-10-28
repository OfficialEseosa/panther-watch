package edu.gsu.pantherwatch.pantherwatch.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;
import java.time.Duration;
import java.util.List;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.stream.Collectors;

import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectRequest;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.Terms;
import reactor.core.publisher.Mono;

@Service
public class PantherWatchService {
    private static final Logger logger = LoggerFactory.getLogger(PantherWatchService.class);
    private static final Duration TIMEOUT = Duration.ofMillis(10000);
    private static final String SORT_COLUMN = "subjectDescription";
    private static final String SORT_DIRECTION = "asc";
    private static final int DEFAULT_OFFSET = 1;
    private static final int DEFAULT_MAX = 10;
    private final WebClient webClient;
    private static final String SEARCH_PATH = "/term/search";
    private static final String RETRIEVE_INFO_PATH = "/searchResults/searchResults";
    private static final String RESET_PATH = "/classSearch/resetDataForm";
    private static final String TERMS_PATH = "/classSearch/getTerms";
    private static final String SUBJECT_PATH = "/classSearch/get_subject";

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }

    public RetrieveCourseInfoResponse searchCourses(RetrieveCourseInfoRequest request) {
        logger.info("Starting course search for subject={} course={} term={}",
                request.getTxtSubject(), request.getTxtCourseNumber(), request.getTxtTerm());
        String sessionCookies = declareTermAndGetCookies(request.getTxtTerm());

        return searchCoursesWithCookies(request, sessionCookies);
    }
    
    private String declareTermAndGetCookies(String term) {
        logger.info("Declaring term {} to obtain session cookies", term);
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
                            logger.info("Term declaration succeeded with {} Set-Cookie header(s): {}",
                                    setCookieHeaders.size(), summarizeCookies(setCookieHeaders));
                            String combinedCookies = setCookieHeaders.stream()
                                    .map(cookie -> cookie.split(";", 2)[0])
                                    .reduce((a, b) -> a + "; " + b)
                                    .orElse("");
                            return Mono.just(combinedCookies);
                        } else {
                            logger.warn("Term declaration succeeded but no Set-Cookie headers were returned");
                            return Mono.error(new RuntimeException("No session cookies received from term declaration"));
                        }
                    } else {
                        logger.error("HTTP error in term declaration: {}", response.statusCode().value());
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error in term declaration: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    private RetrieveCourseInfoResponse searchCoursesWithCookies(RetrieveCourseInfoRequest request, String cookies) {
        CourseSearchResult initialResult = executeCourseSearch(request, cookies, false);

        if (shouldRetry(initialResult)) {
            logger.info("Initial course search returned null data after new cookies; retrying once.");
            CourseSearchResult retryResult = executeCourseSearch(request, initialResult.effectiveCookies(), true);
            return retryResult.body();
        }

        return initialResult.body();
    }

    public boolean resetRequestForm() {
        logger.info("Resetting remote class search form");
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RESET_PATH)
                    .build())
                .exchangeToMono(response -> {
                    logger.info("Reset form response status: {}", response.statusCode().value());
                    if (response.statusCode().is2xxSuccessful()) {
                        return Mono.just(true);
                    } else {
                        logger.error("HTTP error resetting form: {}", response.statusCode().value());
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    public List<Terms> fetchAvailableTerms() {
        Terms[] termsArray = webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(TERMS_PATH)
                    .queryParam("offset", DEFAULT_OFFSET)
                    .queryParam("max", DEFAULT_MAX)
                    .build())
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(Terms[].class);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error fetching terms: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
        
        return Arrays.asList(termsArray);
    }

    public List<GetSubjectResponse> getSubjects(GetSubjectRequest request) {
        GetSubjectResponse[] subjectsArray = webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(SUBJECT_PATH)
                    .queryParam("searchTerm", request.getSearchTerm())
                    .queryParam("term", request.getTerm())
                    .queryParam("offset", request.getOffset())
                    .queryParam("max", request.getMax())
                    .build())
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(GetSubjectResponse[].class);
                    } else {
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error fetching subjects: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
        
        return Arrays.asList(subjectsArray);
    }

    private CourseSearchResult executeCourseSearch(RetrieveCourseInfoRequest request, String cookies, boolean isRetry) {
        logger.info("Performing course search{} with cookies: {}", isRetry ? " (retry)" : "", summarizeCookieHeader(cookies));
        return webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RETRIEVE_INFO_PATH)
                    .queryParam("txt_subject", request.getTxtSubject())
                    .queryParam("txt_courseNumber", request.getTxtCourseNumber())
                    .queryParam("txt_term", request.getTxtTerm())
                    .queryParam("pageOffset", request.getPageOffset() != null ? request.getPageOffset() : 0)
                    .queryParam("pageMaxSize", request.getPageMaxSize() != null ? request.getPageMaxSize() : 200)
                    .queryParam("sortColumn", SORT_COLUMN)
                    .queryParam("sortDirection", SORT_DIRECTION)
                    .build())
                .header(HttpHeaders.COOKIE, cookies != null ? cookies : "")
                .exchangeToMono(response -> {
                    var setCookieHeaders = response.headers().header(HttpHeaders.SET_COOKIE);
                    if (!setCookieHeaders.isEmpty()) {
                        logger.info("Course search response set additional cookies: {}", summarizeCookies(setCookieHeaders));
                    }
                    logger.info("Course search response status: {}", response.statusCode().value());
                    if (response.statusCode().is2xxSuccessful()) {
                        final CookieMergeResult mergeResult = mergeCookies(cookies, setCookieHeaders);
                        return response.bodyToMono(RetrieveCourseInfoResponse.class)
                                .map(body -> {
                                    logger.info("Course search success flag: {}", body.isSuccess());
                                    if (body.getData() == null) {
                                        logger.warn("Course search returned null data");
                                    } else {
                                        logger.info("Course search returned {} result(s)", body.getData().length);
                                    }
                                    return new CourseSearchResult(body, mergeResult.header(), mergeResult.modified());
                                });
                    } else {
                        logger.error("HTTP error in course search: {}", response.statusCode().value());
                        return response.createException()
                                .flatMap(exception -> Mono.error(
                                    new RuntimeException("HTTP error in course search: " + response.statusCode().value())
                                ));
                    }
                })
                .block(TIMEOUT);
    }

    private boolean shouldRetry(CourseSearchResult result) {
        if (result == null || result.body() == null) {
            return false;
        }
        if (!result.body().isSuccess()) {
            return false;
        }
        if (result.body().getData() != null) {
            return false;
        }
        return result.receivedNewCookies();
    }

    private CookieMergeResult mergeCookies(String existingCookies, List<String> setCookieHeaders) {
        LinkedHashMap<String, String> cookieMap = toCookieMap(existingCookies);
        boolean modified = false;
        if (setCookieHeaders != null) {
            for (String header : setCookieHeaders) {
                if (header == null || header.isBlank()) {
                    continue;
                }
                String[] parts = header.split(";", 2);
                String nameValue = parts[0].trim();
                int separatorIndex = nameValue.indexOf('=');
                if (separatorIndex <= 0 || separatorIndex == nameValue.length() - 1) {
                    continue;
                }
                String name = nameValue.substring(0, separatorIndex);
                String value = nameValue.substring(separatorIndex + 1);
                String previous = cookieMap.put(name, value);
                if (!value.equals(previous)) {
                    modified = true;
                }
            }
        }
        String mergedHeader = cookieMap.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("; "));
        return new CookieMergeResult(mergedHeader, modified);
    }

    private LinkedHashMap<String, String> toCookieMap(String cookieHeaderValue) {
        LinkedHashMap<String, String> cookieMap = new LinkedHashMap<>();
        if (cookieHeaderValue == null || cookieHeaderValue.isBlank()) {
            return cookieMap;
        }
        String[] segments = cookieHeaderValue.split(";");
        for (String segment : segments) {
            String trimmed = segment.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            int separatorIndex = trimmed.indexOf('=');
            if (separatorIndex <= 0 || separatorIndex == trimmed.length() - 1) {
                continue;
            }
            String name = trimmed.substring(0, separatorIndex);
            String value = trimmed.substring(separatorIndex + 1);
            cookieMap.put(name, value);
        }
        return cookieMap;
    }

    private record CourseSearchResult(
            RetrieveCourseInfoResponse body,
            String effectiveCookies,
            boolean receivedNewCookies) { }

    private record CookieMergeResult(String header, boolean modified) { }

    private String summarizeCookies(List<String> cookieHeaders) {
        return cookieHeaders.stream()
                .map(this::summarizeCookie)
                .collect(Collectors.joining("; "));
    }

    private String summarizeCookieHeader(String cookieHeaderValue) {
        if (cookieHeaderValue == null || cookieHeaderValue.isBlank()) {
            return "<none>";
        }
        return Arrays.stream(cookieHeaderValue.split(";\\s*"))
                .map(this::summarizeCookie)
                .collect(Collectors.joining("; "));
    }

    private String summarizeCookie(String cookieHeader) {
        if (cookieHeader == null || cookieHeader.isBlank()) {
            return "<empty>";
        }
        String[] parts = cookieHeader.split(";", 2);
        String nameValue = parts[0];
        int separatorIndex = nameValue.indexOf('=');
        if (separatorIndex > 0 && separatorIndex < nameValue.length() - 1) {
            String name = nameValue.substring(0, separatorIndex);
            String value = nameValue.substring(separatorIndex + 1);
            String shortenedValue = value.length() <= 8
                    ? value
                    : value.substring(0, 4) + "..." + value.substring(value.length() - 4);
            return name + "=" + shortenedValue;
        }
        return nameValue;
    }
}
