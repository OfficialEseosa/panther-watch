package edu.gsu.pantherwatch.pantherwatch.service;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import java.time.Duration;

import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;

@Service
public class PantherWatchService {
    private static final Duration TIMEOUT = Duration.ofMillis(5000);
    private final WebClient webClient;

    public PantherWatchService(WebClient webClient) {
        this.webClient = webClient;
    }

    public RetrieveCourseInfoResponse retrieveCourseInfo(RetrieveCourseInfoRequest request) {
        RetrieveCourseInfoResponse response = webClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .queryParam("txtLevel", request.getTxtLevel())
                    .queryParam("txtSubject", request.getTxtSubject())
                    .queryParam("txtTerm", request.getTxtTerm())
                    .queryParam("txtCourseNumber", request.getTxtCourseNumber())
                    .build())
                .retrieve()
                .bodyToMono(RetrieveCourseInfoResponse.class)
                .block(TIMEOUT);

        return parseRetrieveCourseInfoResponse(response);
    }

    protected RetrieveCourseInfoResponse parseRetrieveCourseInfoResponse(RetrieveCourseInfoResponse response) {
        if (response.getHttpStatusCode() != 200) {
            throw new RuntimeException("HTTP error: " + response.getHttpStatusCode());
        }

        if (response.getData() == null || !response.isSuccess()) {
            throw new RuntimeException("Failed to retrieve course information");
        }
        
        return response;
    }
}