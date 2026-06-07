package edu.gsu.pantherwatch.pantherwatch.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Single source of truth for when a tracked class expires.
 *
 * GSU term codes are {@code YYYYMM} of the term's start month (01=Spring, 05=Summer,
 * 08=Fall). A tracked class expires <b>2 months after the term starts</b> — e.g. Spring
 * 202601 → 2026-03-01, Summer 202605 → 2026-07-01, Fall 202608 → 2026-10-01. We surface
 * a subtle "expiring soon" warning on the card during the final {@value #WARN_LEAD_DAYS}
 * days, then a daily job removes expired rows.
 *
 * The frontend mirrors this math in {@code utils/trackedClassExpiry.js}; keep them in sync.
 */
@Component
public class WatchedClassExpiryPolicy {

    private static final Logger logger = LoggerFactory.getLogger(WatchedClassExpiryPolicy.class);

    private static final int EXPIRY_MONTHS_AFTER_START = 2;
    public static final int WARN_LEAD_DAYS = 14;

    /**
     * @return the date a class for {@code term} should be cleared, or {@code null} if the
     *         term code is malformed (callers treat null as "never expire / skip").
     */
    public LocalDate expiryDate(String term) {
        if (term == null || term.length() != 6) {
            return null;
        }
        try {
            int year = Integer.parseInt(term.substring(0, 4));
            int month = Integer.parseInt(term.substring(4, 6));
            return LocalDate.of(year, month, 1).plusMonths(EXPIRY_MONTHS_AFTER_START);
        } catch (Exception e) {
            logger.warn("Unparseable term code '{}': {}", term, e.getMessage());
            return null;
        }
    }

    public boolean isExpired(String term, LocalDate today) {
        LocalDate expiry = expiryDate(term);
        return expiry != null && !today.isBefore(expiry);
    }

    public boolean isExpiringSoon(String term, LocalDate today) {
        LocalDate expiry = expiryDate(term);
        if (expiry == null) {
            return false;
        }
        LocalDate warnFrom = expiry.minusDays(WARN_LEAD_DAYS);
        return !today.isBefore(warnFrom) && today.isBefore(expiry);
    }
}
