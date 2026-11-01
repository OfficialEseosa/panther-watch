import { z } from "zod";

/**
 * Input schemas shared by the course, watch and schedule routes. Pure (no server-only
 * imports) so client code can reuse them for form validation.
 */

/** GoSolar term code, `YYYYMM`, e.g. "202608". */
export const termCodeSchema = z.string().trim().regex(/^\d{6}$/, "term must be a 6-digit term code");

/** 5-digit course reference number. */
export const crnSchema = z.string().trim().regex(/^\d{5}$/, "crn must be 5 digits");

/** Subject code, normalized to upper case, e.g. "CSC". */
export const subjectSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,8}$/, "subject must be 2-8 letters");

/** Course number, normalized to upper case, e.g. "1301" or "1301L". */
export const courseNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,8}$/, "courseNumber must be 1-8 letters or digits");

/** GoSolar `txt_level`, e.g. "US" (undergraduate) or "GS" (graduate). */
export const levelSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,4}$/, "level must be 1-4 letters or digits");

/** Free text from a GoSolar section (course title, instructor display name). */
export const displayTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

/** Turns empty query-string values into "absent" so optional params can be left blank. */
export const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Most course numbers one results search takes ("4352,4350,4110"). */
export const MAX_COURSE_NUMBERS = 6;
/** Most (subject, course number) GoSolar searches one results page runs. */
export const MAX_SEARCH_PAIRS = 10;

/**
 * One or more course numbers separated by commas and/or spaces ("4352, 4350 4110"), normalized
 * to upper case and deduplicated in order: 1-6 numbers, each 1-8 letters or digits.
 */
export const courseNumberListSchema = z
  .string()
  .transform((value) => [...new Set(value.split(/[\s,]+/).filter(Boolean).map((part) => part.toUpperCase()))])
  .pipe(
    z
      .array(z.string().regex(/^[A-Z0-9]{1,8}$/, "each course number must be 1-8 letters or digits"))
      .min(1, "enter at least one course number")
      .max(MAX_COURSE_NUMBERS, `search up to ${MAX_COURSE_NUMBERS} course numbers at a time`),
  );
