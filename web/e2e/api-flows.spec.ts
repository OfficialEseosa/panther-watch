import { SAME_ORIGIN, SEED, STUDENT, db, expect, fake, login, resetAll, runWatcher, test } from "./support";

const { term, csc1301, math2211 } = SEED;

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("course search returns the fake's sections", async ({ request }) => {
  const response = await request.get(`/api/courses/search?term=${term}&subject=CSC&courseNumber=1301`);
  expect(response.status()).toBe(200);
  const { sections } = await response.json();
  expect(sections.map((s: { courseReferenceNumber: string }) => s.courseReferenceNumber).sort()).toEqual([
    csc1301.open,
    csc1301.closed,
  ]);
  const open = sections.find((s: { courseReferenceNumber: string }) => s.courseReferenceNumber === csc1301.open);
  expect(open).toMatchObject({ term, subject: "CSC", courseNumber: "1301", seatsAvailable: 3 });

  // The whole round trip went through the fake (declare term, then search with its cookies).
  const paths = (await fake.requests()).map((r) => r.path);
  expect(paths).toContain("/term/search");
  expect(paths).toContain("/searchResults/searchResults");
});

test("watch add / list / remove round trip", async ({ request }) => {
  expect((await request.get("/api/watches")).status()).toBe(401);
  await login(request);

  const body = { term, crn: csc1301.open, subject: "CSC", courseNumber: "1301", courseTitle: "Principles of Computer Science I" };
  const added = await request.post("/api/watches", { headers: SAME_ORIGIN, data: body });
  expect(added.status()).toBe(201);
  expect((await added.json()).watch).toMatchObject({ term, crn: csc1301.open, notifiedAt: null });

  // Idempotent.
  const again = await request.post("/api/watches", { headers: SAME_ORIGIN, data: body });
  expect(again.status()).toBe(200);
  expect((await again.json()).created).toBe(false);

  const list = await (await request.get("/api/watches")).json();
  expect(list.count).toBe(1);
  expect(list.watches[0]).toMatchObject({ crn: csc1301.open, subject: "CSC" });

  const removed = await request.delete(`/api/watches?term=${term}&crn=${csc1301.open}`, { headers: SAME_ORIGIN });
  expect(await removed.json()).toEqual({ removed: true });
  expect((await (await request.get("/api/watches")).json()).count).toBe(0);
});

test("watch mutations are refused without a same-origin Origin (CSRF)", async ({ request }) => {
  await login(request);
  const response = await request.post("/api/watches", {
    headers: { Origin: "https://evil.example" },
    data: { term, crn: csc1301.open, subject: "CSC", courseNumber: "1301" },
  });
  expect(response.status()).toBe(403);
});

test("watching a view-only term is refused", async ({ request }) => {
  await login(request);
  const response = await request.post("/api/watches", {
    headers: SAME_ORIGIN,
    data: { term: SEED.viewOnlyTerm, crn: "80099", subject: "CSC", courseNumber: "1301" },
  });
  expect(response.status()).toBe(409);
});

test("schedule add / list / remove round trip", async ({ request }) => {
  await login(request);
  const added = await request.post("/api/schedule", {
    headers: SAME_ORIGIN,
    data: { term, crn: math2211.open, subject: "MATH", courseNumber: "2211", courseTitle: "Calculus of One Variable I" },
  });
  expect(added.status()).toBe(201);

  const { schedule } = await (await request.get("/api/schedule")).json();
  expect(Object.keys(schedule)).toEqual([term]);
  expect(schedule[term]).toHaveLength(1);
  expect(schedule[term][0]).toMatchObject({ crn: math2211.open, subject: "MATH", courseNumber: "2211" });

  const removed = await request.delete(`/api/schedule?term=${term}&crn=${math2211.open}`, { headers: SAME_ORIGIN });
  expect(await removed.json()).toEqual({ removed: true });
  expect((await (await request.get("/api/schedule")).json()).schedule).toEqual({});
});

test("cron watcher: alert on open, mark closed, re-arm, alert again", async ({ request }) => {
  expect((await request.post("/api/cron/watch?sync=1")).status()).toBe(401);

  const { userId } = await login(request);
  const added = await request.post("/api/watches", {
    headers: SAME_ORIGIN,
    data: { term, crn: csc1301.open, subject: "CSC", courseNumber: "1301" },
  });
  expect(added.status()).toBe(201);

  // 1. Open section, armed watch -> one seat alert through the fake Resend.
  const first = await runWatcher(request);
  expect(first).toMatchObject({ watches: 1, groups: 1, sectionsChecked: 1, errors: [] });
  expect(Number(first.emailsSent) + Number(first.emailsFailed)).toBe(1);
  expect(first.emailsSent).toBe(1);

  const runs = await db.jobRuns(request, "watcher");
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ id: first.jobRunId, ok: true });
  expect(runs[0].summary).toMatchObject({ emailsSent: 1 });

  const sent = await fake.emails();
  expect(sent).toHaveLength(1);
  expect(sent[0].body.to).toEqual(STUDENT.email);
  expect(sent[0].body.subject).toContain("CSC 1301");

  const log = await db.emailLog(request);
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ type: "class_availability", term, crn: csc1301.open, recipient: STUDENT.email });

  let [watch] = await db.watches(request, userId);
  expect(watch.notifiedAt).not.toBeNull();
  expect(watch.lastClosedAt).toBeNull();

  // 2. Still open -> no second alert.
  const repeat = await runWatcher(request);
  expect(repeat).toMatchObject({ emailsSent: 0, emailsFailed: 0, markedClosed: 0 });

  // 3. Section fills up -> first closed reading is recorded.
  await fake.setSeats({ subject: "CSC", courseNumber: "1301", crn: csc1301.open, seatsAvailable: 0 });
  const closed = await runWatcher(request);
  expect(closed).toMatchObject({ markedClosed: 1, rearmed: 0, emailsSent: 0 });
  [watch] = await db.watches(request, userId);
  expect(watch.lastClosedAt).not.toBeNull();

  // 4. A second closed reading REARM_AFTER_MS (2 min) later re-arms. Back-date instead of waiting.
  await db.patchWatch(request, { id: watch.id, lastClosedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
  const rearm = await runWatcher(request);
  expect(rearm).toMatchObject({ rearmed: 1, emailsSent: 0 });
  [watch] = await db.watches(request, userId);
  expect(watch).toMatchObject({ notifiedAt: null, lastClosedAt: null });

  // 5. A seat opens again -> a new alert.
  await fake.setSeats({ subject: "CSC", courseNumber: "1301", crn: csc1301.open, seatsAvailable: 2 });
  const reopened = await runWatcher(request);
  expect(reopened).toMatchObject({ emailsSent: 1 });
  expect(await fake.emails()).toHaveLength(2);
  expect(await db.jobRuns(request, "watcher")).toHaveLength(5);
});
