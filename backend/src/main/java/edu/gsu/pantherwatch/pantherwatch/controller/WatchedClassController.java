package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassRequest;
import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.CourseData;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.WatchedClassService;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/watched-classes")
public class WatchedClassController {

    @Autowired
    private WatchedClassService watchedClassService;
    
    @Autowired
    private PantherWatchService pantherWatchService;

    private static final Logger log = LoggerFactory.getLogger(WatchedClassController.class);
    private static final int COURSE_DETAIL_MAX_ATTEMPTS = 5;
    private static final long COURSE_DETAIL_RETRY_DELAY_MS = 2000L;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getWatchedClasses(HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            List<WatchedClassResponse> watchedClasses = watchedClassService.getWatchedClasses(user);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", watchedClasses);
            response.put("count", watchedClasses.size());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to get watched classes: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> addWatchedClass(
            @RequestBody WatchedClassRequest request,
            HttpServletRequest httpRequest) {
        try {
            User user = (User) httpRequest.getAttribute("currentUser");

            WatchedClassResponse watchedClass = watchedClassService.addWatchedClass(user, request);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Class added to watch list");
            response.put("data", watchedClass);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to add class to watch list: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Object>> removeWatchedClass(
            @RequestParam String crn,
            @RequestParam String term,
            HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            boolean removed = watchedClassService.removeWatchedClass(user, crn, term);

            Map<String, Object> response = new HashMap<>();
            if (removed) {
                response.put("success", true);
                response.put("message", "Class removed from watch list");
            } else {
                response.put("success", false);
                response.put("message", "Class not found in watch list");
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to remove class from watch list: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    @GetMapping("/check")
    public ResponseEntity<Map<String, Object>> checkIfWatching(
            @RequestParam String crn,
            @RequestParam String term,
            HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            boolean isWatching = watchedClassService.isWatching(user, crn, term);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("isWatching", isWatching);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to check watch status: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    @GetMapping("/count")
    public ResponseEntity<Map<String, Object>> getWatchedClassCount(HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            long count = watchedClassService.getWatchedClassCount(user);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("count", count);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to get watch count: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    @GetMapping("/full-details")
    public ResponseEntity<Map<String, Object>> getWatchedClassesWithFullDetails(HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            List<WatchedClassResponse> watchedClasses = watchedClassService.getWatchedClasses(user);
            
            if (watchedClasses.isEmpty()) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", new ArrayList<>());
                response.put("count", 0);
                return ResponseEntity.ok(response);
            }

            Map<String, List<WatchedClassResponse>> groupedClasses = watchedClasses.stream()
                    .collect(Collectors.groupingBy(wc -> 
                        wc.getSubject() + "|" + wc.getCourseNumber() + "|" + wc.getTerm()));

            Map<String, Set<String>> crnGroupMap = new HashMap<>();
            groupedClasses.forEach((key, value) -> {
                Set<String> crnSet = value.stream()
                        .map(WatchedClassResponse::getCrn)
                        .collect(Collectors.toCollection(LinkedHashSet::new));
                crnGroupMap.put(key, crnSet);
            });

            List<CourseData> allCourseDetails = new ArrayList<>();

            for (Map.Entry<String, List<WatchedClassResponse>> entry : groupedClasses.entrySet()) {
                String[] parts = entry.getKey().split("\\|");
                String subject = parts[0];
                String courseNumber = parts[1];
                String term = parts[2];
                List<WatchedClassResponse> classesForThisCourse = entry.getValue();

                try {
                    RetrieveCourseInfoRequest searchRequest = RetrieveCourseInfoRequest.builder()
                            .txtSubject(subject)
                            .txtCourseNumber(courseNumber)
                            .txtTerm(term)
                            .pageMaxSize(200)
                            .build();

                    CourseData[] courseResults = fetchCourseDetailsWithRetry(searchRequest, subject, courseNumber, term);

                    if (courseResults != null && courseResults.length > 0) {
                        Set<String> watchedCrns = crnGroupMap.getOrDefault(entry.getKey(), Collections.emptySet());

                        for (CourseData course : courseResults) {
                            if (course != null && watchedCrns.contains(course.getCourseReferenceNumber())) {
                                course.setTerm(term);
                                allCourseDetails.add(course);
                            }
                        }
                    } else {
                        log.warn("No course detail data returned for {} {} term {} after retries", subject, courseNumber, term);
                    }
                } catch (Exception e) {
                    log.error("Failed to fetch course details for {} {} term {}", subject, courseNumber, term, e);
                }
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", allCourseDetails);
            response.put("count", allCourseDetails.size());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to get watched classes with full details: " + e.getMessage());

            return ResponseEntity.badRequest().body(errorResponse);
        }
    }

    private CourseData[] fetchCourseDetailsWithRetry(RetrieveCourseInfoRequest request, String subject, String courseNumber, String term) {
        CourseData[] lastResult = null;
        Exception lastException = null;

        for (int attempt = 1; attempt <= COURSE_DETAIL_MAX_ATTEMPTS; attempt++) {
            try {
                RetrieveCourseInfoResponse searchResponse = pantherWatchService.searchCourses(request);
                if (searchResponse != null && searchResponse.isSuccess() && searchResponse.getData() != null && searchResponse.getData().length > 0) {
                    return searchResponse.getData();
                }

                lastResult = (searchResponse != null) ? searchResponse.getData() : null;
                log.debug("Course detail attempt {} yielded {} results for {} {} term {}", attempt,
                        lastResult != null ? lastResult.length : 0, subject, courseNumber, term);
            } catch (Exception e) {
                lastException = e;
                log.warn("Course detail attempt {} failed for {} {} term {}", attempt, subject, courseNumber, term, e);
            }

            if (attempt < COURSE_DETAIL_MAX_ATTEMPTS) {
                try {
                    Thread.sleep(COURSE_DETAIL_RETRY_DELAY_MS);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("Course detail retry interrupted for {} {} term {}", subject, courseNumber, term);
                    break;
                }

                try {
                    pantherWatchService.resetRequestForm();
                } catch (Exception resetException) {
                    log.debug("Failed to reset course search form before retry for {} {} term {}", subject, courseNumber, term, resetException);
                }
            }
        }

        if (lastException != null) {
            log.error("Unable to retrieve course details for {} {} term {} after retries", subject, courseNumber, term, lastException);
        }

        return lastResult;
    }
}
