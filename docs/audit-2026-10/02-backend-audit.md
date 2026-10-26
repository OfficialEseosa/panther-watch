# Backend audit (Spring Boot), read-only, 2026-10-25

Citations: `File.java:N` = `backend/src/main/java/edu/gsu/pantherwatch/pantherwatch/<pkg>/File.java`. Properties = `backend/src/main/resources/application.properties`.

**Bottom line:** ~4,600 lines of Java. Most ports to Next.js easily. Three hard parts: the seat-alert job cadence (Vercel Hobby cron is daily), GoSolar session handling (Node fetch pools connections, which brings back the F5 affinity-cookie bug), and state kept on disk/in memory (grade CSVs, syllabus maps) that must move to Postgres. Worst bug: a class reopening within 6 h of an earlier alert emails nobody.

## 1. External integrations

### 1a. GoSolar registration SSB
Base URL `https://registration.gosolar.gsu.edu/StudentRegistrationSsb/ssb` (properties:3).

| Call | Request | Response | Where |
|---|---|---|---|
| Declare term | `POST /term/search`, form `term=YYYYMM` | 2xx or 302. All `Set-Cookie` cut to `name=value`, joined `; ` | `PantherWatchService.java:114-147` |
| Search | `GET /searchResults/searchResults?txt_subject&txt_courseNumber&txt_term&pageOffset(0)&pageMaxSize(200)&sortColumn=subjectDescription&sortDirection=asc[&txt_level]` with declare cookies | `{success,totalCount,data:[CourseData],pageOffset,pageMaxSize}` | `:219-260` |
| Reset form | `GET /classSearch/resetDataForm` (no cookies) | status only | `:149-169` |
| Terms | `GET /classSearch/getTerms?offset=1&max=10` | `[{code,description}]`; "(View only)" marks closed terms | `:171-192` |
| Subjects | `GET /classSearch/get_subject?searchTerm&term&offset&max` | `[{code,description}]` | `:194-217` |

Quirks:
- Default headers: `Accept: application/json, text/javascript, */*; q=0.01`, `X-Requested-With: XMLHttpRequest`. 10 MB buffer (`WebClientConfig.java:28,58-59`).
- **F5 affinity cookie:** new connection per request (`HttpClient.newConnection()`, `WebClientConfig.java:51`). F5 only sends `BIGipServerregistration.gosolar.gsu.edu` on a fresh TCP connection; a pooled connection lands the search on a different node → `success:true,data:null`.
- **No CRN lookup:** GoSolar ignores CRN params. CRNs found by searching subject+courseNumber and matching `courseReferenceNumber`.
- Every search opens a brand-new session. Search never pages; asks `pageMaxSize` 200.
- Timeouts: responseTimeout 15 s; each `.block()` 10 s. `/api/courses/search` = 3 sequential calls (declare, search, reset) → worst case ~30 s.

Node/serverless: fresh undici `Agent` per declare+search pair (close after). `redirect: 'manual'` on declare so 302 cookies aren't lost; `headers.getSetCookie()`. Node runtime, not Edge. `Connection: close` header is forbidden in fetch.

### 1b. GSU grade-distribution APEX
Base `https://dssapex.gsu.edu/ords/f`, app 140, page 184 (`GradeApexClient.java:41-43`). Page 183 unused.
1. Session: `GET f?p=140:184:0`, follow redirects, regex `name="p_instance"[^>]*value="(\d{6,})"`. Landing page `select[name=P_TERM_184] option` gives term codes (`GradeDistributionService.java:213-222`).
2. Set term: `GET f?p=140:184:{session}::NO::P_TERM_184:{term}`. Parse HTML for region ids: header containing "Professor" = summary, "A+" = detailed (`:191-210`).
3. CSV: `GET f?p=140:184:{session}:FLOW_EXCEL_OUTPUT_{regionId}_en` per region.

JDK HttpClient + `CookieManager(ACCEPT_ALL)`, Chrome UA (Cloudflare cookies involved), 60 s timeout. Non-200 only logged, body still returned (`:113-116`).
- Summary CSV headers: `CRN,Course,Professor,A (90-100),B (80-89),C (70-79),D (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method`
- Detailed CSV: `CRN,A+,A,A-,…,C-,D,F,WF,…,Total,Instruction Method`
- ~6.3k–7k rows/term. Term "posted" once any row has numeric `CRS AVG` (`:175-188`).
- Storage: CSVs written to local `grade-data/` (`:50`, `:120-121`); whole index in memory keyed `SUBJECT|NUMBER` (`:58`, `:133-172`).

Node: cookie jar across 302s, HTML parser, one term per invocation, data to Postgres. Cloudflare may challenge AWS egress IPs (untested risk).

### 1c. RateMyProfessors GraphQL
`POST https://www.ratemyprofessors.com/graphql`, `Authorization: Basic dGVzdDp0ZXN0`, Chrome UA. Body `{query:<newSearch.teachers>, variables:{query:{text:"First Last", schoolID:"U2Nob29sLTM2MA=="}}}`. Fields: `legacyId, firstName, lastName, department, avgRating, avgDifficulty, numRatings, wouldTakeAgainPercent, ratingsDistribution{r1..r5,total}, teacherRatingTags{tagName,tagCount}`. 15 s timeout. No caching (called per professor per search). Easy to port.

### 1d. Syllabus
`GET https://cdn.gsu.edu/static/syllabi-public/{term}.json` → `{courses:[{crn, syllabus:"syllabi/202508/83410.pdf" or ""}]}`, ~11k records, 3–4 MB/term. PDF URL = `{base}files/{path}`. 30 s timeout, 6 h in-memory cache. **Bug:** failed fetch caches an empty map for 6 h (`SyllabusService.java:112-118`). No CORS header on the file. Fix: cron ingests into `syllabi(term,crn,path)` table.

### 1e. Resend
`resend-java` 3.0.0. Sender `PantherWatch <no-reply@class.pantherwatch.app>` repeated 4×. Templates from classpath, CSS inlined by replacing `<link>`, `%`→`%%`, `String.format` fill. Nothing HTML-escaped. Quota numbers hard-coded (100/day, 3000/month). Admin custom emails never logged. Failed send throws → retried next cycle.

### 1f. Google OAuth
`accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token`, `www.googleapis.com/oauth2/v3/userinfo`. Scope `openid email profile`, `prompt=select_account`. Bare `new RestTemplate()` (`:46`) → **no timeouts**. `email_verified` never checked (`:106-114`).

### 1g. Other
Postgres via JPA/Hikari pool 20. Actuator health/info. Hosting Koyeb; if it scales to zero, `@Scheduled` jobs stop.

## 2. Scheduled jobs

| Job | Schedule | What | Runtime | State |
|---|---|---|---|---|
| `CourseWatcher.watchTrackedCourses` (`:30`) | every 5 min | Load all watches+users, group by `term|subject|courseNumber`, one GoSolar search per group, email watchers whose section opened | groups × (2 fresh-TLS calls ~0.5–2 s), on **common ForkJoin pool** (`:55-59`) so effectively sequential on 1–2 vCPU | `notified_at`, `email_logs` (6 h cooldown) |
| `WatchedClassCleanup.purgeExpiredTrackedClasses` (`:38`) | `0 0 8 * * *` | Bulk-delete watches and schedule rows for expired terms (term start + 2 months, `WatchedClassExpiryPolicy.java:25,32-49`) or "(View only)" | <1 s | none |
| `EmailService.cleanupOldEmailLogs` (`:255`) | `0 0 2 * * *` | Delete email_logs older than 1 week | <1 s | none |
| `GradeDistributionScraper.monthlyRefresh` (`:35`) | `0 30 3 1 * *` + at startup if nothing cached | Download newest 8 terms not on disk with posted grades; rebuild index | tens of s to minutes, raw daemon thread | CSVs on disk. Gitignored and not in Docker image → **every prod deploy re-downloads all 8 terms** |

### Seat-alert logic (`CourseWatcher.java:109-159`, `EmailService.java:57-94`)
1. "Open" = `waitCount == 0 && seatsAvailable > 0`. Seats opening while waitlist exists never trigger (intentional).
2. Not open + `notifiedAt` set → clear it (re-arm).
3. Open + `notifiedAt` set → skip.
4. Open + `notifiedAt` null → `sendClassAvailabilityNotification`: checks `email_logs` for same email, type CLASS_AVAILABILITY, subject `LIKE '%CRN <crn>%'`, within 6 h. If found, **returns quietly without sending**; CourseWatcher still sets `notifiedAt=now`. Otherwise sends, logs, sets `notifiedAt`. ResendException re-thrown → `notifiedAt` stays null → retry next cycle.
5. Search failure or missing CRN → group returns early, nothing changes (good).

Problems:
- **Reopenings swallowed:** open→email, fill, reopen within 6 h → cooldown returns quietly, `notifiedAt` set, no email until next fill+reopen after the window.
- Cooldown keyed on (email, CRN) via subject LIKE, not (user, term, CRN).
- `findRecentEmailByTypeAndEmailAndSubject` returns `Optional` but can match several rows (`EmailLogRepository.java:24-30`) → would throw every cycle; that watch never emails again. Latent.
- Brief wrong reading (seats=0) re-arms; no "closed for N cycles" debounce. No unique `(user_id, term, crn)`; `addWatchedClass` check-then-insert without transaction (`WatchedClassService.java:33-54`).

**Recommendation:** drop the email-log cooldown. Per-watch state machine: `notified_at` + `last_closed_at` (or closed-cycle counter). Claim the send atomically: `UPDATE … SET notified_at=now() WHERE id=$1 AND notified_at IS NULL RETURNING id` before calling Resend. Makes overlapping serverless runs safe.

## 3. HTTP API surface

Auth rules (`WebMvcConfig.java:23-25`, `AuthenticationInterceptor.java`): all `/api/**` need Bearer JWT except `/api/auth/**`, `/api/courses/**`, `/api/announcements/active`. OPTIONS pass. Every authed request loads the user from DB. Admin checked by hand in each handler.

| Method & path | Auth | Request → Response | Frontend caller |
|---|---|---|---|
| GET `/api/auth/google/login` | none | sets `pw_oauth_state` cookie, 302 to Google | authService.js:54 |
| GET `/api/auth/google/callback` | none | `code,state,error` → 302 to `FRONTEND_URL/auth/callback#token=` or `/?auth_error=` | browser |
| GET `/api/courses/search` | public | `@ModelAttribute` binds Java names `txtTerm, txtSubject, txtCourseNumber, txtLevel, pageOffset, pageMaxSize` → `RetrieveCourseInfoResponse` | CourseResultsPage, useSchedulePlanner, scheduleService |
| GET `/api/courses/terms` | public | → `Terms[]`. **Not cached** (calls `fetchAvailableTerms`, not `getCachedTerms`) | TermsContext |
| GET `/api/courses/subjects` | public | `searchTerm,term,offset,max` → `GetSubjectResponse[]` | SubjectAutocomplete |
| GET `/api/courses/grades` | public | `subject,courseNumber[,instructor]` → `GradeDistributionResponse` | gradeService |
| GET `/api/courses/ratings` | public | `professor` → `ProfessorRating` | ratingService |
| GET `/api/courses/syllabus` | public | `term,crn` → `SyllabusInfo` | syllabusService |
| GET `/api/watched-classes` | user | `{success,data,count}`; errors return **200** with `success:false` | yes |
| POST `/api/watched-classes` | user | `WatchedClassRequest` → `{success,message,data}`; 400 leaks exception message | yes |
| DELETE `/api/watched-classes?crn&term` | user | | yes |
| GET `/api/watched-classes/check` | user | | **unused** |
| GET `/api/watched-classes/count` | user | | used but **redundant** (list returns count) |
| GET `/api/watched-classes/full-details` | user | fan-out, 16-thread pool, 25 s cap (`:34-43`, `:189-278`) | yes |
| GET `/api/schedule` | user | `Map<term, ScheduleEntryResponse[]>` | yes |
| POST `/api/schedule` | user | `AddScheduleEntryRequest` → entry; 400 for view-only | yes |
| DELETE `/api/schedule/{termCode}/{crn}` | user | | yes |
| DELETE `/api/users/me` | user | delete + goodbye email | Settings.jsx:42 |
| GET `/api/announcements/active` | public | `{success,data:[Announcement entity]}` | AnnouncementBanner |
| GET/POST `/api/announcements`, PUT/DELETE `/{id}`, PATCH `/{id}/deactivate|activate` | admin | **JPA entity is the request body** (mass assignment) | AnnouncementManager |
| GET `/api/admin/check` | user | Boolean | Sidebar, AdminPanel |
| GET `/api/admin/users` | admin | `UserSearchResponse[]` (N+1 count queries, `AdminService.java:122`) | AdminPanel |
| POST `/api/admin/users/search` | admin | `{query}` → list, LIKE | AdminPanel |
| POST `/api/admin/email/send` | admin | raw HTML via Resend | EmailComposer |
| GET `/api/admin/emails/stats` | admin | | **unused** |
| POST `/api/admin/emails/cleanup` | admin | | **unused** |
| POST `/api/admin/grades/refresh` | admin | 202 | GradeDataManager |
| GET `/api/admin/grades/status` | admin | `{totalSections,terms,lastUpdated,running}` | GradeDataManager |

Backend drops every GoSolar field not in `CourseData` (lossy proxy).

## 4. Data model

- **users**: `user_id uuid PK` (Supabase UUID or random), `email` unique not null, `name`, `picture`, `google_sub` (nullable, **not unique**), `created_at`, `updated_at`.
- **watched_classes**: `id identity`, `user_id` FK lazy, `crn`, `term` not null, `course_title`, `course_number`, `subject`, `instructor`, `notified_at`, `created_at`, `updated_at`. **No unique/index on (user_id, term, crn).**
- **user_schedules**: `id`, `user_id uuid` (**no FK**), `term_code varchar(10)`, `crn varchar(10)`, `subject`, `course_number`, `course_title`, `added_at`. Unique `(user_id, term_code, crn)`.
- **email_logs**: `id`, `email`, `email_type` (WELCOME/GOODBYE/CLASS_AVAILABILITY; Hibernate CHECK constraint that ddl-auto never updates), `sent_at`, `subject varchar(500)`.
- **announcements**: `id`, `message varchar(500)`, `created_at`, `expires_at`, `active`, `type` (default "warning"), `created_by` not null (free text).
- `SectionGrade` is in-memory only. All queries JPQL, no native.

Drift signs: `ddl-auto=update` (properties:36); stale IntelliJ snapshot of a local DB shows `notification_logs`, `users.id/google_id/phone_number`, `watched_classes.last_checked_at/last_known_*`. **Run `\d+` on every prod table before migrating.** Timestamps are `LocalDateTime` (no tz). **Time-zone bug:** announcement `expiresAt` is naive browser-local but compared to server `LocalDateTime.now()`; if server is UTC, announcements expire 4–5 h early.

### Proposed clean schema (keeps data)
```sql
BEGIN;
ALTER TABLE users
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
UPDATE users SET created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now());
ALTER TABLE users
  ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL, ALTER COLUMN updated_at SET DEFAULT now();
CREATE UNIQUE INDEX users_google_sub_key  ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

DELETE FROM watched_classes a USING watched_classes b
 WHERE a.user_id = b.user_id AND a.term = b.term AND a.crn = b.crn AND a.id > b.id;
DELETE FROM watched_classes WHERE subject IS NULL OR course_number IS NULL;
ALTER TABLE watched_classes
  ALTER COLUMN subject SET NOT NULL, ALTER COLUMN course_number SET NOT NULL,
  ALTER COLUMN notified_at TYPE timestamptz USING notified_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at  TYPE timestamptz USING created_at  AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at  TYPE timestamptz USING updated_at  AT TIME ZONE 'UTC',
  ADD COLUMN last_closed_at timestamptz,
  ADD CONSTRAINT watched_classes_term_fmt CHECK (term ~ '^\d{6}$'),
  ADD CONSTRAINT watched_classes_user_term_crn_key UNIQUE (user_id, term, crn);
-- drop Hibernate's auto-named FK, then:
ALTER TABLE watched_classes ADD CONSTRAINT watched_classes_user_fk
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
CREATE INDEX watched_classes_course_idx ON watched_classes (term, subject, course_number);

DELETE FROM user_schedules s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = s.user_id);
ALTER TABLE user_schedules
  ALTER COLUMN added_at TYPE timestamptz USING added_at AT TIME ZONE 'UTC',
  ALTER COLUMN added_at SET DEFAULT now(),
  ADD CONSTRAINT user_schedules_user_fk FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE email_logs
  ALTER COLUMN sent_at TYPE timestamptz USING sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN sent_at SET DEFAULT now(),
  ADD COLUMN term text, ADD COLUMN crn text;
UPDATE email_logs SET crn = substring(subject from 'CRN (\d+)') WHERE email_type = 'CLASS_AVAILABILITY';
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_email_type_check
  CHECK (email_type IN ('WELCOME','GOODBYE','CLASS_AVAILABILITY','CUSTOM'));
CREATE INDEX email_logs_lookup_idx ON email_logs (email, email_type, sent_at DESC);

ALTER TABLE announcements
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'America/New_York',
  ALTER COLUMN created_at SET DEFAULT now(),
  ADD CONSTRAINT announcements_type_check CHECK (type IN ('info','warning','error'));

CREATE TABLE grade_terms (term char(6) PRIMARY KEY, fetched_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE section_grades (
  term char(6) NOT NULL REFERENCES grade_terms(term) ON DELETE CASCADE,
  crn text NOT NULL, subject text NOT NULL, course_number text NOT NULL, section text NOT NULL DEFAULT '',
  professor text, professor_key text, instruction_method text,
  grade_a int NOT NULL DEFAULT 0, grade_b int NOT NULL DEFAULT 0, grade_c int NOT NULL DEFAULT 0,
  grade_d int NOT NULL DEFAULT 0, grade_f int NOT NULL DEFAULT 0,
  a_plus int NOT NULL DEFAULT 0, a_flat int NOT NULL DEFAULT 0, a_minus int NOT NULL DEFAULT 0,
  b_plus int NOT NULL DEFAULT 0, b_flat int NOT NULL DEFAULT 0, b_minus int NOT NULL DEFAULT 0,
  c_plus int NOT NULL DEFAULT 0, c_flat int NOT NULL DEFAULT 0, c_minus int NOT NULL DEFAULT 0,
  wf int NOT NULL DEFAULT 0, withdraw_count int NOT NULL DEFAULT 0, other_count int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0, gpa numeric(4,2),
  PRIMARY KEY (term, crn)
);
CREATE INDEX section_grades_course_idx ON section_grades (subject, course_number);
CREATE TABLE syllabi (term char(6) NOT NULL, crn text NOT NULL, path text NOT NULL,
                      fetched_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (term, crn));
CREATE TABLE rmp_cache (query_key text PRIMARY KEY, payload jsonb NOT NULL,
                        fetched_at timestamptz NOT NULL DEFAULT now());
COMMIT;
```

## 5. Auth
1. SPA → `GET /api/auth/google/login`; sets httpOnly Secure 10-min `pw_oauth_state` cookie (no SameSite → Lax), 302 to Google.
2. Callback compares `state` to cookie, clears it, exchanges code, fetches userinfo.
3. `upsertGoogleUser` **matches on email first**; new email → new UUID + welcome email **inside the DB transaction** (`UserService.java:42-77`).
4. JWT issued; 302 to `FRONTEND_URL/auth/callback#token=<jwt>`. SPA stores in `localStorage['pw_token']`.

Token claims: `sub, email, name, picture, iat, exp`. Lifetime default **30 days**; no refresh/revocation (deleting the account effectively revokes since the interceptor loads the user). **Not necessarily HS256:** jjwt picks alg from key length; 64-char secret → HS512.

Admin: `ADMIN_EMAILS` CSV, case-insensitive, re-parsed every call; check repeated in 13 handlers.

Security: 30-day bearer in localStorage (XSS exposure) → use httpOnly cookie on same-origin Next.js. Email-based linking without `email_verified`. No Google timeouts. Public unthrottled proxies to GoSolar/RMP/CDN. Unescaped HTML in emails (course title from GoSolar, Google display name). `e.getMessage()` leaked widely. Announcement mass assignment (admin only).

## 6. Dead, duplicate, broken

Dead: `JwtService.getEmailFromToken`; `AnnouncementService.getAnnouncementById`; `WatchedClassRepository.deleteByUserAndCrnAndTerm`; `WatchedClassExpiryPolicy.isExpiringSoon`/`WARN_LEAD_DAYS` (tests only); `Announcement.isExpired()` (serialized but frontend recomputes); endpoints `/watched-classes/check`, `/admin/emails/stats`, `/admin/emails/cleanup` and their service methods; `PantherWatchService.resetRequestForm` (resets a fresh anonymous session, adds up to 10 s per search); `buildCustomEmail` ignores `userName`; `@JsonProperty` on `@ModelAttribute` DTOs misleading; `server.tomcat.max-threads=50` is **ignored** (real key is `server.tomcat.threads.max`), Tomcat runs default 200; `spring.main.lazy-initialization=false` and `spring.jmx.enabled=false` restate defaults; 4 oldest grade CSVs never loaded (termsWindow=8).

Duplicated: group-by-course/search/index flow in `CourseWatcher.checkCourseGroup` and `WatchedClassController.fetchGroupDetails`; two "Last, First (Preferred)" name parsers (`GradeDistributionService.normalizeName`, `ProfessorRatingService.parseName`); two anti-spam mechanisms; many unrelated expiry rules; Resend boilerplate ×4, admin check ×13, error-map building everywhere; `/api/courses/terms` bypasses `getCachedTerms`.

Bugs: (1) reopen-within-6h swallowed; (2) Optional with multiple rows; (3) duplicate watches possible; (4) failed syllabus fetch hides term for 6 h; (5) announcements expire early (tz); (6) grade data lost on every deploy, `hasData:false` until re-download, terms without posted grades consume window slots; (7) CourseWatcher blocks on common pool; (8) docs drift (`static/index.html` claims `isPartialData`, README still documents Supabase); (9) welcome email inside DB tx; (10) 200 with `success:false`; (11) possible `isSectionLinked`/`sectionLinked` double serialization (unverified).

Tests: `PantherWatchApplicationTests.contextLoads` is **harmful** (needs live Postgres + all secrets; starts schedulers → real GoSolar calls, possible APEX download, possibly real emails). Delete. `PantherWatchServiceTest` low value. `GradeDistributionServiceTest` and `ProfessorRatingServiceTest` test real parsing → port to TS. `WatchedClassExpiryPolicyTest` half dead. **Nothing tests the seat-alert re-arm/notify logic.**

Junk: `HELP.md`, `.idea/**`, `*.iml`, `.vscode/`, `.env` (gitignored/untracked, local only). `frontend-android/.idea/**` **is tracked**. Stale worktree `.claude/worktrees/admiring-curie-0dc794/`. Supabase leftovers are comments + README only. `static/index.html` is the hand-written API reference page at root of api.pantherwatch.app. pom: web + webflux both included (webflux only for WebClient), Lombok pinned 1.18.32, empty Initializr placeholders.

## 7. Migration difficulty per feature

| Feature | Needs | On Next.js / Vercel Hobby | Risk |
|---|---|---|---|
| Seat alerts | every 5 min, G groups × 2 GoSolar calls fresh connections, DB, Resend, no overlap | External trigger → `POST /api/cron/watch` with `Authorization: Bearer $CRON_SECRET`. `pg_try_advisory_lock`, promise pool 4–8, `AbortSignal.timeout(10s)`, fresh undici Agent per group, atomic send claim, batched Resend | **High** |
| GoSolar search/terms/subjects | 2-step session, F5 cookie, <30 s | Node route handler, per-request Agent, `redirect:'manual'`. Cache terms 1 h. Drop reset call | Med |
| Full details | fan-out, ≤25 s | `Promise.allSettled`, capped concurrency, 20 s overall | Med |
| Grade distributions | APEX session, 3 calls/term, 60 s timeouts, ~730 KB CSV/term, monthly | Daily Vercel cron processes **one** missing term per run into `section_grades`. Aggregate in SQL. Backfill once from local CSVs | Med |
| Syllabus | 3–4 MB JSON/term, no CORS | Daily cron ingests into `syllabi`; route = PK lookup | Low–Med |
| RMP | 1 POST/professor | trivial route + `rmp_cache` ~24 h | Low |
| Google OAuth + session | secret, cookie | hand-written ~100 lines; match `google_sub` then verified email; httpOnly cookie (logs everyone out once) | Low–Med |
| Email | key, templates | `resend` SDK, escape values | Low |
| Schedule/announcements/admin/delete | DB, admin list | CRUD routes or server actions; `ON DELETE CASCADE` | Low |
| Cleanup | daily | Vercel daily cron, CRON_SECRET | Low |
| Postgres | serverless connections | Supabase pooled; run §4 migration once; stop ddl-auto | Med |

Open questions: actual prod schema (`\d+`), prod JVM time zone, peak unique course groups per cycle, whether APEX/Cloudflare accept Vercel IPs.
