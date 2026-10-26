/**
 * The one professor-name normalizer. Replaces the two Java copies
 * (`GradeDistributionService.normalizeName` and `ProfessorRatingService.parseName`), which
 * disagreed on edge cases.
 *
 * Sources and their quirks:
 * - APEX grade CSVs: clean "Last, First" ("Dayananda, Mathes A.", "Smith Jr., Edward").
 * - GoSolar `faculty[].displayName`: "Nemira, Alina (Alina) " (parenthetical preferred name,
 *   trailing space), "Bal, Abdullah  ." (stray dot).
 * - Free text / RMP: "First Last", "First M. Last".
 *
 * `key` is a stable lowercase `last|first` string: diacritics folded, punctuation other than
 * hyphens dropped, generational suffixes removed, middle names/initials ignored. It is what
 * `section_grades.professor_key` stores and what the RMP cache is keyed on, so both sides of
 * every comparison must go through `parseName`.
 */

export interface ParsedName {
  /** Display-cased given name (first token only), e.g. "Alina". May be "" for a single-token name. */
  first: string;
  /** Display-cased family name without suffix, e.g. "Saghaeiannejad Esfahani". */
  last: string;
  /** Preferred name from a parenthetical, e.g. "Alina" in "Nemira, Alina (Alina)". */
  preferred?: string;
  /** Stable `last|first` match key, lowercase ASCII. */
  key: string;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
const PLACEHOLDERS = new Set(["tba", "staff", "tbd"]);

/** Lowercase, strip diacritics, keep only a-z, spaces and hyphens. */
export function foldNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSuffix(token: string): boolean {
  return SUFFIXES.has(foldNamePart(token));
}

function dropSuffixes(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 1 && isSuffix(out[out.length - 1])) out.pop();
  return out;
}

/** Folded family name without trailing suffixes: "Smith Jr." -> "smith". */
export function foldLastName(value: string): string {
  return dropSuffixes(foldNamePart(value.replace(/\./g, " ")).split(" ").filter(Boolean)).join(" ");
}

/** Parses a raw display name. Returns null for blank or placeholder names ("TBA"). */
export function parseName(raw: string | null | undefined): ParsedName | null {
  if (!raw) return null;

  let preferred: string | undefined;
  const withoutParens = raw.replace(/\(([^)]*)\)/g, (_match, inner: string) => {
    const value = inner.replace(/\s+/g, " ").trim();
    if (!preferred && value) preferred = value;
    return " ";
  });

  // Dots become spaces ("A." -> "A", "Abdullah  ." -> "Abdullah"), then collapse.
  const cleaned = withoutParens.replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || PLACEHOLDERS.has(foldNamePart(cleaned))) return null;

  let first: string;
  let last: string;
  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    // "Last, First Middle" (a second comma, as in "Smith, Edward, Jr", is just noise).
    const lastTokens = dropSuffixes(cleaned.slice(0, comma).split(" ").filter(Boolean));
    const givenTokens = cleaned
      .slice(comma + 1)
      .replace(/,/g, " ")
      .split(" ")
      .filter((token) => token && !isSuffix(token));
    last = lastTokens.join(" ");
    first = givenTokens[0] ?? "";
  } else {
    // "First Middle Last [Suffix]"
    const tokens = dropSuffixes(cleaned.split(" ").filter(Boolean));
    if (tokens.length === 1) {
      first = "";
      last = tokens[0];
    } else {
      first = tokens[0];
      last = tokens[tokens.length - 1];
    }
  }

  const lastKey = foldNamePart(last);
  const firstKey = foldNamePart(first).replace(/\s+/g, "");
  if (!lastKey && !firstKey) return null;

  const parsed: ParsedName = { first, last, key: `${lastKey}|${firstKey}` };
  if (preferred) parsed.preferred = preferred;
  return parsed;
}

/** `parseName(raw)?.key ?? null`. */
export function professorKey(raw: string | null | undefined): string | null {
  return parseName(raw)?.key ?? null;
}

/** True when both names normalize to the same key. */
export function sameProfessor(a: string | null | undefined, b: string | null | undefined): boolean {
  const keyA = professorKey(a);
  return keyA !== null && keyA === professorKey(b);
}
