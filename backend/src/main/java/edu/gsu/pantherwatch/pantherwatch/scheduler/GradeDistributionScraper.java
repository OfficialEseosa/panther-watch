package edu.gsu.pantherwatch.pantherwatch.scheduler;

import edu.gsu.pantherwatch.pantherwatch.service.GradeDistributionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Keeps the cached course grade-distribution CSVs fresh. Grade data is historical
 * and only changes when a new term's grades post, so a monthly check is plenty:
 * it downloads any recent term that isn't cached yet and now has posted grades.
 * On startup the service already loads whatever CSVs are on disk; if none exist we
 * kick off a download in the background.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class GradeDistributionScraper {

    private final GradeDistributionService gradeService;

    /** Guards against overlapping refreshes (startup, cron, and manual triggers). */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public boolean isRunning() {
        return running.get();
    }

    /** 03:30 on the 1st of every month. */
    @Scheduled(cron = "0 30 3 1 * *")
    public void monthlyRefresh() {
        triggerRefresh();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void backfillIfEmpty() {
        if (gradeService.isEmpty()) {
            log.info("No grade data cached; starting initial download in background");
            triggerRefresh();
        }
    }

    /**
     * Starts a refresh on a background thread if one isn't already running.
     * Returns true if a new refresh was started, false if one was already in flight.
     */
    public boolean triggerRefresh() {
        if (!running.compareAndSet(false, true)) {
            log.info("Grade refresh already in progress; ignoring trigger");
            return false;
        }
        Thread worker = new Thread(() -> {
            try {
                gradeService.refresh();
            } catch (Exception e) {
                log.error("Grade distribution refresh failed", e);
            } finally {
                running.set(false);
            }
        }, "grade-refresh");
        worker.setDaemon(true);
        worker.start();
        return true;
    }
}
