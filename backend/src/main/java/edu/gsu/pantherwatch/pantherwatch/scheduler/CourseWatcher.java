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

import java.util.List;
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
            List<Object[]> uniqueCourses = watchedClassRepository.findAllUniqueCrnTermPairs();
            log.info("Found {} unique courses to monitor", uniqueCourses.size());

            List<CompletableFuture<Void>> futures = uniqueCourses.stream()
                    .map(this::checkCourseAvailabilityAsync)
                    .toList();

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            
            log.info("Course watch cycle completed");
            
        } catch (Exception e) {
            log.error("Error during course watch cycle", e);
        }
    }
    
    private CompletableFuture<Void> checkCourseAvailabilityAsync(Object[] crnTermPair) {
        return CompletableFuture.runAsync(() -> checkCourseAvailability(crnTermPair));
    }
    
    private void checkCourseAvailability(Object[] crnTermPair) {
        String crn = (String) crnTermPair[0];
        String term = (String) crnTermPair[1];
        
        try {
            log.debug("Checking availability for CRN: {} in term: {}", crn, term);

            RetrieveCourseInfoRequest request = RetrieveCourseInfoRequest.builder()
                    .txtTerm(term)
                    .txtCourseNumber("")
                    .txtSubject("")
                    .build();
            
            RetrieveCourseInfoResponse response = pantherWatchService.searchCourses(request);
            
            if (response != null && response.getData() != null) {
                CourseData courseData = null;
                for (CourseData course : response.getData()) {
                    if (crn.equals(course.getCourseReferenceNumber())) {
                        courseData = course;
                        break;
                    }
                }
                
                if (courseData != null) {
                    checkAndNotifyWaitlistAvailability(courseData, crn, term);
                } else {
                    log.debug("Course not found for CRN: {} in term: {}", crn, term);
                }
            }
            
        } catch (Exception e) {
            log.error("Error checking course availability for CRN: {} in term: {}", crn, term, e);
        }
    }
    
    private void checkAndNotifyWaitlistAvailability(CourseData courseData, String crn, String term) {
        if (courseData.getWaitCount() == 0 && courseData.getSeatsAvailable() > 0) {
            log.info("Spots available for CRN: {} - Seats: {}, Waitlist: {}", 
                    crn, courseData.getSeatsAvailable(), courseData.getWaitCount());

            List<WatchedClass> watchedClasses = watchedClassRepository.findByCrnAndTerm(crn, term);

            for (WatchedClass watchedClass : watchedClasses) {
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
                            term
                    );
                    
                    log.info("Notification sent to {} for course {} {}", 
                            watchedClass.getUser().getEmail(), 
                            courseData.getSubject(), 
                            courseData.getCourseNumber());
                    
                } catch (Exception e) {
                    log.error("Failed to send notification to {} for course {}", 
                            watchedClass.getUser().getEmail(), crn, e);
                }
            }
        } else {
            log.debug("No spots available for CRN: {} - Seats: {}, Waitlist: {}", 
                    crn, courseData.getSeatsAvailable(), courseData.getWaitCount());
        }
    }
}
