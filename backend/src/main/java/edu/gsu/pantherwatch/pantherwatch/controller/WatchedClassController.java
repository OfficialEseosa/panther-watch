package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassRequest;
import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.CourseData;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.UserService;
import edu.gsu.pantherwatch.pantherwatch.service.WatchedClassService;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/watched-classes")
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:3000"})
public class WatchedClassController {

    @Autowired
    private WatchedClassService watchedClassService;

    @Autowired
    private UserService userService;
    
    @Autowired
    private PantherWatchService pantherWatchService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getWatchedClasses(@RequestParam String googleId) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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
            @RequestParam String googleId,
            @RequestBody WatchedClassRequest request) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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
            @RequestParam String googleId,
            @RequestParam String crn,
            @RequestParam String term) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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
            @RequestParam String googleId,
            @RequestParam String crn,
            @RequestParam String term) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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
    public ResponseEntity<Map<String, Object>> getWatchedClassCount(@RequestParam String googleId) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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
    public ResponseEntity<Map<String, Object>> getWatchedClassesWithFullDetails(@RequestParam String googleId) {
        try {
            User user = userService.findByGoogleId(googleId)
                    .orElseThrow(() -> new RuntimeException("User not found"));

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

            List<CourseData> allCourseDetails = new ArrayList<>();

            for (Map.Entry<String, List<WatchedClassResponse>> entry : groupedClasses.entrySet()) {
                String[] parts = entry.getKey().split("\\|");
                String subject = parts[0];
                String courseNumber = parts[1];
                String term = parts[2];
                List<WatchedClassResponse> classesForThisCourse = entry.getValue();

                try {
                    RetrieveCourseInfoRequest searchRequest = new RetrieveCourseInfoRequest();
                    searchRequest.setTxtSubject(subject);
                    searchRequest.setTxtCourseNumber(courseNumber);
                    searchRequest.setTxtTerm(term);

                    RetrieveCourseInfoResponse searchResponse = pantherWatchService.searchCourses(searchRequest);

                    if (searchResponse.isSuccess() && searchResponse.getData() != null) {
                        Set<String> watchedCrns = classesForThisCourse.stream()
                                .map(WatchedClassResponse::getCrn)
                                .collect(Collectors.toSet());

                        for (CourseData course : searchResponse.getData()) {
                            if (watchedCrns.contains(course.getCourseReferenceNumber())) {
                                allCourseDetails.add(course);
                            }
                        }
                    }
                } catch (Exception e) {
                    System.err.println("Error searching for course " + subject + " " + courseNumber + ": " + e.getMessage());
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
}
