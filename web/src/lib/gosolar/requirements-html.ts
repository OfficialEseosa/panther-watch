/**
 * Parsers for the HTML fragments of Banner 9's per-section "searchResults" endpoints
 * (getSectionPrerequisites, getCorequisites, getRestrictions, getCourseDescription). Pure, so
 * they can be tested against captured markup (tests/fixtures/gosolar/requirements).
 *
 * What GoSolar sends (live, 2026-11):
 * - Prerequisites: GSU uses CAPP area prerequisites, a `table.cappPreqTable` whose cell holds
 *   one `<pre>` per line group. Joined, they read like
 *     Prerequisites:Prereq
 *     ( Course or Test: MATHEMATICS 1111 to 1113 / Minimum Grade of C / May be taken concurrently. )
 *     or ( ... ) and ( ... )
 *   Subjects are descriptions ("COMPUTER SCIENCE"), not codes. The classic Banner
 *   `table.basePreqTable` (And/Or, (, Test, Score, Subject, Course Number, Level, Grade, )
 *   columns) is parsed too. "No prerequisite information available." means none.
 * - Corequisites: `table.basePreqTable` with Subject (description), Course Number, Title.
 * - Restrictions: `span.status-bold` headers ("Must be enrolled in one of the following
 *   Levels:", "Cannot be enrolled in ...", "Special Approvals:") each followed by
 *   `span.detail-popup-indentation` values ("Graduate Semester (GS)").
 * - Description: free text with `<br/>`s and template comments.
 *
 * Unknown markup is never dropped silently: it comes back as plain text.
 */
import * as cheerio from "cheerio";
import type { Subject } from "./types";

/** domhandler's node type, via cheerio (domhandler is not a direct dependency). */
type AnyNode = Parameters<typeof cheerio.contains>[0];
type Selection = cheerio.Cheerio<AnyNode>;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface CourseRef {
  /** Subject code ("MATH"), resolved from Banner's subject description; null when unknown. */
  subject: string | null;
  /** The subject as Banner shows it ("MATHEMATICS"). */
  subjectDescription: string;
  courseNumber: string;
}

export interface PrerequisiteCourse extends CourseRef {
  /** Upper end of a course-number range: "MATHEMATICS 1111 to 1113" -> 1111..1113. */
  courseNumberTo?: string;
  /** "C", "K", ... */
  minimumGrade?: string;
  /** true: "May be taken concurrently", false: "May not be taken concurrently", absent: not stated. */
  concurrent?: boolean;
  /** Course level, when the markup states one (classic Banner table only). */
  level?: string;
}

/**
 * Prerequisite expression. Banner renders top-level groups without enclosing parentheses
 * ("(A) or (B) and (C) or (D)"); this tree reads `and` as binding looser than `or`, i.e. an
 * AND of OR-groups, which is how GSU writes them (CSC 2720: a CS1 course AND a calculus
 * course AND a discrete math course). Parenthesized groups are kept exactly. `text` stays the
 * authoritative wording.
 */
export type PrerequisiteNode =
  | { type: "and" | "or"; children: PrerequisiteNode[] }
  | ({ type: "course" } & PrerequisiteCourse)
  | { type: "test"; test: string; minimumScore?: string }
  /** Anything that is not a course or test, e.g. "Student Attributes: P:Meets CSC Area F". */
  | { type: "other"; text: string };

export interface Prerequisites {
  /** The whole requirement as one line of plain text, as Banner words it. */
  text: string;
  /** CAPP rule name after "Prerequisites:" ("Prereq", "Csc GPA Restriction"); null when absent. */
  rule: string | null;
  /** Parsed expression; null when the markup could not be parsed (then rely on `text`). */
  tree: PrerequisiteNode | null;
  /** Every course in the requirement, in order, exact repeats dropped (flat; see `tree` for and/or). */
  items: PrerequisiteCourse[];
}

export interface Corequisite extends CourseRef {
  title?: string;
}

export type RestrictionKind =
  | "level"
  | "major"
  | "college"
  | "classification"
  | "campus"
  | "program"
  | "degree"
  | "other";

export interface RestrictionGroup {
  kind: RestrictionKind;
  /** Banner's category wording: "Levels", "Fields of Study (Major, Minor or Concentration)", "Cohorts". */
  label: string;
  /** As Banner shows them, e.g. "Graduate Semester (GS)". */
  values: string[];
}

export interface Restrictions {
  /** "Must be enrolled in one of the following ...": the student must match one value of each group. */
  mustBe: RestrictionGroup[];
  /** "Cannot be enrolled in one of the following ...". */
  mustNotBe: RestrictionGroup[];
  /** "Special Approvals:" values, e.g. "Honors College Restricts" (department or college permission). */
  specialApprovals: string[];
  /** Any other header and its values, verbatim. */
  other: Array<{ label: string; values: string[] }>;
}

/** Maps Banner subject descriptions ("COMPUTER SCIENCE") to codes ("CSC"). */
export type SubjectResolver = (description: string) => string | null;

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeSubject = (value: string) => collapse(value).toUpperCase();

/** Resolver over GoSolar's subject list (`classSearch/get_subject`); descriptions may be HTML-escaped. */
export function subjectResolver(subjects: readonly Subject[]): SubjectResolver {
  const byDescription = new Map<string, string>();
  const codes = new Set<string>();
  for (const { code, description } of subjects) {
    if (!code) continue;
    codes.add(code.toUpperCase());
    if (description) byDescription.set(normalizeSubject(cheerio.load(description).text()), code);
  }
  return (description) => {
    const key = normalizeSubject(description);
    return byDescription.get(key) ?? (codes.has(key) ? key : null);
  };
}

const noSubjects: SubjectResolver = () => null;

/** Loads a fragment and returns its root `<section>` (the whole fragment wrapped in one if it has none). */
function loadSection(html: string) {
  let $ = cheerio.load(html, null, false);
  if ($("section").length === 0) $ = cheerio.load(`<section>${html}</section>`, null, false);
  return { $, root: $("section").first() };
}

/** Banner's "No ... information available." placeholder. */
const isNoInfo = (text: string) => /^no\b.*\bavailable\.?$/i.test(text);

// ---------------------------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------------------------

/** Plain text of getCourseDescription; null when Banner has none. `<br>` becomes a line break. */
export function parseCourseDescription(html: string): string | null {
  const { root } = loadSection(html);
  root.contents().filter((_, node) => node.type === "comment").remove();
  root.find("br").replaceWith("\n");
  root.find("h1, h2, h3, h4").remove();
  const text = root
    .text()
    .split("\n")
    .map(collapse)
    .filter(Boolean)
    .join("\n");
  return text && !isNoInfo(text) ? text : null;
}

// ---------------------------------------------------------------------------------------------
// Corequisites
// ---------------------------------------------------------------------------------------------

/**
 * Rows of getCorequisites' table. `unparsed` is the fragment's text when it holds neither a
 * table nor Banner's "none" message.
 */
export function parseCorequisites(
  html: string,
  resolveSubject: SubjectResolver = noSubjects,
): { corequisites: Corequisite[]; unparsed: string | null } {
  const { $, root } = loadSection(html);
  const table = root.find("table").first();
  if (!table.length) {
    root.find("h1, h2, h3, h4").remove();
    const text = collapse(root.text());
    return { corequisites: [], unparsed: text && !isNoInfo(text) ? text : null };
  }

  const headers = headerTexts($, table);
  const col = (pattern: RegExp) => headers.findIndex((h) => pattern.test(h));
  const subjectCol = col(/subject/);
  const numberCol = col(/course\s*number|^course$|number/);
  const titleCol = col(/title/);
  const corequisites: Corequisite[] = [];
  for (const row of bodyRows($, table)) {
    const subjectDescription = row[subjectCol] ?? "";
    const courseNumber = (row[numberCol] ?? "").toUpperCase();
    if (!subjectDescription && !courseNumber) continue;
    const title = titleCol >= 0 ? row[titleCol] : undefined;
    corequisites.push({
      subject: resolveSubject(subjectDescription),
      subjectDescription,
      courseNumber,
      ...(title ? { title } : {}),
    });
  }
  return { corequisites, unparsed: null };
}

function headerTexts($: cheerio.CheerioAPI, table: Selection): string[] {
  const headRow = table.find("thead tr").first().length ? table.find("thead tr").first() : table.find("tr").first();
  return headRow
    .find("th, td")
    .toArray()
    .map((cell) => collapse($(cell).text()).toLowerCase());
}

function bodyRows($: cheerio.CheerioAPI, table: Selection): string[][] {
  const rows = table.find("tbody tr").length ? table.find("tbody tr") : table.find("tr").slice(1);
  return rows.toArray().map((row) =>
    $(row)
      .find("td, th")
      .toArray()
      .map((cell) => collapse($(cell).text())),
  );
}

// ---------------------------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------------------------

const RESTRICTION_KINDS: Array<[RegExp, RestrictionKind]> = [
  [/\blevels?\b/i, "level"],
  [/field|major|minor|concentration/i, "major"],
  [/college/i, "college"],
  [/class(ification)?(es|s)?\b/i, "classification"],
  [/campus/i, "campus"],
  [/program/i, "program"],
  [/degree/i, "degree"],
];

export function restrictionKind(label: string): RestrictionKind {
  return RESTRICTION_KINDS.find(([pattern]) => pattern.test(label))?.[1] ?? "other";
}

const emptyRestrictions = (): Restrictions => ({ mustBe: [], mustNotBe: [], specialApprovals: [], other: [] });

/** getRestrictions as must / must-not lists. `unparsed` holds text the parser did not recognize. */
export function parseRestrictions(html: string): { restrictions: Restrictions; unparsed: string | null } {
  const { $, root } = loadSection(html);
  const restrictions = emptyRestrictions();
  let current: { values: string[] } | null = null;
  let recognized = false;

  for (const element of root.find("span.status-bold, span.detail-popup-indentation").toArray()) {
    const span = $(element);
    const text = collapse(span.text());
    if (!text) continue;
    if (span.hasClass("status-bold")) {
      if (span.closest(".infoicon").length) continue; // "Not all restrictions are applicable."
      recognized = true;
      const header = text.replace(/:\s*$/, "");
      const match = /^(must|cannot|may not)\s+be\s+enrolled\s+in\s+(?:one\s+of\s+)?(?:the\s+following\s+)?(.+)$/i.exec(header);
      if (match) {
        const label = collapse(match[2]);
        const group: RestrictionGroup = { kind: restrictionKind(label), label, values: [] };
        (/^must$/i.test(match[1]) ? restrictions.mustBe : restrictions.mustNotBe).push(group);
        current = group;
      } else if (/^special approvals?$/i.test(header)) {
        current = { values: restrictions.specialApprovals };
      } else {
        const entry = { label: header, values: [] as string[] };
        restrictions.other.push(entry);
        current = entry;
      }
    } else {
      recognized = true;
      if (!current) {
        const entry = { label: "", values: [] as string[] };
        restrictions.other.push(entry);
        current = entry;
      }
      current.values.push(text);
    }
  }

  if (recognized) return { restrictions, unparsed: null };
  root.find("h1, h2, h3, h4, .infoicon").remove();
  const text = collapse(root.text());
  return { restrictions, unparsed: text && !isNoInfo(text) ? text : null };
}

// ---------------------------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------------------------

type Token = { kind: "(" | ")" | "and" | "or" } | { kind: "clause"; node: PrerequisiteNode };

/** getSectionPrerequisites; null when Banner reports none. */
export function parsePrerequisites(html: string, resolveSubject: SubjectResolver = noSubjects): Prerequisites | null {
  const { $, root } = loadSection(html);
  const tables = root.find("table").toArray();
  if (tables.length === 0) {
    root.find("h1, h2, h3, h4").remove();
    const text = collapse(root.text());
    if (!text || isNoInfo(text)) return null;
    return { text, rule: null, tree: null, items: [] };
  }

  const parts = tables.map((element) => {
    const table = $(element);
    const headers = headerTexts($, table);
    return headers.some((h) => /and\s*\/\s*or|subject|course number/.test(h))
      ? parseBaseTable($, table, headers, resolveSubject)
      : parseCappTable($, table, resolveSubject);
  });
  const nonEmpty = parts.filter((part) => part.text);
  if (nonEmpty.length === 0) return null;
  if (nonEmpty.length === 1) return nonEmpty[0];

  const trees = nonEmpty.map((part) => part.tree);
  return {
    text: nonEmpty.map((part) => `(${part.text})`).join(" and "),
    rule: nonEmpty.map((part) => part.rule).find((rule) => rule !== null) ?? null,
    tree: trees.every((tree) => tree !== null) ? simplify({ type: "and", children: trees as PrerequisiteNode[] }) : null,
    items: nonEmpty.flatMap((part) => part.items),
  };
}

/** CAPP area prerequisites: one `<pre>` per line group, and/or and parentheses on their own lines. */
function parseCappTable(
  $: cheerio.CheerioAPI,
  table: Selection,
  resolveSubject: SubjectResolver,
): Prerequisites {
  const pres = table.find("pre").toArray();
  const raw = pres.length ? pres.map((pre) => $(pre).text()).join("\n") : table.find("td").text();

  let rule: string | null = null;
  const tokens: Token[] = [];
  const textParts: string[] = [];
  let clause: string[] | null = null;
  const flush = () => {
    if (clause) tokens.push({ kind: "clause", node: cappClause(clause, resolveSubject) });
    clause = null;
  };

  for (const rawLine of raw.split("\n")) {
    let line = collapse(rawLine);
    if (!line) continue;
    if (rule === null && tokens.length === 0 && !clause && /^prerequisites?\s*:/i.test(line)) {
      rule = collapse(line.replace(/^prerequisites?\s*:/i, "")) || null;
      continue;
    }
    // Connector / parenthesis lines: "(", ")", "or", "and", ") or (".
    if (/^(?:[()]|\band\b|\bor\b|\s)+$/i.test(line)) {
      flush();
      for (const match of line.matchAll(/[()]|\band\b|\bor\b/gi)) {
        const kind = match[0].toLowerCase() as "(" | ")" | "and" | "or";
        tokens.push({ kind });
        textParts.push(kind);
      }
      continue;
    }
    // Peel parentheses glued to clause text: "( Course or Test: ..." / "... concurrently. )".
    const leading: string[] = [];
    while (/^\(\s/.test(line)) {
      leading.push("(");
      line = line.slice(1).trim();
    }
    let trailing = 0;
    while (/\s\)$/.test(line)) {
      trailing++;
      line = line.slice(0, -1).trim();
    }
    if (leading.length) {
      flush();
      for (const paren of leading) {
        tokens.push({ kind: "(" });
        textParts.push(paren);
      }
    }
    if (/^[A-Za-z][A-Za-z /&-]*:/.test(line) || !clause) {
      flush();
      clause = [line];
    } else {
      clause.push(line);
    }
    textParts.push(line);
    if (trailing) {
      flush();
      for (let i = 0; i < trailing; i++) {
        tokens.push({ kind: ")" });
        textParts.push(")");
      }
    }
  }
  flush();

  return finish(tokens, textParts, rule);
}

const COURSE_RE = /^(.+?)\s+(\d[0-9A-Z]{2,5})\.?(?:\s+to\s+(\d[0-9A-Z]{2,5})\.?)?$/i;

/** One CAPP requirement: header line ("Course or Test: X 1111 to 1113") plus detail lines. */
function cappClause(lines: string[], resolveSubject: SubjectResolver): PrerequisiteNode {
  const [first, ...details] = lines;
  const header = /^([^:]+):\s*(.*)$/.exec(first);
  const label = header?.[1] ?? "";
  const value = header?.[2] ?? first;

  let minimumGrade: string | undefined;
  let minimumScore: string | undefined;
  let concurrent: boolean | undefined;
  const extra: string[] = [];
  for (const detail of details) {
    let match: RegExpExecArray | null;
    if ((match = /^minimum grade of\s+(\S+)/i.exec(detail))) minimumGrade = match[1].replace(/\.$/, "");
    else if ((match = /^minimum score of\s+(.+?)\.?$/i.exec(detail))) minimumScore = match[1];
    else if (/^may not be taken concurrently/i.test(detail)) concurrent = false;
    else if (/^may be taken concurrently/i.test(detail)) concurrent = true;
    else extra.push(detail);
  }

  // Unrecognized detail lines do not demote a course or test: `Prerequisites.text` keeps them.
  const course = /course/i.test(label) ? COURSE_RE.exec(value) : null;
  if (course) {
    const subjectDescription = collapse(course[1]);
    return {
      type: "course",
      subject: resolveSubject(subjectDescription),
      subjectDescription,
      courseNumber: course[2].toUpperCase(),
      ...(course[3] ? { courseNumberTo: course[3].toUpperCase() } : {}),
      ...(minimumGrade ? { minimumGrade } : {}),
      ...(concurrent !== undefined ? { concurrent } : {}),
    };
  }
  if (/test/i.test(label)) {
    return { type: "test", test: value, ...(minimumScore ? { minimumScore } : {}) };
  }
  // Student attributes, GPA rules and anything unrecognized: keep the wording (minus the
  // "May (not) be taken concurrently" boilerplate, which means nothing for non-courses).
  const kept = [first, ...extra];
  if (minimumGrade) kept.push(`Minimum Grade of ${minimumGrade}`);
  if (minimumScore) kept.push(`Minimum Score of ${minimumScore}`);
  return { type: "other", text: kept.join(" ") };
}

/** Classic Banner table: And/Or | ( | Test | Score | Subject | Course Number | Level | Grade | ). */
function parseBaseTable(
  $: cheerio.CheerioAPI,
  table: Selection,
  headers: string[],
  resolveSubject: SubjectResolver,
): Prerequisites {
  const col = (pattern: RegExp) => headers.findIndex((h) => pattern.test(h));
  const cols = {
    connector: col(/and\s*\/\s*or/),
    test: col(/^test/),
    score: col(/score/),
    subject: col(/subject/),
    number: col(/course\s*number|number/),
    level: col(/level/),
    grade: col(/grade/),
  };
  const tokens: Token[] = [];
  const textParts: string[] = [];

  for (const cells of bodyRows($, table)) {
    const at = (index: number) => (index >= 0 ? (cells[index] ?? "") : "");
    const connector = at(cols.connector).toLowerCase();
    if (connector === "and" || connector === "or") {
      tokens.push({ kind: connector });
      textParts.push(connector);
    }
    const opens = cells.filter((cell) => cell === "(").length;
    const closes = cells.filter((cell) => cell === ")").length;
    for (let i = 0; i < opens; i++) {
      tokens.push({ kind: "(" });
      textParts.push("(");
    }

    const test = at(cols.test);
    const score = at(cols.score);
    const subjectDescription = at(cols.subject);
    const courseNumber = at(cols.number).toUpperCase();
    const level = at(cols.level);
    const grade = at(cols.grade);
    let node: PrerequisiteNode | null = null;
    if (subjectDescription && courseNumber) {
      node = {
        type: "course",
        subject: resolveSubject(subjectDescription),
        subjectDescription,
        courseNumber,
        ...(grade ? { minimumGrade: grade } : {}),
        ...(level ? { level } : {}),
      };
      textParts.push(
        [`Course: ${subjectDescription} ${courseNumber}`, level && `Level ${level}`, grade && `Minimum Grade of ${grade}`]
          .filter(Boolean)
          .join(" "),
      );
    } else if (test) {
      node = { type: "test", test, ...(score ? { minimumScore: score } : {}) };
      textParts.push(`Test: ${test}${score ? ` Minimum Score of ${score}` : ""}`);
    } else {
      const text = cells.filter((cell) => cell && cell !== "(" && cell !== ")" && cell.toLowerCase() !== connector).join(" ");
      if (text) {
        node = { type: "other", text };
        textParts.push(text);
      }
    }
    if (node) tokens.push({ kind: "clause", node });

    for (let i = 0; i < closes; i++) {
      tokens.push({ kind: ")" });
      textParts.push(")");
    }
  }
  return finish(tokens, textParts, null);
}

function finish(tokens: Token[], textParts: string[], rule: string | null): Prerequisites {
  const text = textParts.join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  return { text, rule, tree: buildTree(tokens), items: uniqueCourses(tokens) };
}

/** The course clauses in order, without exact repeats (Banner often lists one course twice). */
function uniqueCourses(tokens: readonly Token[]): PrerequisiteCourse[] {
  const seen = new Set<string>();
  const courses: PrerequisiteCourse[] = [];
  for (const token of tokens) {
    if (token.kind !== "clause" || token.node.type !== "course") continue;
    const course: PrerequisiteCourse & { type?: "course" } = { ...token.node };
    delete course.type;
    const key = JSON.stringify(course);
    if (seen.has(key)) continue;
    seen.add(key);
    courses.push(course);
  }
  return courses;
}

/**
 * Recursive descent over the token stream: expr := orGroup ("and" orGroup)*,
 * orGroup := primary ("or" primary)*, primary := "(" expr ")" | clause. Lenient about
 * unbalanced trailing parentheses; anything else unexpected gives null (callers keep `text`).
 */
function buildTree(tokens: readonly Token[]): PrerequisiteNode | null {
  let pos = 0;
  const peek = () => tokens[pos]?.kind;
  class ParseFailure extends Error {}

  const parseAnd = (): PrerequisiteNode => {
    const children = [parseOr()];
    while (peek() === "and") {
      pos++;
      children.push(parseOr());
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  };
  const parseOr = (): PrerequisiteNode => {
    const children = [parsePrimary()];
    while (peek() === "or") {
      pos++;
      children.push(parsePrimary());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  };
  const parsePrimary = (): PrerequisiteNode => {
    const token = tokens[pos];
    if (!token) throw new ParseFailure();
    if (token.kind === "(") {
      pos++;
      const inner = parseAnd();
      if (peek() === ")") pos++;
      else if (pos < tokens.length) throw new ParseFailure();
      return inner;
    }
    if (token.kind === "clause") {
      pos++;
      return token.node;
    }
    throw new ParseFailure();
  };

  if (tokens.length === 0) return null;
  try {
    const tree = parseAnd();
    while (peek() === ")") pos++; // stray closers at the end
    return pos === tokens.length ? simplify(tree) : null;
  } catch (error) {
    if (error instanceof ParseFailure) return null;
    throw error;
  }
}

/** Unwraps single-child groups and merges nested groups of the same operator. */
function simplify(node: PrerequisiteNode): PrerequisiteNode {
  if (node.type !== "and" && node.type !== "or") return node;
  const children = node.children
    .map(simplify)
    .flatMap((child) => (child.type === node.type ? (child as { children: PrerequisiteNode[] }).children : [child]));
  return children.length === 1 ? children[0] : { type: node.type, children };
}
