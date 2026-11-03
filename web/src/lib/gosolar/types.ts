/**
 * GoSolar (Banner SSB) JSON shapes, ported field-for-field from the Spring DTOs in
 * backend/.../api/*.java. Property names are the JSON names GoSolar sends (the DTOs'
 * @JsonProperty values). Java object fields could be null, so strings and arrays are
 * nullable here; Java primitives (int/boolean) are not.
 */

/**
 * Differs from Faculty.java on purpose, to match live GoSolar (verified 2026-10-25): the
 * Java DTO mapped `banner_id` (always null, GoSolar sends `bannerId`) and typed
 * `primaryIndicator` as String (GoSolar sends a boolean). The frontend uses neither.
 */
export interface Faculty {
  bannerId: string | null;
  courseReferenceNumber: string | null;
  displayName: string | null;
  emailAddress: string | null;
  primaryIndicator: boolean;
}

export interface MeetingTime {
  beginTime: string | null;
  buildingDescription: string | null;
  campusDescription: string | null;
  category: string | null;
  endDate: string | null;
  endTime: string | null;
  sunday: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  hoursWeek: number;
  meetingTypeDescription: string | null;
  room: string | null;
  startDate: string | null;
}

export interface MeetingsFaculty {
  category: string | null;
  meetingTime: MeetingTime | null;
}

/**
 * One `sectionAttributes[]` entry. Live codes seen (2026-11): LF2F, SONL, LONL, HYB (delivery
 * mode), HC (honors), ZNCM / ZLCM (no-/low-cost materials); `description` is the readable name.
 */
export interface SectionAttribute {
  code: string | null;
  description: string | null;
  courseReferenceNumber?: string | null;
  termCode?: string | null;
  isZTCAttribute?: boolean;
}

export interface CourseData {
  term: string | null;
  termDesc: string | null;
  courseReferenceNumber: string | null;
  partOfTerm: string | null;
  courseNumber: string | null;
  subject: string | null;
  subjectDescription: string | null;
  sequenceNumber: string | null;
  campusDescription: string | null;
  scheduleTypeDescription: string | null;
  courseTitle: string | null;
  /** Null in practice on live GoSolar; the credit value is `creditHourLow` (and `creditHourHigh`). */
  creditHours: number | null;
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
  creditHourHigh: number;
  creditHourLow: number;
  linkIdentifier: string | null;
  isSectionLinked: boolean;
  subjectCourse: string | null;
  faculty: Faculty[] | null;
  meetingsFaculty: MeetingsFaculty[] | null;

  // Fields below are sent by live GoSolar but absent from the old Java DTOs. Optional so
  // hand-built CourseData stand-ins (tracked-page stubs, fixtures) stay valid without them.

  /**
   * Cross-list group id, or null when the section is not cross-listed. Cross-listed sections
   * share one seat pool: a seat is only takeable when BOTH this section's `seatsAvailable` and
   * the pool's `crossListAvailable` are positive. See `@/lib/gosolar/seats`.
   */
  crossList?: string | null;
  /** Seat capacity of the whole cross-list group (null when not cross-listed). */
  crossListCapacity?: number | null;
  /** Enrollment across the whole cross-list group (null when not cross-listed). */
  crossListCount?: number | null;
  /** Seats left in the cross-list group's shared pool (null when not cross-listed). */
  crossListAvailable?: number | null;
  /** Section attributes (delivery mode, honors, materials cost), possibly empty. */
  sectionAttributes?: SectionAttribute[] | null;
  /** e.g. "Fully Online", "Hybrid", "Face-to-Face". */
  instructionalMethodDescription?: string | null;
  /** GoSolar's own open flag. Not used for alerts (it ignores the waitlist rule). */
  openSection?: boolean;
  /** Reserved-seat breakdown when the section has reserved seats; shape not relied on. */
  reservedSeatSummary?: Record<string, unknown> | null;
}

/** `GET /classSearch/getTerms` item. Description ends in "(View only)" for closed terms. */
export interface Term {
  code: string;
  description: string;
}

/** `GET /classSearch/get_subject` item. */
export interface Subject {
  code: string;
  description: string;
}

/** Raw `GET /searchResults/searchResults` body. */
export interface SearchResponse {
  success: boolean;
  totalCount: number;
  data: CourseData[] | null;
  pageOffset: number;
  pageMaxSize: number;
}

/** A search response after the affinity check: `data` is always an array. */
export interface SearchResult extends SearchResponse {
  data: CourseData[];
}

export interface SearchParams {
  subject: string;
  courseNumber?: string;
  /** GoSolar `txt_level` (e.g. "US", "GS"). Omitted from the query when blank. */
  level?: string;
  pageOffset?: number;
  pageMaxSize?: number;
}

/**
 * One course of Banner's "Browse Course Catalog" search (`GET /courseSearchResults/
 * courseSearchResults`), the catalog entry rather than a section. Only the fields PantherWatch
 * reads; live GoSolar sends more (lecture/lab/billing hours, department, termStart/termEnd...).
 * Verified live 2026-11-02 (Spring 2027).
 */
export interface CatalogCourseData {
  subject: string | null;
  subjectCode?: string | null;
  subjectDescription?: string | null;
  courseNumber: string | null;
  /** Abbreviated upper-case title, e.g. "PRINCIPLES OF COMPUTER SCI I". */
  courseTitle: string | null;
  /**
   * The catalog text. Its first line is the full title ("Principles of Computer Science I."),
   * then usually "Prerequisite: ..." and the description proper.
   */
  courseDescription: string | null;
  collegeCode?: string | null;
  college?: string | null;
  creditHourLow: number | null;
  creditHourHigh: number | null;
  /** "TO" (a range) or "OR" (either value); null for a fixed credit value. */
  creditHourIndicator: string | null;
  termEffective?: string | null;
}

/** Raw `GET /courseSearchResults/courseSearchResults` body. */
export interface CatalogSearchResponse {
  success: boolean;
  totalCount: number;
  data: CatalogCourseData[] | null;
  pageOffset: number;
  pageMaxSize: number;
}

/** A catalog search response after the affinity check: `data` is always an array. */
export interface CatalogSearchResult extends CatalogSearchResponse {
  data: CatalogCourseData[];
}

export interface CatalogSearchParams {
  /** Subject codes, searched together (Banner takes a comma-separated `txt_subject`). */
  subjects: string[];
  pageOffset?: number;
  pageMaxSize?: number;
}
