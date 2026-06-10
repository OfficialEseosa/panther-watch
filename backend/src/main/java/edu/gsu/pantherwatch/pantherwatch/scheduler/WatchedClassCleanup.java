package edu.gsu.pantherwatch.pantherwatch.scheduler;

import edu.gsu.pantherwatch.pantherwatch.repository.UserScheduleRepository;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import edu.gsu.pantherwatch.pantherwatch.service.WatchedClassExpiryPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * Removes tracked classes and schedule entries whose term is no longer actionable:
 * either expired (see {@link WatchedClassExpiryPolicy}) or flagged "(View only)" by
 * GoSolar; registration is closed, so there is nothing left to track or plan.
 *
 * Runs daily; the expiry math lives in Java (not SQL) so there's a single source of truth
 * shared with the warning banner. The view-only check comes from the cached GoSolar
 * terms feed and is skipped gracefully if the feed is unavailable.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WatchedClassCleanup {

    private final WatchedClassRepository watchedClassRepository;
    private final UserScheduleRepository userScheduleRepository;
    private final WatchedClassExpiryPolicy expiryPolicy;
    private final PantherWatchService pantherWatchService;

    // Daily at 08:00 server time.
    @Scheduled(cron = "0 0 8 * * *")
    @Transactional
    public void purgeExpiredTrackedClasses() {
        LocalDate today = LocalDate.now();
        Set<String> viewOnlyTerms = safeViewOnlyTerms();

        List<String> staleWatchedTerms = watchedClassRepository.findDistinctTerms().stream()
                .filter(term -> expiryPolicy.isExpired(term, today) || viewOnlyTerms.contains(term))
                .toList();

        if (staleWatchedTerms.isEmpty()) {
            log.info("Tracked-class cleanup: no expired or view-only terms today");
        } else {
            int deleted = watchedClassRepository.deleteByTermIn(staleWatchedTerms);
            log.info("Tracked-class cleanup: removed {} rows across stale terms {}", deleted, staleWatchedTerms);
        }

        List<String> staleScheduleTerms = userScheduleRepository.findDistinctTermCodes().stream()
                .filter(term -> expiryPolicy.isExpired(term, today) || viewOnlyTerms.contains(term))
                .toList();

        if (staleScheduleTerms.isEmpty()) {
            log.info("Schedule cleanup: no expired or view-only terms today");
        } else {
            int deleted = userScheduleRepository.deleteByTermCodeIn(staleScheduleTerms);
            log.info("Schedule cleanup: removed {} rows across stale terms {}", deleted, staleScheduleTerms);
        }
    }

    private Set<String> safeViewOnlyTerms() {
        try {
            return pantherWatchService.getViewOnlyTermCodes();
        } catch (RuntimeException e) {
            log.warn("Cleanup: could not determine view-only terms (skipping that check): {}", e.getMessage());
            return Collections.emptySet();
        }
    }
}
