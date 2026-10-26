"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { ArrowRightIcon, SearchIcon } from "@/components/ui/icons";
import { Input, Select } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Subject, TermInfo } from "@/lib/client/courses";
import { courseNumberSchema, termCodeSchema } from "@/lib/courses/validation";
import { cn } from "@/lib/ui/cn";
import { resultsHref } from "./params";
import { COURSE_STORAGE_KEYS, parseRecent, rememberSearch, useStoredValue, writeStored } from "./storage";
import { SubjectAutocomplete } from "./SubjectAutocomplete";
import styles from "./CourseSearchForm.module.css";
import { termName } from "@/lib/format";

export type Level = "US" | "GS" | "all";

const LEVELS: Array<{ value: Level; label: string }> = [
  { value: "US", label: "Undergraduate" },
  { value: "GS", label: "Graduate" },
  { value: "all", label: "All" },
];

const isLevel = (value: unknown): value is Level => value === "US" || value === "GS" || value === "all";

export type SearchInitial = {
  term?: string | null;
  subjects?: string[];
  courseNumber?: string | null;
  level?: string | null;
};

export type CourseSearchFormProps = {
  /** Terms from the server, registrable first; null when they couldn't be loaded. */
  terms: TermInfo[] | null;
  /** Prefill (Edit search on the results page). */
  initial?: SearchInitial;
  /** Inline variant on the results page: no outer card chrome, shows Cancel. */
  inline?: boolean;
  onCancel?: () => void;
};

type Errors = { term?: string; subjects?: string; courseNumber?: string };

/**
 * The course search form (pages.md §3). A real GET form to /course-results, so it works
 * before hydration; once hydrated it validates, remembers the term/level and the search, and
 * navigates with the router.
 */
export function CourseSearchForm({ terms, initial, inline = false, onCancel }: CourseSearchFormProps) {
  const router = useRouter();
  const storedTerm = useStoredValue(COURSE_STORAGE_KEYS.preferredTerm);
  const storedLevel = useStoredValue(COURSE_STORAGE_KEYS.preferredLevel);

  const openTerms = useMemo(() => (terms ?? []).filter((t) => !t.viewOnly), [terms]);
  const preferred = storedTerm && openTerms.some((t) => t.code === storedTerm) ? storedTerm : null;
  const defaultTerm = openTerms[0]?.code ?? terms?.[0]?.code ?? "";

  const [termChoice, setTermChoice] = useState<string | null>(initial?.term ?? null);
  const [levelChoice, setLevelChoice] = useState<Level | null>(
    initial?.level === undefined ? null : isLevel(initial.level) ? initial.level : initial.level ? null : "all",
  );
  const [subjects, setSubjects] = useState<Subject[]>(
    () => (initial?.subjects ?? []).map((code) => ({ code, description: "" })),
  );
  const [courseNumber, setCourseNumber] = useState(initial?.courseNumber ?? "");
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const term = termChoice ?? preferred ?? defaultTerm;
  const level: Level = levelChoice ?? (isLevel(storedLevel) ? storedLevel : "US");
  const selectedTerm = terms?.find((t) => t.code === term);

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
    const search = {
      term,
      termLabel: termName(term, selectedTerm?.description),
      subjects: subjects.map((s) => s.code),
      courseNumber: number,
      level: level === "all" ? null : level,
    };
    if (openTerms.some((t) => t.code === term)) writeStored(COURSE_STORAGE_KEYS.preferredTerm, term);
    writeStored(COURSE_STORAGE_KEYS.preferredLevel, level);
    rememberSearch(search);
    router.push(resultsHref(search));
  };

  return (
    <form
      ref={formRef}
      method="get"
      action="/course-results"
      noValidate
      onSubmit={onSubmit}
      className={cn(styles.form, inline && styles.inline)}
      aria-label="Search classes"
    >
      <div className={styles.row}>
        {terms ? (
          <Field label="Term" error={shown.term} required>
            <Select name="term" value={term} onChange={(event) => setTermChoice(event.target.value)}>
              {terms.length === 0 ? <option value="">No terms available</option> : null}
              {terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {termName(t.code, t.description)}
                  {t.viewOnly ? " (view only)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Term code" hint="Six digits, e.g. 202608 for Fall 2026." error={shown.term} required>
            <Input
              name="term"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={termChoice ?? ""}
              placeholder="202608"
              onChange={(event) => setTermChoice(event.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        <div className={styles.group}>
          <span className={styles.label} aria-hidden="true">
            Level
          </span>
          <SegmentedControl<Level>
            label="Level"
            options={LEVELS}
            value={level}
            onChange={setLevelChoice}
            fullWidth
          />
          {level !== "all" ? <input type="hidden" name="level" value={level} /> : null}
        </div>
      </div>

      {selectedTerm?.viewOnly ? (
        <Banner tone="info">
          Registration for {termName(selectedTerm.code, selectedTerm.description)} is closed. You can still view sections.
        </Banner>
      ) : null}

      <Field label="Subjects" hint="Up to 5. Type a code or a name." error={shown.subjects} required>
        <SubjectAutocomplete term={term} value={subjects} onChange={setSubjects} name="subjects" />
      </Field>

      <div className={styles.row}>
        <Field label="Course number" hint="Optional. Leave blank to see every course in the subject." error={shown.courseNumber}>
          <Input
            name="courseNumber"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            placeholder="e.g. 2720"
            value={courseNumber}
            onChange={(event) => setCourseNumber(event.target.value)}
          />
        </Field>
        <div className={styles.actions}>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" leadingIcon={<SearchIcon />} className={styles.submit}>
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The last 5 searches as links (pages.md §3). Absent until hydrated, so no layout shift. */
export function RecentSearches() {
  const raw = useStoredValue(COURSE_STORAGE_KEYS.recentSearches);
  const recent = useMemo(() => parseRecent(raw), [raw]);
  if (recent.length === 0) return null;
  return (
    <section className={styles.recent} aria-labelledby="recent-searches">
      <h2 id="recent-searches" className={styles.recentTitle}>
        Recent searches
      </h2>
      <ul className={styles.recentList}>
        {recent.map((search) => {
          const href = resultsHref(search);
          const what = `${search.subjects.join(", ")}${search.courseNumber ? ` ${search.courseNumber}` : ""}`;
          return (
            <li key={href}>
              <ChipLink href={href} icon={<ArrowRightIcon size={16} />}>
                {what} · {search.termLabel}
              </ChipLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
