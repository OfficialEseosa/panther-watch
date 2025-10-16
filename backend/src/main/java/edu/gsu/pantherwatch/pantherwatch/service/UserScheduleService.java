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
     * Get schedule entries for a specific term
     */
    public List<ScheduleEntryResponse> getUserScheduleForTerm(UUID userId, String termCode) {
        log.info("Fetching schedule for user: {} and term: {}", userId, termCode);
        return scheduleRepository.findByUserIdAndTermCodeOrderByAddedAtDesc(userId, termCode)
            .stream()
            .map(this::toResponse)
            .collect(Collectors.toList());
    }

    /**
     * Add a course to user's schedule
     */
    @Transactional
    public ScheduleEntryResponse addScheduleEntry(UUID userId, String termCode, String crn) {
        log.info("Adding schedule entry for user: {}, term: {}, crn: {}", userId, termCode, crn);
        
        // Check if already exists
        Optional<UserSchedule> existing = scheduleRepository.findByUserIdAndTermCodeAndCrn(userId, termCode, crn);
        if (existing.isPresent()) {
            log.info("Schedule entry already exists: {}", existing.get().getId());
            return toResponse(existing.get());
        }

        // Create new entry
        UserSchedule schedule = UserSchedule.builder()
            .userId(userId)
            .termCode(termCode)
            .crn(crn)
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

    /**
     * Sync schedule from client (batch update)
     */
    @Transactional
    public Map<String, List<ScheduleEntryResponse>> syncSchedule(UUID userId, Map<String, List<String>> scheduleByTerm) {
        log.info("Syncing schedule for user: {}", userId);
        
        // Get current schedule from DB
        Map<String, Set<String>> currentSchedule = scheduleRepository.findByUserIdOrderByAddedAtDesc(userId)
            .stream()
            .collect(Collectors.groupingBy(
                UserSchedule::getTermCode,
                Collectors.mapping(UserSchedule::getCrn, Collectors.toSet())
            ));

        // Process each term
        for (Map.Entry<String, List<String>> entry : scheduleByTerm.entrySet()) {
            String termCode = entry.getKey();
            Set<String> clientCrns = new HashSet<>(entry.getValue());
            Set<String> dbCrns = currentSchedule.getOrDefault(termCode, new HashSet<>());

            // Add missing CRNs
            for (String crn : clientCrns) {
                if (!dbCrns.contains(crn)) {
                    UserSchedule schedule = UserSchedule.builder()
                        .userId(userId)
                        .termCode(termCode)
                        .crn(crn)
                        .build();
                    scheduleRepository.save(schedule);
                    log.info("Added missing CRN: {} for term: {}", crn, termCode);
                }
            }

            // Remove extra CRNs
            for (String crn : dbCrns) {
                if (!clientCrns.contains(crn)) {
                    scheduleRepository.deleteByUserIdAndTermCodeAndCrn(userId, termCode, crn);
                    log.info("Removed extra CRN: {} for term: {}", crn, termCode);
                }
            }
        }

        // Remove terms that are in DB but not in client
        Set<String> clientTerms = scheduleByTerm.keySet();
        for (String termCode : currentSchedule.keySet()) {
            if (!clientTerms.contains(termCode)) {
                for (String crn : currentSchedule.get(termCode)) {
                    scheduleRepository.deleteByUserIdAndTermCodeAndCrn(userId, termCode, crn);
                    log.info("Removed CRN: {} from deleted term: {}", crn, termCode);
                }
            }
        }

        // Return updated schedule
        return getUserSchedule(userId);
    }

    private ScheduleEntryResponse toResponse(UserSchedule schedule) {
        return ScheduleEntryResponse.builder()
            .id(schedule.getId())
            .termCode(schedule.getTermCode())
            .crn(schedule.getCrn())
            .addedAt(schedule.getAddedAt())
            .build();
    }
}
