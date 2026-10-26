# web/data

Static data committed with the app. Nothing here is read at runtime; scripts load it into the
database.

## grade-csv/

GSU grade distributions, one pair of files per term (`202205` to `202605`, 13 terms):

- `<term>__summary.csv`: `CRN, Course, Professor, A (90-100) ... F <60, WF, DWF, W, CRS AVG,
  Other, Total, Instruction Method`
- `<term>__detailed.csv`: `CRN, A+, A, A-, B+ ... Other, Total, Instruction Method` (the +/- split)

**Provenance.** These are the two CSV exports of GSU's grade-distribution APEX app
(`dssapex.gsu.edu`, app 140, page 184), one export per term covering every subject. The old
Spring backend downloaded them into `backend/grade-data/`; they were copied here unchanged on
2026-10-26 so the new app does not depend on the old backend's directory.

**Why they are committed.** APEX now sits behind a Cloudflare challenge that blocks non-browser
clients, so neither the server nor a script can download them anymore. These files are the
source of truth for the grade history that the course cards show.

**Loading.** `npx tsx scripts/backfill-grades.ts` (from `web/`, with `DATABASE_URL` and
`DATABASE_CA_CERT` set) parses every pair here and upserts it into `grade_terms` /
`section_grades`. Re-running it is safe. See `scripts/README.md` and
`docs/runbooks/cutover-checklist.md`.

**Refreshing (a new term's grades posted).** Either:

1. Admin upload: open the APEX page in a normal browser, export the term's summary and detailed
   CSVs, and upload both through the admin grade upload (`POST /api/admin/grades/upload`). This
   writes straight to the database. Also commit the two files here as
   `<term>__summary.csv` / `<term>__detailed.csv`, so a rebuilt database gets them too.
2. Backfill: export the two CSVs in a browser, save them here with those names, and re-run
   `npx tsx scripts/backfill-grades.ts --terms <term>`.

Posted grades do not change, so a term only needs exporting once after its grades post. A term
whose files have no `CRS AVG` values yet is recorded as unposted and stores no rows.
