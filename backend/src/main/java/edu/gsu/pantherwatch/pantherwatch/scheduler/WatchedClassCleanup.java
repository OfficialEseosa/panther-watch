package edu.gsu.pantherwatch.pantherwatch.scheduler;

import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import edu.gsu.pantherwatch.pantherwatch.service.WatchedClassExpiryPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Removes tracked classes whose term has expired (see {@link WatchedClassExpiryPolicy}),
 * so old terms stop cluttering dashboards and stop being polled by CourseWatcher.
 *
 * Runs daily; the expiry math lives in Java (not SQL) so there's a single source of truth
 * shared with the warning banner.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WatchedClassCleanup {

    private final WatchedClassRepository watchedClassRepository;
    private final WatchedClassExpiryPolicy expiryPolicy;

    // Daily at 08:00 server time.
    @Scheduled(cron = "0 0 8 * * *")
    @Transactional
    public void purgeExpiredTrackedClasses() {
        LocalDate today = LocalDate.now();

        List<String> expiredTerms = watchedClassRepository.findDistinctTerms().stream()
                .filter(term -> expiryPolicy.isExpired(term, today))
                .toList();

        if (expiredTerms.isEmpty()) {
            log.info("Tracked-class cleanup: no expired terms today");
            return;
        }

        int deleted = watchedClassRepository.deleteByTermIn(expiredTerms);
        log.info("Tracked-class cleanup: removed {} rows across expired terms {}", deleted, expiredTerms);
    }
}
