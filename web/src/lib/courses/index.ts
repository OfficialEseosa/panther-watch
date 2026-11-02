import "server-only";

export { isUpstreamError } from "./errors";
export { gosolarOptions, setGoSolarOptionsForTests } from "./gosolar-options";
export {
  BATCH_META_MAX,
  batchMetaSchema,
  getBatchMeta,
  getSectionMeta,
  sectionMetaSchema,
  type MetaSources,
  type SectionMeta,
  type SectionMetaInput,
} from "./meta";
export {
  getSectionRequirements,
  sectionRequirementsSchema,
  type SectionRequirements,
  type SectionRequirementsInput,
} from "./requirements";
export {
  countSections,
  getTerms,
  searchCourseList,
  searchCourseListSchema,
  searchSections,
  searchSectionsSchema,
  searchSubjects,
  searchSubjectsSchema,
  type SearchCourseListInput,
  type SearchCourseListResult,
  type SearchPair,
  type SearchSectionsInput,
  type SearchSubjectsInput,
} from "./search";
export { termClosedReason, type TermClosedReason } from "./term-guard";
export { currentTerms, getTermStatus, type TermInfo, type TermStatus } from "./terms";
export * from "./validation";
