# Seat-alert edge cases (2026-10-26)

Owner: "the emails are sent out correctly… think of all the edge cases a normal user could possibly do."

## Rules (decided)
- OPEN = `waitCount === 0 && seatsAvailable > 0`. A seat opening while a waitlist exists never alerts (waitlisted students get it).
- One alert per open "episode". Re-arm only after two consecutive closed observations (≥ 2 min apart). A single closed blip does not re-arm.
- **Tracking a section that is open right now does NOT email.** On `addWatch`, the server checks live seats (one GoSolar search for that course); if OPEN, the row is created with `notified_at = now()` so the first alert comes after it fills and reopens. Same for track → untrack → track again.
- Alerts are sent to the user's CURRENT email (join `users` at send time), never an address stored on the watch.
- Atomic claim (`UPDATE … WHERE id=$1 AND notified_at IS NULL RETURNING id`) before any send: an untrack between read and claim sends nothing.
- Deleting the account cascades watches; no further emails. Goodbye email once. Welcome email once on first sign-in (not on subsequent logins, not on account linking).
- Daily/monthly Resend budget with a reserve for welcome/goodbye. Quota/rate-limit error stops the run; retried next run.
- A section missing from GoSolar for ≥ 3 consecutive runs is flagged `unlisted_since` (new column or derived from a counter) and the tracked page shows "no longer listed"; no email.

## Scenarios to cover with flow tests (PGlite + fake GoSolar + memory transport)
1. Track an OPEN section → no email on the next run; it closes (2 runs) and reopens → 1 email.
2. Track CLOSED → opens → 1 email → still open → 0 → closes once → 0 → closes again → re-armed → opens → 1 email (total 2).
3. Track → untrack → track again (open) → no email; (closed→open) → 1 email.
4. Untrack after the watcher loaded rows but before claim → no email (simulate by deleting the row inside a transport hook / before-claim callback).
5. Two users, same CRN → 2 emails; one user, two CRNs same course → 1 search, 2 emails.
6. Open with waitlist > 0 → no email; waitlist drops to 0 with seats > 0 → email.
7. User email changed between tracking and alert → alert to new address.
8. Account deleted → watches gone, goodbye email once, watcher sends nothing for that user.
9. Welcome: first login sends 1 welcome; second login sends 0; email-linking of an existing row sends 0.
10. Transport failure → `notified_at` reverted → next run sends; quota error → run stops, others retried next run.
11. Budget: 95 sent today, reserve 10 → watcher sends 0; welcome still sends.
12. Section missing 3 runs → flagged unlisted; reappears → flag cleared; no emails either way.
13. Term goes view-only → watch deleted by cleanup; no email.
14. Same user tracks same CRN in two terms → independent rows, independent alerts.
15. Rapid double-click Track → one row (unique), one email max.
