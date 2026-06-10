package edu.gsu.pantherwatch.pantherwatch.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;

import edu.gsu.pantherwatch.pantherwatch.api.CourseData;
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

    // Terms change rarely (a handful of times a year), so a short cache keeps
    // view-only validation off the GoSolar hot path.
    private static final Duration TERMS_CACHE_TTL = Duration.ofHours(1);
    private volatile List<Terms> cachedTerms = Collections.emptyList();
    private volatile Instant termsCachedAt = Instant.EPOCH;

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }

    public static boolean isViewOnlyDescription(String description) {
        return description != null && description.toLowerCase().contains("view only");
    }

    /**
     * Cached view of {@link #fetchAvailableTerms()}. On refresh failure the last
     * known list is returned (possibly empty), so callers fail open.
     */
    public List<Terms> getCachedTerms() {
        if (Instant.now().isAfter(termsCachedAt.plus(TERMS_CACHE_TTL))) {
            try {
                List<Terms> fresh = fetchAvailableTerms();
                if (!fresh.isEmpty()) {
                    cachedTerms = fresh;
                }
                termsCachedAt = Instant.now();
            } catch (RuntimeException e) {
                logger.warn("Failed to refresh terms cache (keeping previous): {}", e.getMessage());
            }
        }
        return cachedTerms;
    }

    /**
     * Term codes whose registration window has closed ("(View only)" in GoSolar).
     * Tracking and scheduling are rejected for these terms.
     */
    public Set<String> getViewOnlyTermCodes() {
        return getCachedTerms().stream()
                .filter(term -> isViewOnlyDescription(term.getDescription()))
                .map(Terms::getCode)
                .collect(Collectors.toSet());
    }

    public boolean isViewOnlyTerm(String termCode) {
        return termCode != null && getViewOnlyTermCodes().contains(termCode);
    }

    public RetrieveCourseInfoResponse searchCourses(RetrieveCourseInfoRequest request) {
        logger.info("Starting course search for subject={} course={} term={} level={}",
                request.getTxtSubject(), request.getTxtCourseNumber(), request.getTxtTerm(), request.getTxtLevel());

        // A single attempt is sufficient: the non-pooling WebClient guarantees a fresh
        // connection per request, so the F5 always issues the BIGipServer affinity cookie
        // and the declare+search pair stays pinned to the same GoSolar node. The empty
        // response below is null-safety for a genuine GoSolar failure, not a retry.
        try {
            String sessionCookies = declareTermAndGetCookies(request.getTxtTerm());
            RetrieveCourseInfoResponse body = executeCourseSearch(request, sessionCookies);
            if (body != null && body.isSuccess() && body.getData() != null) {
                return body;
            }
            logger.warn("Course search returned no data (success={}, dataNull={})",
                    body != null && body.isSuccess(), body == null || body.getData() == null);
        } catch (RuntimeException e) {
            logger.error("Course search failed for subject={} course={} term={}",
                    request.getTxtSubject(), request.getTxtCourseNumber(), request.getTxtTerm(), e);
        }

        RetrieveCourseInfoResponse empty = new RetrieveCourseInfoResponse();
        empty.setSuccess(false);
        empty.setData(new CourseData[0]);
        return empty;
    }

    private String declareTermAndGetCookies(String term) {
        logger.debug("Declaring term {} to obtain session cookies", term);
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
                            logger.debug("Term declaration succeeded with {} Set-Cookie header(s): {}",
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

    public boolean resetRequestForm() {
        logger.info("Resetting remote class search form");
        try {
            return Boolean.TRUE.equals(webClient
                    .get()
                    .uri(uriBuilder -> uriBuilder
                        .path(RESET_PATH)
                        .build())
                    .exchangeToMono(response -> {
                        if (response.statusCode().is2xxSuccessful()) {
                            return Mono.just(true);
                        }
                        logger.warn("Reset form returned status: {}", response.statusCode().value());
                        return Mono.just(false);
                    })
                    .block(TIMEOUT));
        } catch (RuntimeException e) {
            logger.warn("Reset form failed (non-fatal): {}", e.getMessage());
            return false;
        }
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

        return termsArray == null ? Collections.emptyList() : Arrays.asList(termsArray);
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

        return subjectsArray == null ? Collections.emptyList() : Arrays.asList(subjectsArray);
    }

    private RetrieveCourseInfoResponse executeCourseSearch(RetrieveCourseInfoRequest request, String cookies) {
        logger.debug("Performing course search with cookies: {}", summarizeCookieHeader(cookies));
        return webClient
                .get()
                .uri(uriBuilder -> {
                    uriBuilder
                        .path(RETRIEVE_INFO_PATH)
                        .queryParam("txt_subject", request.getTxtSubject())
                        .queryParam("txt_courseNumber", request.getTxtCourseNumber())
                        .queryParam("txt_term", request.getTxtTerm())
                        .queryParam("pageOffset", request.getPageOffset() != null ? request.getPageOffset() : 0)
                        .queryParam("pageMaxSize", request.getPageMaxSize() != null ? request.getPageMaxSize() : 200)
                        .queryParam("sortColumn", SORT_COLUMN)
                        .queryParam("sortDirection", SORT_DIRECTION);
                    if (request.getTxtLevel() != null && !request.getTxtLevel().isBlank()) {
                        uriBuilder.queryParam("txt_level", request.getTxtLevel());
                    }
                    return uriBuilder.build();
                })
                .header(HttpHeaders.COOKIE, cookies != null ? cookies : "")
                .exchangeToMono(response -> {
                    logger.debug("Course search response status: {}", response.statusCode().value());
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(RetrieveCourseInfoResponse.class)
                                .map(body -> {
                                    if (body.getData() == null) {
                                        logger.warn("Course search returned null data");
                                    } else {
                                        logger.debug("Course search returned {} result(s)", body.getData().length);
                                    }
                                    return body;
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
