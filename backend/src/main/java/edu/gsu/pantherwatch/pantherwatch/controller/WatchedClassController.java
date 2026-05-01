package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassRequest;
import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.CourseData;
import edu.gsu.pantherwatch.pantherwatch.api.Faculty;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.WatchedClassService;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/watched-classes")
@Slf4j
public class WatchedClassController {

    private static final long FULL_DETAILS_OVERALL_TIMEOUT_SECONDS = 25;

    // Dedicated bounded pool for /full-details fan-out. Using ForkJoinPool.commonPool()
    // (the default for supplyAsync) is unsafe here because fetchGroupDetails performs
    // blocking WebClient .block() calls and can starve the common pool under load.
    private final ExecutorService fullDetailsExecutor = Executors.newFixedThreadPool(16, r -> {
        Thread t = new Thread(r, "full-details-" + FULL_DETAILS_THREAD_COUNTER.incrementAndGet());
        t.setDaemon(true);
        return t;
    });
    private static final AtomicInteger FULL_DETAILS_THREAD_COUNTER = new AtomicInteger();

    @PreDestroy
    public void shutdownExecutor() {
        fullDetailsExecutor.shutdownNow();
    }

    @Autowired
    private WatchedClassService watchedClassService;

    @Autowired
    private PantherWatchService pantherWatchService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getWatchedClasses(HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");

            List<WatchedClassResponse> watchedClasses = watchedClassService.getWatchedClasses(user);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", watchedClasses != null ? watchedClasses : Collections.emptyList());
            response.put("count", watchedClasses != null ? watchedClasses.size() : 0);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("getWatchedClasses failed", e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to get watched classes");
            errorResponse.put("data", Collections.emptyList());
            errorResponse.put("count", 0);

            return ResponseEntity.ok(errorResponse);
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
            log.error("addWatchedClass failed", e);
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
            log.error("removeWatchedClass failed", e);
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
            log.error("checkIfWatching failed", e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("isWatching", false);

            return ResponseEntity.ok(errorResponse);
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
            log.error("getWatchedClassCount failed", e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("count", 0);

            return ResponseEntity.ok(errorResponse);
        }
    }

    @GetMapping("/full-details")
    public ResponseEntity<Map<String, Object>> getWatchedClassesWithFullDetails(HttpServletRequest request) {
        Map<String, Object> response = new HashMap<>();
        try {
            User user = (User) request.getAttribute("currentUser");

            List<WatchedClassResponse> watchedClasses = watchedClassService.getWatchedClasses(user);
            if (watchedClasses == null) {
                watchedClasses = Collections.emptyList();
            }

            if (watchedClasses.isEmpty()) {
                response.put("success", true);
                response.put("data", Collections.emptyList());
                response.put("count", 0);
                return ResponseEntity.ok(response);
            }

            Map<String, List<WatchedClassResponse>> groupedClasses = watchedClasses.stream()
                    .filter(wc -> wc.getSubject() != null && wc.getCourseNumber() != null && wc.getTerm() != null)
                    .collect(Collectors.groupingBy(wc ->
                            wc.getSubject() + "|" + wc.getCourseNumber() + "|" + wc.getTerm()));

            List<CompletableFuture<Map<String, CourseData>>> futures = groupedClasses.entrySet().stream()
                    .map(entry -> CompletableFuture.supplyAsync(
                            () -> fetchGroupDetails(entry.getKey(), entry.getValue()),
                            fullDetailsExecutor))
                    .toList();

            CompletableFuture<Void> all = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));
            try {
                all.get(FULL_DETAILS_OVERALL_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException te) {
                log.warn("full-details overall timeout reached; returning partial data with placeholders");
                cancelPending(futures);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("full-details interrupted; returning partial data");
                cancelPending(futures);
            } catch (ExecutionException ee) {
                log.warn("full-details execution exception (continuing with available data): {}", ee.getMessage());
            }

            // Merge all per-group CRN -> CourseData maps
            Map<String, CourseData> crnToDetail = new HashMap<>();
            for (CompletableFuture<Map<String, CourseData>> f : futures) {
                if (f.isDone() && !f.isCompletedExceptionally()) {
                    try {
                        Map<String, CourseData> partial = f.getNow(Collections.emptyMap());
                        if (partial != null) {
                            crnToDetail.putAll(partial);
                        }
                    } catch (Exception e) {
                        log.debug("ignoring failed group future: {}", e.getMessage());
                    }
                }
            }

            // CRITICAL: always return one entry per watched class, even if details lookup failed.
            // This eliminates the "tracked classes returns null" symptom — the user always sees their classes.
            List<CourseData> allCourseDetails = new ArrayList<>(watchedClasses.size());
            for (WatchedClassResponse wc : watchedClasses) {
                CourseData detail = crnToDetail.get(wc.getCrn());
                if (detail != null) {
                    if (detail.getTerm() == null || detail.getTerm().isBlank()) {
                        detail.setTerm(wc.getTerm());
                    }
                    allCourseDetails.add(detail);
                } else {
                    allCourseDetails.add(buildPlaceholder(wc));
                }
            }

            response.put("success", true);
            response.put("data", allCourseDetails);
            response.put("count", allCourseDetails.size());
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("getWatchedClassesWithFullDetails unexpected failure", e);
            response.put("success", false);
            response.put("message", "Failed to get watched classes with full details");
            response.put("data", Collections.emptyList());
            response.put("count", 0);
            // Real server-side failure — surface a 5xx so monitoring/clients can react.
            // Note: handled per-group failures inside the try block return 200 with placeholders;
            // only an outer-level crash reaches this branch.
            return ResponseEntity.status(500).body(response);
        }
    }

    private void cancelPending(List<CompletableFuture<Map<String, CourseData>>> futures) {
        for (CompletableFuture<Map<String, CourseData>> f : futures) {
            if (!f.isDone()) {
                f.cancel(true);
            }
        }
    }

    private Map<String, CourseData> fetchGroupDetails(String groupKey, List<WatchedClassResponse> classesForThisCourse) {
        try {
            String[] parts = groupKey.split("\\|", -1);
            if (parts.length < 3) {
                return Collections.emptyMap();
            }
            String subject = parts[0];
            String courseNumber = parts[1];
            String term = parts[2];

            RetrieveCourseInfoRequest searchRequest = RetrieveCourseInfoRequest.builder()
                    .txtSubject(subject)
                    .txtCourseNumber(courseNumber)
                    .txtTerm(term)
                    .pageMaxSize(200)
                    .build();

            RetrieveCourseInfoResponse searchResponse = pantherWatchService.searchCourses(searchRequest);
            if (searchResponse == null || searchResponse.getData() == null) {
                log.warn("full-details: no data for group {} (will use placeholders)", groupKey);
                return Collections.emptyMap();
            }

            Set<String> watchedCrns = classesForThisCourse.stream()
                    .map(WatchedClassResponse::getCrn)
                    .collect(Collectors.toSet());

            Map<String, CourseData> result = new HashMap<>();
            for (CourseData course : searchResponse.getData()) {
                if (course != null && watchedCrns.contains(course.getCourseReferenceNumber())) {
                    course.setTerm(term);
                    result.put(course.getCourseReferenceNumber(), course);
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("full-details group {} failed: {}", groupKey, e.getMessage());
            return Collections.emptyMap();
        }
    }

    private CourseData buildPlaceholder(WatchedClassResponse wc) {
        CourseData placeholder = new CourseData();
        placeholder.setCourseReferenceNumber(wc.getCrn());
        placeholder.setSubject(wc.getSubject());
        placeholder.setSubjectDescription(wc.getSubject());
        placeholder.setCourseNumber(wc.getCourseNumber());
        placeholder.setCourseTitle(wc.getCourseTitle());
        placeholder.setTerm(wc.getTerm());
        if (wc.getInstructor() != null && !wc.getInstructor().isBlank()) {
            Faculty f = new Faculty();
            f.setDisplayName(wc.getInstructor());
            placeholder.setFaculty(new Faculty[]{f});
        } else {
            placeholder.setFaculty(new Faculty[0]);
        }
        return placeholder;
    }
}
