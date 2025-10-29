package edu.gsu.pantherwatch.pantherwatch.service;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpHeaders;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectRequest;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.Terms;
import reactor.core.publisher.Mono;

@Service
public class PantherWatchService {
    private static final Duration TIMEOUT = Duration.ofMillis(10000);
    private static final Duration SESSION_TTL = Duration.ofMinutes(15);
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
    private static final String SAMPLE_TERM = "202601";
    private static final String SAMPLE_SUBJECT = "CSC";
    private static final String SAMPLE_COURSE_NUMBER = "2720";

    private final ConcurrentHashMap<String, BannerSession> sessionCache = new ConcurrentHashMap<>();

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }

    public RetrieveCourseInfoResponse searchCourses(RetrieveCourseInfoRequest request) {
        if (request == null || request.getTxtTerm() == null || request.getTxtTerm().isBlank()) {
            throw new IllegalArgumentException("Term is required for course search");
        }

        String term = request.getTxtTerm();

        for (int attempt = 0; attempt < 2; attempt++) {
            BannerSession session = obtainSession(term);
            synchronized (session) {
                String cookies = declareTerm(term, session.getCookies());
                session.updateCookies(cookies);

                RetrieveCourseInfoResponse response = searchCoursesWithCookies(request, cookies);

                if (!shouldValidateNullData(response)) {
                    resetRequestForm(cookies);
                    session.markUsed();
                    return response;
                }

                ValidationResult validation = validateSessionCookies(cookies);
                cookies = validation.cookies();

                if (!validation.valid()) {
                    sessionCache.remove(term, session);
                    continue;
                }

                cookies = declareTerm(term, cookies);
                session.updateCookies(cookies);

                RetrieveCourseInfoResponse retryResponse = searchCoursesWithCookies(request, cookies);
                resetRequestForm(cookies);
                session.markUsed();
                return retryResponse != null ? retryResponse : response;
            }
        }

        throw new RuntimeException("Unable to retrieve course information after refreshing session");
    }
    
    private String declareTerm(String term, String existingCookies) {
        return webClient
                .post()
                .uri(uriBuilder -> uriBuilder
                    .path(SEARCH_PATH)
                    .build())
                .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
                .bodyValue(String.format("term=%s", term))
                .headers(headers -> {
                    if (existingCookies != null && !existingCookies.isBlank()) {
                        headers.add(HttpHeaders.COOKIE, existingCookies);
                    }
                })
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful() || response.statusCode().value() == 302) {
                        var setCookieHeaders = response.headers().header(HttpHeaders.SET_COOKIE);
                        String mergedCookies = mergeCookies(existingCookies, setCookieHeaders);
                        if (mergedCookies == null || mergedCookies.isBlank()) {
                            return Mono.error(new RuntimeException("No session cookies available after term declaration"));
                        }
                        return Mono.just(mergedCookies);
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
                    .queryParam("pageOffset", request.getPageOffset() != null ? request.getPageOffset() : 0)
                    .queryParam("pageMaxSize", request.getPageMaxSize() != null ? request.getPageMaxSize() : 200)
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

    private void resetRequestForm(String cookies) {
        if (cookies == null || cookies.isBlank()) {
            return;
        }
        try {
            webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path(RESET_PATH)
                    .build())
                .header(HttpHeaders.COOKIE, cookies)
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
        } catch (Exception ignored) {
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

    private BannerSession obtainSession(String term) {
        return sessionCache.compute(term, (key, existing) -> {
            if (existing == null || existing.isExpired()) {
                String cookies = declareTerm(term, null);
                return new BannerSession(cookies);
            }
            return existing;
        });
    }

    private boolean shouldValidateNullData(RetrieveCourseInfoResponse response) {
        return response != null && response.isSuccess() && response.getData() == null;
    }

    private ValidationResult validateSessionCookies(String cookies) {
        try {
            String updatedCookies = declareTerm(SAMPLE_TERM, cookies);

            RetrieveCourseInfoRequest sampleRequest = RetrieveCourseInfoRequest.builder()
                    .txtSubject(SAMPLE_SUBJECT)
                    .txtCourseNumber(SAMPLE_COURSE_NUMBER)
                    .txtTerm(SAMPLE_TERM)
                    .pageOffset(0)
                    .pageMaxSize(5)
                    .build();

            RetrieveCourseInfoResponse sampleResponse = searchCoursesWithCookies(sampleRequest, updatedCookies);
            boolean valid = sampleResponse != null
                    && sampleResponse.isSuccess()
                    && sampleResponse.getData() != null
                    && sampleResponse.getData().length > 0;

            return new ValidationResult(valid, updatedCookies);
        } catch (Exception e) {
            return new ValidationResult(false, cookies);
        }
    }

    private String mergeCookies(String existingCookies, List<String> setCookieHeaders) {
        LinkedHashMap<String, String> cookieMap = toCookieMap(existingCookies);
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
                cookieMap.put(name, value);
            }
        }
        if (cookieMap.isEmpty()) {
            return null;
        }
        return cookieMap.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("; "));
    }

    private LinkedHashMap<String, String> toCookieMap(String existingCookies) {
        LinkedHashMap<String, String> cookieMap = new LinkedHashMap<>();
        if (existingCookies == null || existingCookies.isBlank()) {
            return cookieMap;
        }
        String[] segments = existingCookies.split(";");
        for (String segment : segments) {
            if (segment == null || segment.isBlank()) {
                continue;
            }
            String trimmed = segment.trim();
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

    private static final class BannerSession {
        private String cookies;
        private Instant lastUsed;

        BannerSession(String cookies) {
            this.cookies = cookies;
            this.lastUsed = Instant.now();
        }

        String getCookies() {
            return cookies;
        }

        void updateCookies(String cookies) {
            if (cookies != null && !cookies.isBlank()) {
                this.cookies = cookies;
            }
            this.lastUsed = Instant.now();
        }

        void markUsed() {
            this.lastUsed = Instant.now();
        }

        boolean isExpired() {
            return lastUsed.plus(PantherWatchService.SESSION_TTL).isBefore(Instant.now());
        }
    }

    private record ValidationResult(boolean valid, String cookies) { }
}
