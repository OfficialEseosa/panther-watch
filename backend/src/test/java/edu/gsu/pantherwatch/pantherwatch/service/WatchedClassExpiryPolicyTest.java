package edu.gsu.pantherwatch.pantherwatch.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WatchedClassExpiryPolicyTest {

    private final WatchedClassExpiryPolicy policy = new WatchedClassExpiryPolicy();

    @Test
    void expiryIsTwoMonthsAfterTermStart() {
        assertEquals(LocalDate.of(2026, 3, 1), policy.expiryDate("202601")); // Spring
        assertEquals(LocalDate.of(2026, 7, 1), policy.expiryDate("202605")); // Summer
        assertEquals(LocalDate.of(2026, 10, 1), policy.expiryDate("202608")); // Fall
    }

    @Test
    void malformedTermsReturnNullAndNeverExpireOrWarn() {
        assertNull(policy.expiryDate(null));
        assertNull(policy.expiryDate("2026"));
        assertNull(policy.expiryDate("2026XX"));
        assertFalse(policy.isExpired("bad", LocalDate.of(2030, 1, 1)));
        assertFalse(policy.isExpiringSoon("bad", LocalDate.of(2030, 1, 1)));
    }

    @Test
    void isExpiredOnAndAfterExpiryDate() {
        // Spring 202601 expires 2026-03-01.
        assertFalse(policy.isExpired("202601", LocalDate.of(2026, 2, 28)));
        assertTrue(policy.isExpired("202601", LocalDate.of(2026, 3, 1)));
        assertTrue(policy.isExpired("202601", LocalDate.of(2026, 6, 7)));
    }

    @Test
    void expiringSoonWindowIs14DaysBeforeExpiry() {
        // Expiry 2026-03-01; warn window is [2026-02-15, 2026-03-01).
        assertFalse(policy.isExpiringSoon("202601", LocalDate.of(2026, 2, 14)));
        assertTrue(policy.isExpiringSoon("202601", LocalDate.of(2026, 2, 15)));
        assertTrue(policy.isExpiringSoon("202601", LocalDate.of(2026, 2, 28)));
        // On/after expiry it's expired, not "expiring soon".
        assertFalse(policy.isExpiringSoon("202601", LocalDate.of(2026, 3, 1)));
    }
}
