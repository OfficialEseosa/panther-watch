/**
 * Request sequencing for search-as-you-type (pure, unit-tested): each request takes a ticket;
 * only the latest ticket's response may be applied, so a slow early response can never
 * overwrite a newer one.
 *
 *   const seq = createSequence();
 *   const ticket = seq.next();
 *   const data = await fetch(...);
 *   if (seq.isLatest(ticket)) apply(data);
 */
export interface Sequence {
  next: () => number;
  isLatest: (ticket: number) => boolean;
  /** Invalidates every outstanding ticket (e.g. on unmount). */
  cancel: () => void;
}

export function createSequence(): Sequence {
  let current = 0;
  return {
    next: () => ++current,
    isLatest: (ticket) => ticket === current,
    cancel: () => {
      current += 1;
    },
  };
}
