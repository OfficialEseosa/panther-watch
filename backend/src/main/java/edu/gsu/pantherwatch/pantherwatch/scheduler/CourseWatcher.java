package edu.gsu.pantherwatch.pantherwatch.scheduler;

import edu.gsu.pantherwatch.pantherwatch.api.CourseData;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.model.WatchedClass;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import edu.gsu.pantherwatch.pantherwatch.service.EmailService;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class CourseWatcher {

    private final WatchedClassRepository watchedClassRepository;
    private final PantherWatchService pantherWatchService;
    private final EmailService emailService;

    @Scheduled(fixedRate = 300000)
    public void watchTrackedCourses() {
        log.info("Starting course watch cycle...");

        try {
            List<WatchedClass> allWatched = watchedClassRepository.findAllWithUser();

            // One GoSolar search per term+subject+courseNumber covers every
            // watched section of that course (and every user watching it).
            // Searching by course is required: GoSolar cannot look up a CRN
            // directly, and an unfiltered search only returns the first page
            // of the whole catalog.
            Map<String, List<WatchedClass>> courseGroups = new HashMap<>();
            for (WatchedClass watched : allWatched) {
                if (isBlank(watched.getSubject()) || isBlank(watched.getCourseNumber())) {
                    log.warn("Watched class {} (term {}) has no subject/courseNumber; cannot check availability",
                            watched.getCrn(), watched.getTerm());
                    continue;
                }
                String key = watched.getTerm() + "|" + watched.getSubject() + "|" + watched.getCourseNumber();
                courseGroups.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(watched);
            }
            log.info("Found {} unique courses to monitor ({} watch entries)",
                    courseGroups.size(), allWatched.size());

            List<CompletableFuture<Void>> futures = courseGroups.values().stream()
                    .map(group -> CompletableFuture.runAsync(() -> checkCourseGroup(group)))
                    .toList();

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            log.info("Course watch cycle completed");

        } catch (Exception e) {
            log.error("Error during course watch cycle", e);
        }
    }

    /** Check every watched section of one course (same term/subject/courseNumber). */
    private void checkCourseGroup(List<WatchedClass> group) {
        WatchedClass sample = group.get(0);
        String term = sample.getTerm();

        try {
            log.debug("Checking availability for {} {} in term {}",
                    sample.getSubject(), sample.getCourseNumber(), term);

            RetrieveCourseInfoRequest request = RetrieveCourseInfoRequest.builder()
                    .txtTerm(term)
                    .txtSubject(sample.getSubject())
                    .txtCourseNumber(sample.getCourseNumber())
                    .pageMaxSize(200)
                    .build();

            RetrieveCourseInfoResponse response = pantherWatchService.searchCourses(request);
            if (response == null || response.getData() == null) {
                return;
            }

            Map<String, CourseData> sectionsByCrn = new HashMap<>();
            for (CourseData course : response.getData()) {
                sectionsByCrn.put(course.getCourseReferenceNumber(), course);
            }

            for (WatchedClass watched : group) {
                CourseData courseData = sectionsByCrn.get(watched.getCrn());
                if (courseData == null) {
                    log.debug("Course not found for CRN: {} in term: {}", watched.getCrn(), term);
                    continue;
                }
                checkAndNotifyWaitlistAvailability(courseData, watched);
            }

        } catch (Exception e) {
            log.error("Error checking course availability for {} {} in term: {}",
                    sample.getSubject(), sample.getCourseNumber(), term, e);
        }
    }

    private void checkAndNotifyWaitlistAvailability(CourseData courseData, WatchedClass watchedClass) {
        String crn = watchedClass.getCrn();
        boolean spotsOpen = courseData.getWaitCount() == 0 && courseData.getSeatsAvailable() > 0;

        if (!spotsOpen) {
            log.debug("No spots available for CRN: {} - Seats: {}, Waitlist: {}",
                    crn, courseData.getSeatsAvailable(), courseData.getWaitCount());
            // Class filled back up: re-arm so the next opening notifies again.
            if (watchedClass.getNotifiedAt() != null) {
                watchedClass.setNotifiedAt(null);
                watchedClassRepository.save(watchedClass);
            }
            return;
        }

        // Already emailed for this opening — don't spam every cycle.
        if (watchedClass.getNotifiedAt() != null) {
            return;
        }

        log.info("Spots available for CRN: {} - Seats: {}, Waitlist: {}",
                crn, courseData.getSeatsAvailable(), courseData.getWaitCount());

        try {
            String userName = watchedClass.getUser().getName() != null ?
                    watchedClass.getUser().getName() :
                    watchedClass.getUser().getEmail().split("@")[0];

            emailService.sendClassAvailabilityNotification(
                    watchedClass.getUser().getEmail(),
                    userName,
                    courseData.getCourseTitle(),
                    courseData.getCourseNumber(),
                    courseData.getSubject(),
                    crn,
                    watchedClass.getTerm()
            );

            watchedClass.setNotifiedAt(LocalDateTime.now());
            watchedClassRepository.save(watchedClass);

            log.info("Notification sent to {} for course {} {}",
                    watchedClass.getUser().getEmail(),
                    courseData.getSubject(),
                    courseData.getCourseNumber());

        } catch (Exception e) {
            log.error("Failed to send notification to {} for course {}",
                    watchedClass.getUser().getEmail(), crn, e);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
