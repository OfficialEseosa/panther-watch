---
name: pantherwatch-course-search
description: Search Georgia State University (GSU) courses through PantherWatch's public JSON API - terms, live sections and seats, meeting days and times, grade history, RateMyProfessors ratings, schedule-conflict checks and section recommendations.
---

# PantherWatch course search (Georgia State University)

PantherWatch (https://www.pantherwatch.app) is a student-built GSU course browser. Its data comes from a public JSON API: no key, no login, CORS-enabled. **Call the API; don't scrape the pages.** Full reference: https://www.pantherwatch.app/developers

PantherWatch is not affiliated with Georgia State University. GoSolar is the source of truth for registration.

## Fair use
- At most **1 request per second**. Searches hit GSU's GoSolar live; ratings hit RateMyProfessors.
- Search each subject once and filter locally. Fetch meta only for sections you will actually show.
- Don't poll seat counts in a loop. Tell the user about Track on the site (email alerts when seats open).

## 1. Terms
`GET https://www.pantherwatch.app/api/courses/terms`
```json
{ "terms": [ { "code": "202701", "description": "Spring Semester 2027", "viewOnly": false }, ... ] }
```
Registrable terms come first (newest first), then past terms with `viewOnly: true`. Codes are `YYYYMM` (01 spring, 05 summer, 08 fall). Match the user's words ("spring", "next semester") to a `description`; never guess codes.

Unsure of a subject code? `GET /api/courses/subjects?term=202701&q=psych` -> `{ "subjects": [{ "code", "description" }] }` (max 50).

## 2. Sections
`GET https://www.pantherwatch.app/api/courses/search?term=202701&subject=CSC[&courseNumber=1301][&level=US]`
- One subject per call, any number of calls (about a second apart). Returns **every** matching section, no paging. Omit `courseNumber` for the whole subject. `level`: `US` undergraduate, `GS` graduate.
- Response: `{ "sections": [ ... ] }`, GoSolar's own records. Fields you need:

| Field | Meaning |
|---|---|
| `courseReferenceNumber` | CRN |
| `subject`, `courseNumber`, `sequenceNumber`, `courseTitle` | `CSC`, `1301`, `002`, `PRINCIPLES OF COMPUTER SCI I` (titles are upper case) |
| `seatsAvailable`, `maximumEnrollment`, `enrollment` | live seats (`seatsAvailable` can be negative: treat <= 0 as full) |
| `crossList`, `crossListAvailable` | cross-listed sections share a seat pool: takeable seats = `min(seatsAvailable, crossListAvailable)` when `crossList` is set |
| `waitCount`, `waitCapacity` | waitlist (capacity 0 = no waitlist) |
| `creditHourLow`, `creditHourHigh`, `creditHours` | credits; Low-High is a range for variable-credit courses |
| `faculty[].displayName`, `primaryIndicator` | `"Last, First (Nickname) "`; empty array = TBA |
| `meetingsFaculty[].meetingTime` | meeting rows, below |
| `sectionAttributes[].description` | e.g. "Area F Mathematics Electives", "Face to Face - Instruction" |
| `instructionalMethodDescription`, `campusDescription`, `scheduleTypeDescription` | delivery mode, "Atlanta", "Lecture" |

Each `meetingTime` has `monday` ... `sunday` booleans, `beginTime`/`endTime` as 24-hour `"HHMM"` strings (`null` = TBA or asynchronous), `buildingDescription`, `room`, `startDate`/`endDate` (`MM/DD/YYYY`), `meetingTypeDescription`. A section can have several rows (lecture + lab, split date ranges). Online rows have `buildingDescription: "Online"`. The mode is in `instructionalMethodDescription` ("Fully Distance 95% tech", "Partially Distance +50% tech") and `sectionAttributes` ("Asynchronous Online Instruct", "Hybrid/Partially Online", "Face to Face - Instruction"); hybrid sections have an in-person row plus an online row with null times.

Normalize once:
```js
const DAYS = [["monday","M"],["tuesday","T"],["wednesday","W"],["thursday","R"],["friday","F"],["saturday","S"],["sunday","U"]];
const mins = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(2) : null);
const rows = (s) => (s.meetingsFaculty ?? []).map(({ meetingTime: m }) => ({
  days: DAYS.filter(([k]) => m[k]).map(([, l]) => l).join(""),   // "MW", "" = no set days
  start: mins(m.beginTime), end: mins(m.endTime),                  // minutes after midnight
  where: [m.buildingDescription, m.room].filter(Boolean).join(" "),
  from: m.startDate, to: m.endDate,
}));
const instructor = (s) => ([...(s.faculty ?? [])].sort((a, b) => b.primaryIndicator - a.primaryIndicator)[0]?.displayName ?? "").trim() || null;
```

## 3. Grades, rating, syllabus (per section)
`GET https://www.pantherwatch.app/api/courses/meta?term=202701&subject=CSC&courseNumber=2720&crn=12992&instructor=<displayName>` (URL-encode `instructor`; pass the primary instructor's `displayName` as-is)
```json
{ "grades": { "hasData": true, "overall": { "gpa": 3.08, "dwfPercent": 12, "total": 2077, ... },
              "instructorHasTaught": true,
              "instructorDistribution": { "professor": "Islam, S M Towhidul", "gpa": 2.65, "dwfPercent": 16.1,
                "total": 790, "sectionsCount": 36, "termsTaught": ["202601", ...],
                "gradeCounts": { "A+": 38, "A": 76, "A-": 64, "B+": 74, ..., "F": 35, "WF": 0 } },
              "professors": [ ... ] },
  "rating": { "found": true, "avgRating": 3.7, "avgDifficulty": 2.8, "numRatings": 13,
              "wouldTakeAgainPercent": 76.9, "profileUrl": "https://www.ratemyprofessors.com/professor/2921056" },
  "syllabus": { "url": "https://cdn.gsu.edu/static/syllabi-public/files/....pdf" } }
```
- `instructorDistribution` (when `instructorHasTaught`) is this professor's own history for this course; `overall` is course-wide. `hasData: false` = no history (new course). `dwfPercent` counts D, F, WF and W.
- `rating.found: false` or `rating: null` means **unknown**, not bad. Any part is `null` when its lookup failed.
- Meta is the same all term: cache it. (`POST /api/courses/meta/batch` is same-origin only; it refuses other callers.)

## 4. If you can only read HTML
Each result card's seat panel has `data-crn`, `data-subject`, `data-course-number`, `data-term`, `data-seats-available` (takeable seats, cross-list pool applied), `data-wait-count`; the RMP pill has `data-rmp` (out of 5) and the grade line `data-gpa` with `data-gpa-scope` (`instructor` or `course`), absent when unknown; each meeting row (`li`) has `data-days="MW"` (M T W R F S U, empty for no set days) and `data-start="1100" data-end="1215"` (absent when TBA). Never infer days from chip styling.

## 5. Conflict checking
For each candidate keep CRN, meeting rows, and mode (in person, online synchronous, asynchronous, TBA). Two sections conflict when any pair of their rows shares a day letter, their date ranges overlap, and `a.start < b.end && b.start < a.end`. Rows with `start == null` or no days never conflict but list them as "time TBA / asynchronous". Add a travel buffer (e.g. 10-15 min) between in-person classes if the user wants one. Check the user's fixed commitments too (work, other classes) and, if they care, count distinct in-person days.

## 6. Recommending sections
- Rank by the professor's own history for this course (A share from `gradeCounts`, `gpa`, `dwfPercent`), not the course-wide average, and always show the sample size (`total` students, `sectionsCount`, terms). Treat one or two terms as weak evidence. For special-topics numbers, course-wide history covers unrelated topics.
- If the user sets an RMP minimum, apply it, but list unrated professors separately instead of silently dropping them; show `numRatings`.
- Show open seats and waitlist counts. `seatsAvailable <= 0` with `waitCount > 0` means new seats likely go to the waitlist first. Flag sections with very few seats.
- Give the user a link to check each pick: `https://www.pantherwatch.app/course-results?term=<TERM>&subjects=<SUBJ>&courseNumber=<NUM>&crn=<CRN>` opens that section's details.
- **PantherWatch does not show prerequisites, major or class restrictions, or which degree requirement a course satisfies** (`sectionAttributes` hints are not authoritative). Tell the user to confirm those in their degree audit (DegreeWorks) or with an advisor before registering, and to register in GoSolar.

## Errors
`{ "error": { "code", "message" } }`: `400 invalid_request` (message names the bad parameter), `502 upstream_unavailable` (GoSolar down: wait a minute, retry once), `500 internal_error`.
