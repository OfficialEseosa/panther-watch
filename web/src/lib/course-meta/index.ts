// Course metadata: grade distributions (GSU APEX), RateMyProfessors ratings, syllabi, the course catalog.
export type { CourseMetaDb, DbOptions } from "./db";
export { CourseMetaHttpError, type FetchLike } from "./http";
export { foldLastName, foldNamePart, parseName, professorKey, sameProfessor, type ParsedName } from "./names";

export {
  createApexSession,
  downloadTermCsvs,
  extractRegionIds,
  parsePInstance,
  parseTermOptions,
  type ApexOptions,
  type ApexSession,
  type RegionIds,
  type TermCsvs,
} from "./grades/apex";
export {
  gradeCsvKind,
  isTermPosted,
  looksLikeGradeCsv,
  parseCsv,
  parseTerm,
  weightedGpa,
  type GradeCsvKind,
  type SectionGradeRow,
} from "./grades/parse";
export {
  DEFAULT_TERM_WINDOW,
  chooseNextTerm,
  getCourseGrades,
  listIngestedTerms,
  markTermUnposted,
  pickNextTermToIngest,
  upsertTerm,
  type CourseGradesQuery,
} from "./grades/store";
export { ingestNextTerm, type IngestOptions, type IngestResult } from "./grades/ingest";
export { GRADE_KEYS, type GradeAggregate, type GradeDistributionResponse, type GradeKey } from "./grades/types";

export {
  bestMatch,
  getProfessorRating,
  searchTeachers,
  type ProfessorRating,
  type RatingOptions,
  type RmpTeacher,
} from "./rmp";
export { getSyllabus, ingestSyllabiForTerm, syllabusUrl, type SyllabiIngestResult } from "./syllabi";
export {
  CATALOG_LEVELS,
  catalogRefreshState,
  refreshCatalog,
  type CatalogLevel,
  type CatalogTermResult,
  type RefreshCatalogOptions,
  type RefreshCatalogResult,
} from "./catalog";
export {
  findCourses,
  type CatalogCandidate,
  type CatalogConfidence,
  type FindCoursesOptions,
  type FindCoursesResult,
} from "./catalog-lookup";
