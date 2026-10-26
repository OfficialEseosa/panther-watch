import { describe, expect, it } from "vitest";
import { decide, isOpen, observe, REARM_AFTER_MS, type Observation, type WatchAction, type WatchState } from "@/lib/watcher/state";

const now = new Date("2026-08-20T14:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("isOpen / observe", () => {
  it.each([
    [{ seatsAvailable: 3, waitCount: 0 }, true],
    [{ seatsAvailable: 1, waitCount: 0 }, true],
    [{ seatsAvailable: 0, waitCount: 0 }, false],
    [{ seatsAvailable: 3, waitCount: 1 }, false],
    [{ seatsAvailable: 0, waitCount: 5 }, false],
    [{ seatsAvailable: -1, waitCount: 0 }, false],
  ])("%o -> open=%s", (section, open) => {
    expect(isOpen(section)).toBe(open);
    expect(observe(section)).toBe(open ? "open" : "closed");
  });

  it("treats a missing section as unknown", () => {
    expect(observe(undefined)).toBe("unknown");
  });
});

describe("decide", () => {
  const armed: WatchState = { notifiedAt: null, lastClosedAt: null };
  const armedStaleDebounce: WatchState = { notifiedAt: null, lastClosedAt: ago(10 * 60_000) };
  const notified: WatchState = { notifiedAt: ago(60 * 60_000), lastClosedAt: null };
  const closedJustNow: WatchState = { notifiedAt: ago(60 * 60_000), lastClosedAt: ago(30_000) };
  const closedAtThreshold: WatchState = { notifiedAt: ago(60 * 60_000), lastClosedAt: ago(REARM_AFTER_MS) };
  const closedLastRun: WatchState = { notifiedAt: ago(60 * 60_000), lastClosedAt: ago(3 * 60_000) };
  const closedInFuture: WatchState = { notifiedAt: ago(60 * 60_000), lastClosedAt: new Date(now.getTime() + 60_000) };

  const table: Array<[string, WatchState, Observation, WatchAction]> = [
    ["armed, open", armed, "open", "notify"],
    ["armed with leftover last_closed_at, open", armedStaleDebounce, "open", "notify"],
    ["armed, closed", armed, "closed", "none"],
    ["armed with leftover last_closed_at, closed", armedStaleDebounce, "closed", "none"],
    ["armed, unknown", armed, "unknown", "none"],
    ["notified, open", notified, "open", "none"],
    ["notified, closed (first closed reading)", notified, "closed", "mark_closed"],
    ["notified, unknown", notified, "unknown", "none"],
    ["closed once, open again (blip)", closedLastRun, "open", "clear_debounce"],
    ["closed once seconds ago, closed (same run re-triggered)", closedJustNow, "closed", "none"],
    ["closed once exactly rearmAfterMs ago, closed", closedAtThreshold, "closed", "rearm"],
    ["closed last run, closed again", closedLastRun, "closed", "rearm"],
    ["closed once, unknown", closedLastRun, "unknown", "none"],
    ["last_closed_at in the future (clock skew), closed", closedInFuture, "closed", "none"],
  ];

  it.each(table)("%s -> %s", (_name, row, observation, action) => {
    expect(decide(row, observation, now)).toBe(action);
  });

  it("honours a custom rearm window", () => {
    expect(decide(closedLastRun, "closed", now, 4 * 60_000)).toBe("none");
    expect(decide(closedLastRun, "closed", now, 3 * 60_000)).toBe("rearm");
  });

  it("re-arms on the second consecutive closed run at the 3-minute cadence, even with jitter", () => {
    // Worst case: first reading late in run N (t+25 s), second early in run N+1 (t+180 s).
    const first = new Date(now.getTime() - (180 - 25) * 1000);
    expect(decide({ notifiedAt: ago(3_600_000), lastClosedAt: first }, "closed", now)).toBe("rearm");
  });
});
