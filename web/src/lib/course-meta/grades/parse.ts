import { professorKey } from "../names";

/**
 * Parsing for the two CSV exports of APEX page 184 (one term, every subject).
 *
 * Summary headers (note the odd spacing, normalized below):
 *   CRN,Course,Professor,A  (90-100),B  (80-89),C  (70-79),D  (60-69),F <60,WF,A- WF,DWF,W,
 *   CRS AVG,Other ,Total,Instruction Method
 * Detailed headers:
 *   CRN,A+,A,A-,B+,B,B-,C+,C,C-,D,F,WF,A-WF,DWF,W,Other,Total,Instruction Method
 *
 * Both are keyed by CRN; the summary is authoritative for which sections exist and the
 * detailed file only adds the +/- split.
 */

/** One section's grades. Field names match the `section_grades` Drizzle columns. */
export interface SectionGradeRow {
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  section: string;
  professor: string | null;
  professorKey: string | null;
  instructionMethod: string | null;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeF: number;
  aPlus: number;
  aFlat: number;
  aMinus: number;
  bPlus: number;
  bFlat: number;
  bMinus: number;
  cPlus: number;
  cFlat: number;
  cMinus: number;
  wf: number;
  withdrawCount: number;
  otherCount: number;
  total: number;
  /** APEX "CRS AVG" (course GPA); null when not posted / no graded students. */
  gpa: number | null;
}

/** Minimal RFC 4180 parser: quoted fields, `""` escapes, CRLF/LF/CR, leading BOM. Skips blank lines. */
export function parseCsv(text: string | null | undefined): string[][] {
  const rows: string[][] = [];
  if (!text) return rows;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

const normalizeWs = (value: string) => value.replace(/\s+/g, " ").trim();

function columnIndex(headers: string[], match: (header: string) => boolean): number {
  return headers.findIndex(match);
}

function cell(cells: string[], index: number): string | null {
  return index >= 0 && index < cells.length ? cells[index].trim() : null;
}

function nonEmpty(value: string | null): string | null {
  return value ? value : null;
}

function toInt(value: string | null): number {
  if (value === null) return 0;
  const cleaned = value.replace(/[,\s]/g, "");
  return /^-?\d+$/.test(cleaned) ? Number.parseInt(cleaned, 10) : 0;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const cleaned = value.replace(/[,\s%]/g, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number.parseFloat(cleaned) : null;
}

/** "CSC 4520 " -> ["CSC","4520",""]; "PHYS 1111 K" -> ["PHYS","1111","K"]. */
export function splitCourse(course: string | null): [string, string, string] {
  if (!course) return ["", "", ""];
  const tokens = course.trim().split(/\s+/).filter(Boolean);
  return [tokens[0] ?? "", tokens[1] ?? "", tokens.slice(2).join(" ")];
}

const eq = (expected: string) => (header: string) => header === expected;
const eqi = (expected: string) => (header: string) => header.toLowerCase() === expected.toLowerCase();

export function parseSummaryCsv(csv: string, term: string): SectionGradeRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const h = rows[0].map(normalizeWs);
  const iCrn = columnIndex(h, eqi("CRN"));
  const iCourse = columnIndex(h, eqi("Course"));
  const iProf = columnIndex(h, eqi("Professor"));
  const iA = columnIndex(h, (x) => x.startsWith("A ") || x.includes("(90-100)"));
  const iB = columnIndex(h, (x) => x.includes("(80-89)"));
  const iC = columnIndex(h, (x) => x.includes("(70-79)"));
  const iD = columnIndex(h, (x) => x.includes("(60-69)"));
  const iF = columnIndex(h, (x) => x.startsWith("F") && x.includes("60"));
  const iWf = columnIndex(h, eq("WF"));
  const iW = columnIndex(h, eq("W"));
  const iGpa = columnIndex(h, eqi("CRS AVG"));
  const iOther = columnIndex(h, eqi("Other"));
  const iTotal = columnIndex(h, eqi("Total"));
  const iMethod = columnIndex(h, (x) => x.toLowerCase().includes("instruction"));

  const byCrn = new Map<string, SectionGradeRow>();
  for (const cells of rows.slice(1)) {
    const crn = cell(cells, iCrn);
    if (!crn || !/^\d{4,}$/.test(crn)) continue;
    const [subject, courseNumber, section] = splitCourse(cell(cells, iCourse));
    const professor = nonEmpty(cell(cells, iProf));
    byCrn.set(crn, {
      term,
      crn,
      subject: subject.toUpperCase(),
      courseNumber,
      section,
      professor,
      professorKey: professorKey(professor),
      instructionMethod: nonEmpty(cell(cells, iMethod)),
      gradeA: toInt(cell(cells, iA)),
      gradeB: toInt(cell(cells, iB)),
      gradeC: toInt(cell(cells, iC)),
      gradeD: toInt(cell(cells, iD)),
      gradeF: toInt(cell(cells, iF)),
      aPlus: 0,
      aFlat: 0,
      aMinus: 0,
      bPlus: 0,
      bFlat: 0,
      bMinus: 0,
      cPlus: 0,
      cFlat: 0,
      cMinus: 0,
      wf: toInt(cell(cells, iWf)),
      withdrawCount: toInt(cell(cells, iW)),
      otherCount: toInt(cell(cells, iOther)),
      total: toInt(cell(cells, iTotal)),
      gpa: toNumber(cell(cells, iGpa)),
    });
  }
  return [...byCrn.values()];
}

/** Adds the +/- split from the detailed CSV onto summary rows (mutates and returns them). */
export function mergeDetailedCsv(rows: SectionGradeRow[], csv: string): SectionGradeRow[] {
  const parsed = parseCsv(csv);
  if (parsed.length === 0) return rows;
  const h = parsed[0].map(normalizeWs);
  const iCrn = columnIndex(h, eqi("CRN"));
  const columns = {
    aPlus: columnIndex(h, eq("A+")),
    aFlat: columnIndex(h, eq("A")),
    aMinus: columnIndex(h, eq("A-")),
    bPlus: columnIndex(h, eq("B+")),
    bFlat: columnIndex(h, eq("B")),
    bMinus: columnIndex(h, eq("B-")),
    cPlus: columnIndex(h, eq("C+")),
    cFlat: columnIndex(h, eq("C")),
    cMinus: columnIndex(h, eq("C-")),
  } as const;

  const byCrn = new Map(rows.map((row) => [row.crn, row]));
  for (const cells of parsed.slice(1)) {
    const crn = cell(cells, iCrn);
    const row = crn ? byCrn.get(crn) : undefined;
    if (!row) continue;
    for (const [field, index] of Object.entries(columns) as [keyof typeof columns, number][]) {
      row[field] = toInt(cell(cells, index));
    }
  }
  return rows;
}

/** Parses and merges one term's summary + detailed exports by CRN. */
export function parseTerm(summaryCsv: string, detailedCsv: string, term: string): SectionGradeRow[] {
  return mergeDetailedCsv(parseSummaryCsv(summaryCsv, term), detailedCsv);
}

/** A term's grades have posted once any section reports a numeric course GPA (CRS AVG). */
export function isTermPosted(rows: readonly SectionGradeRow[]): boolean {
  return rows.some((row) => row.gpa !== null);
}

export type GradeCsvKind = "summary" | "detailed";

/**
 * Which APEX export a CSV is, from its header row, or null for anything else (an HTML error
 * or challenge page, a random upload). Both exports start with CRN; only the summary has
 * Course and "CRS AVG", and only the detailed one has "A+". Used by the cron ingest, the admin
 * upload (which also reports swapped files) and scripts/backfill-grades.ts.
 */
export function gradeCsvKind(csv: string): GradeCsvKind | null {
  const header = (parseCsv(csv.slice(0, 4096))[0] ?? []).map((value) => normalizeWs(value).toUpperCase());
  if (header[0] !== "CRN") return null;
  if (header.includes("CRS AVG") && header.includes("COURSE")) return "summary";
  if (header.includes("A+")) return "detailed";
  return null;
}

/** Is this either APEX grade export? Guards against HTML error pages. */
export function looksLikeGradeCsv(csv: string): boolean {
  return gradeCsvKind(csv) !== null;
}

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Enrollment-weighted GPA, as the Java aggregate computed it: sum(gpa * total) / sum(total)
 * over sections that have a GPA and a positive total, rounded to 2 places. The SQL in
 * store.ts computes the same thing; this is the reference implementation for tests.
 */
export function weightedGpa(rows: readonly Pick<SectionGradeRow, "gpa" | "total">[]): number | null {
  let weighted = 0;
  let enrolled = 0;
  for (const row of rows) {
    if (row.gpa !== null && row.total > 0) {
      weighted += row.gpa * row.total;
      enrolled += row.total;
    }
  }
  return enrolled > 0 ? round2(weighted / enrolled) : null;
}
