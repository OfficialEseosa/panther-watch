/**
 * The canonical public origin (www host; pantherwatch.app 308s here). Used for canonical URLs
 * and structured data, which must name production even when rendered on a preview deployment.
 */
export const SITE_URL = "https://www.pantherwatch.app";

/** Absolute canonical URL for a path on the public site ("/" -> the bare origin). */
export const canonicalUrl = (path: string): string => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);
