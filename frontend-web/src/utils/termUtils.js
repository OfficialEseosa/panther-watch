// Term-related helpers shared across search, tracking, and the schedule builder.

/**
 * GoSolar marks terms whose registration window has closed with a
 * "(View only)" suffix in the description. Those terms can still be browsed,
 * but classes in them can no longer be tracked or scheduled.
 */
export const isViewOnlyTerm = (term) =>
  typeof term?.description === 'string' &&
  term.description.toLowerCase().includes('view only');
