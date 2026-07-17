package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.UserSchedule;
import edu.gsu.pantherwatch.pantherwatch.repository.UserScheduleRepository;
import edu.gsu.pantherwatch.pantherwatch.api.ScheduleEntryResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserScheduleService {
    private final UserScheduleRepository scheduleRepository;
    private final PantherWatchService pantherWatchService;

    /**
     * Get all schedule entries for a user, grouped by term code
     */
    public Map<String, List<ScheduleEntryResponse>> getUserSchedule(UUID userId) {
        log.info("Fetching schedule for user: {}", userId);
        List<UserSchedule> schedules = scheduleRepository.findByUserIdOrderByAddedAtDesc(userId);
        
        return schedules.stream()
            .map(this::toResponse)
            .collect(Collectors.groupingBy(ScheduleEntryResponse::getTermCode));
    }

    /**
     * Add a course to user's schedule
     */
    @Transactional
    public ScheduleEntryResponse addScheduleEntry(UUID userId, String termCode, String crn,
                                                  String subject, String courseNumber, String courseTitle) {
        log.info("Adding schedule entry for user: {}, term: {}, crn: {}", userId, termCode, crn);

        if (pantherWatchService.isViewOnlyTerm(termCode)) {
            throw new IllegalArgumentException("This term is view only. Registration is closed and classes can no longer be scheduled");
        }

        // Check if already exists
        Optional<UserSchedule> existing = scheduleRepository.findByUserIdAndTermCodeAndCrn(userId, termCode, crn);
        if (existing.isPresent()) {
            UserSchedule entry = existing.get();
            log.info("Schedule entry already exists: {}", entry.getId());
            // Backfill course identity on rows created before it was stored.
            if (entry.getSubject() == null && subject != null) {
                entry.setSubject(subject);
                entry.setCourseNumber(courseNumber);
                entry.setCourseTitle(courseTitle);
                entry = scheduleRepository.save(entry);
            }
            return toResponse(entry);
        }

        // Create new entry
        UserSchedule schedule = UserSchedule.builder()
            .userId(userId)
            .termCode(termCode)
            .crn(crn)
            .subject(subject)
            .courseNumber(courseNumber)
            .courseTitle(courseTitle)
            .build();

        UserSchedule saved = scheduleRepository.save(schedule);
        log.info("Created schedule entry: {}", saved.getId());
        return toResponse(saved);
    }

    /**
     * Remove a course from user's schedule
     */
    @Transactional
    public void removeScheduleEntry(UUID userId, String termCode, String crn) {
        log.info("Removing schedule entry for user: {}, term: {}, crn: {}", userId, termCode, crn);
        scheduleRepository.deleteByUserIdAndTermCodeAndCrn(userId, termCode, crn);
    }

    private ScheduleEntryResponse toResponse(UserSchedule schedule) {
        return ScheduleEntryResponse.builder()
            .id(schedule.getId())
            .termCode(schedule.getTermCode())
            .crn(schedule.getCrn())
            .subject(schedule.getSubject())
            .courseNumber(schedule.getCourseNumber())
            .courseTitle(schedule.getCourseTitle())
            .addedAt(schedule.getAddedAt())
            .build();
    }
}
