"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { fetchSubjects, type Subject, type TermInfo } from "@/lib/client/courses";
import { courseNumberSchema, termCodeSchema } from "@/lib/courses/validation";
import { cn } from "@/lib/ui/cn";
import { termName } from "@/lib/format";
import { resultsHref, searchFormHref } from "./params";
import { COURSE_STORAGE_KEYS, useStoredValue, writeStored } from "./storage";
import { SubjectAutocomplete } from "./SubjectAutocomplete";
import buttons from "./buttons.module.css";
import styles from "./CourseSearchForm.module.css";

/** The original degree levels (GoSolar txt_level), plus "any level". */
const LEVELS: Array<{ value: string; label: string }> = [
  { value: "UA", label: "Associates (2-year undergraduate, Perimeter College students)" },
  { value: "US", label: "Bachelors (4-year undergraduate students)" },
  { value: "GS", label: "Graduate (Graduate level students)" },
  { value: "LW", label: "Law (Graduate, College of Law students)" },
  { value: "all", label: "Any level" },
];

const isLevel = (value: unknown): value is string => typeof value === "string" && LEVELS.some((l) => l.value === value);

export type SearchInitial = {
  term?: string | null;
  subjects?: string[];
  courseNumber?: string | null;
  level?: string | null;
};

export type CourseSearchFormProps = {
  /** Terms from the server, registrable first; null when they couldn't be loaded. */
  terms: TermInfo[] | null;
  /** Prefill ("New search" from the results page). */
  initial?: SearchInitial;
};

type Errors = { term?: string; subjects?: string; courseNumber?: string };

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      {children}
    </p>
  );
}

/**
 * The original course search form: term, degree, subjects and course number in one column, with
 * the solid "Search Classes" button. A real GET form to /course-results, so it works before
 * hydration; once hydrated it validates, remembers the term and level, and navigates.
 */
export function CourseSearchForm({ terms, initial }: CourseSearchFormProps) {
  const router = useRouter();
  const id = useId();
  const storedTerm = useStoredValue(COURSE_STORAGE_KEYS.preferredTerm);
  const storedLevel = useStoredValue(COURSE_STORAGE_KEYS.preferredLevel);

  const openTerms = useMemo(() => (terms ?? []).filter((t) => !t.viewOnly), [terms]);
  const preferred = storedTerm && openTerms.some((t) => t.code === storedTerm) ? storedTerm : null;
  const defaultTerm = openTerms[0]?.code ?? terms?.[0]?.code ?? "";

  const [termChoice, setTermChoice] = useState<string | null>(initial?.term ?? null);
  const [levelChoice, setLevelChoice] = useState<string | null>(
    initial?.level === undefined ? null : isLevel(initial.level) ? initial.level : initial.level ? null : "all",
  );
  const [subjects, setSubjects] = useState<Subject[]>(() => (initial?.subjects ?? []).map((code) => ({ code, description: "" })));
  const [courseNumber, setCourseNumber] = useState(initial?.courseNumber ?? "");
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const term = termChoice ?? preferred ?? defaultTerm;

  // Prefilled subjects arrive as bare codes (from the URL): look up their names for the chips.
  const unnamed = subjects.filter((s) => !s.description).map((s) => s.code).join(",");
  useEffect(() => {
    if (!unnamed || !term) return;
    const controller = new AbortController();
    void Promise.all(
      unnamed.split(",").map((code) =>
        fetchSubjects(term, code, controller.signal)
          .then((list) => list.find((s) => s.code === code) ?? null)
          .catch(() => null),
      ),
    ).then((found) => {
      if (controller.signal.aborted) return;
      const names = new Map(found.flatMap((s) => (s?.description ? [[s.code, s.description] as const] : [])));
      if (names.size === 0) return;
      setSubjects((prev) => prev.map((s) => (s.description ? s : { ...s, description: names.get(s.code) ?? "" })));
    });
    return () => controller.abort();
  }, [unnamed, term]);
  const level = levelChoice ?? (isLevel(storedLevel) ? storedLevel : "US");

  const errors: Errors = {};
  if (!termCodeSchema.safeParse(term).success) errors.term = "Choose a term.";
  if (subjects.length === 0) errors.subjects = "Choose at least one subject.";
  if (courseNumber.trim() && !courseNumberSchema.safeParse(courseNumber).success) {
    errors.courseNumber = "Use letters and digits only, e.g. 2720 or 1301L.";
  }
  const shown: Errors = submitted ? errors : {};

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      // Errors render after this submit; focus the first invalid control once they have.
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const number = courseNumber.trim() ? courseNumberSchema.parse(courseNumber) : null;
    if (openTerms.some((t) => t.code === term)) writeStored(COURSE_STORAGE_KEYS.preferredTerm, term);
    writeStored(COURSE_STORAGE_KEYS.preferredLevel, level);
    const search = {
      term,
      subjects: subjects.map((s) => s.code),
      courseNumber: number,
      level: level === "all" ? null : level,
    };
    // Record this search in the form's own URL first, so Back from the results comes back to a
    // filled-in form (the page prefills from its query string), not an empty one.
    window.history.replaceState(window.history.state, "", searchFormHref(search));
    router.push(resultsHref(search));
  };

  const ids = {
    term: `${id}-term`,
    level: `${id}-level`,
    subjects: `${id}-subjects`,
    number: `${id}-number`,
  };

  return (
    <form
      ref={formRef}
      method="get"
      action="/course-results"
      noValidate
      onSubmit={onSubmit}
      className={styles.form}
      aria-label="Search classes"
    >
      <div className={styles.field}>
        {terms ? (
          <>
            <label htmlFor={ids.term} className={styles.label}>
              Choose a term
            </label>
            <select
              id={ids.term}
              name="term"
              className={styles.control}
              value={term}
              aria-invalid={shown.term ? true : undefined}
              aria-describedby={shown.term ? `${ids.term}-error` : undefined}
              onChange={(event) => setTermChoice(event.target.value)}
            >
              {terms.length === 0 ? <option value="">No terms available</option> : null}
              {terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {termName(t.code, t.description)}
                  {t.viewOnly ? " (view only)" : ""}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor={ids.term} className={styles.label}>
              Enter a term code
            </label>
            <input
              id={ids.term}
              name="term"
              className={styles.control}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={termChoice ?? ""}
              placeholder="e.g. 202608 for Fall 2026"
              aria-invalid={shown.term ? true : undefined}
              aria-describedby={shown.term ? `${ids.term}-error` : undefined}
              onChange={(event) => setTermChoice(event.target.value.replace(/\D/g, ""))}
            />
          </>
        )}
        {shown.term ? <FieldError id={`${ids.term}-error`}>{shown.term}</FieldError> : null}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.level} className={styles.label}>
          Choose a degree
        </label>
        <select
          id={ids.level}
          className={styles.control}
          value={level}
          onChange={(event) => setLevelChoice(event.target.value)}
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        {level !== "all" ? <input type="hidden" name="level" value={level} /> : null}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.subjects} className={styles.label}>
          Enter subjects
        </label>
        <SubjectAutocomplete
          id={ids.subjects}
          term={term}
          value={subjects}
          onChange={setSubjects}
          name="subjects"
          invalid={Boolean(shown.subjects)}
          describedBy={shown.subjects ? `${ids.subjects}-error` : undefined}
        />
        {shown.subjects ? <FieldError id={`${ids.subjects}-error`}>{shown.subjects}</FieldError> : null}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.number} className={styles.label}>
          Enter a course number
        </label>
        <input
          id={ids.number}
          name="courseNumber"
          className={styles.control}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          placeholder="e.g. 2720 (optional)"
          value={courseNumber}
          aria-invalid={shown.courseNumber ? true : undefined}
          aria-describedby={shown.courseNumber ? `${ids.number}-error` : undefined}
          onChange={(event) => setCourseNumber(event.target.value)}
        />
        {shown.courseNumber ? <FieldError id={`${ids.number}-error`}>{shown.courseNumber}</FieldError> : null}
      </div>

      <button type="submit" className={cn(buttons.primary, buttons.large, styles.submit)}>
        Search Classes
      </button>
    </form>
  );
}
