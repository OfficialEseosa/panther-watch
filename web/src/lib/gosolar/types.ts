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
  creditHours: number;
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
