/**
 * The one seat-availability rule, shared by the seat watcher, the track-while-open check and
 * (later) the course card. Pure: safe on the server and the client.
 *
 * Cross-listed sections (`crossList` set) share a seat pool with their partner sections, so a
 * seat is only takeable when BOTH the section's own `seatsAvailable` and the pool's
 * `crossListAvailable` are positive. A waitlist (`waitCount > 0`) gets any opening first.
 */
import type { CourseData } from "./types";

/** The fields the rule reads. Cross-list fields are optional (absent = not cross-listed). */
export type SeatFields = Pick<CourseData, "seatsAvailable" | "waitCount"> &
  Partial<Pick<CourseData, "crossList" | "crossListAvailable">>;

const isCrossListed = (section: SeatFields): boolean => Boolean(section.crossList?.trim());

/**
 * Seats a student could actually take: the smaller of the section's own seats and the shared
 * pool's when cross-listed, else the section's own. A cross-listed section whose pool count is
 * missing (not a finite number) falls back to its own seats rather than reading as full.
 */
export function effectiveSeatsAvailable(section: SeatFields): number {
  const own = section.seatsAvailable;
  const pool = section.crossListAvailable;
  if (!isCrossListed(section) || typeof pool !== "number" || !Number.isFinite(pool)) return own;
  return Math.min(own, pool);
}

/** Open = an effective seat available and nobody on the waitlist. */
export function sectionIsOpen(section: SeatFields): boolean {
  return section.waitCount === 0 && effectiveSeatsAvailable(section) > 0;
}
