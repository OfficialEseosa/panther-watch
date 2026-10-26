"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useFieldControl } from "@/components/ui/Field";
import { fetchSubjects, type Subject } from "@/lib/client/courses";
import { isAbortError } from "@/lib/client/http";
import { subjectSchema } from "@/lib/courses/validation";
import { cn } from "@/lib/ui/cn";
import { displayTitle, foldText } from "./format";
import styles from "./SubjectAutocomplete.module.css";

export const MAX_SUBJECTS = 5;
const DEBOUNCE_MS = 200;

export type SubjectAutocompleteProps = {
  /** Term the subject list belongs to. */
  term: string;
  value: Subject[];
  onChange: (subjects: Subject[]) => void;
  /** id for the text input (the Field label points here). */
  id?: string;
  invalid?: boolean;
  /** Error/hint ids from the surrounding Field. */
  describedBy?: string;
  /** Name of a hidden input carrying "CSC,MATH" for no-JS form posts. */
  name?: string;
  max?: number;
};

type Result = { key: string; subjects: Subject[] | null };

/** Code prefix first, then description word-prefix, then substring (spec.md §2.4). */
function rank(subjects: Subject[], query: string): Subject[] {
  const q = foldText(query.trim());
  if (!q) return subjects;
  const score = (s: Subject) => {
    const code = s.code.toLowerCase();
    const desc = foldText(s.description);
    if (code.startsWith(q)) return 0;
    if (desc.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return 1;
    if (desc.includes(q) || code.includes(q)) return 2;
    return 3;
  };
  return subjects
    .map((s) => ({ s, rank: score(s) }))
    .filter((x) => x.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.s.code.localeCompare(b.s.code))
    .map((x) => x.s);
}

/** A typed subject code accepted when the list can't be loaded: 2-8 letters, upper-cased. */
function freeTextSubject(text: string): Subject | null {
  const parsed = subjectSchema.safeParse(text);
  return parsed.success ? { code: parsed.data, description: "" } : null;
}

/**
 * Subject multi-select (spec.md §2.4): ARIA 1.2 combobox with a listbox popup and removable
 * chips. Queries `/api/courses/subjects` debounced by 200 ms; responses are cached per
 * (term, query) and sequenced, so a slow earlier response can never replace a newer one.
 */
export function SubjectAutocomplete({
  term,
  value,
  onChange,
  id,
  invalid,
  describedBy,
  name,
  max = MAX_SUBJECTS,
}: SubjectAutocompleteProps) {
  const autoId = useId();
  // Inside a <Field>: its label, hint/error and invalid state wire up to the text input.
  const wiring = useFieldControl({ id, invalid, "aria-describedby": describedBy });
  const inputId = wiring.id ?? `${autoId}-input`;
  const isInvalid = wiring["aria-invalid"] === true;
  const listId = `${autoId}-list`;
  const hintId = `${autoId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Subject[]>());
  const seq = useRef(0);

  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const query = text.trim();
  const requestKey = `${term}|${query.toLowerCase()}`;

  // Fetch (debounced) whenever the list is open for a new (term, query).
  useEffect(() => {
    if (!open || !term) return;
    const cached = cache.current.get(requestKey);
    const controller = new AbortController();
    const mySeq = ++seq.current;
    const timer = window.setTimeout(
      () => {
        if (cached) {
          setResult({ key: requestKey, subjects: cached });
          return;
        }
        fetchSubjects(term, query, controller.signal)
          .then((subjects) => {
            cache.current.set(requestKey, subjects);
            if (mySeq === seq.current) setResult({ key: requestKey, subjects });
          })
          .catch((error: unknown) => {
            if (isAbortError(error) || mySeq !== seq.current) return;
            setResult({ key: requestKey, subjects: null });
          });
      },
      cached ? 0 : DEBOUNCE_MS,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, query, requestKey]);

  const loading = open && result?.key !== requestKey;
  const failed = result?.key === requestKey && result.subjects === null;
  // While a new query loads, keep showing the previous matches re-ranked locally.
  const options = useMemo(() => rank(result?.subjects ?? [], query), [result, query]);
  const selectedCodes = useMemo(() => new Set(value.map((s) => s.code)), [value]);
  const free = failed ? freeTextSubject(query) : null;
  const optionCount = failed ? (free ? 1 : 0) : options.length;
  const activeIndex = optionCount === 0 ? -1 : Math.min(active, optionCount - 1);
  const atLimit = value.length >= max;

  const optionId = (index: number) => `${autoId}-opt-${index}`;

  // Keep the active option in view as the arrow keys move it (the list scrolls; focus stays in the input).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${autoId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, autoId]);

  const toggle = (subject: Subject) => {
    if (selectedCodes.has(subject.code)) {
      onChange(value.filter((s) => s.code !== subject.code));
      setLimitHit(false);
      return;
    }
    if (atLimit) {
      setLimitHit(true);
      return;
    }
    onChange([...value, subject]);
    setText("");
    setActive(0);
    // Most searches use one subject; once one is picked, keep the list closed
    // until the user types again so the course-number field is the next step.
    setOpen(false);
  };

  // With a subject already chosen, only typing (or the arrow keys) reopens the list.
  const openIfUseful = () => {
    if (value.length === 0 || text !== "") setOpen(true);
  };

  const remove = (code: string) => {
    onChange(value.filter((s) => s.code !== code));
    setLimitHit(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (optionCount) setActive((activeIndex + 1) % optionCount);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (optionCount) setActive((activeIndex - 1 + optionCount) % optionCount);
        return;
      case "Enter": {
        if (!open) return; // submits the form
        event.preventDefault();
        if (failed) {
          if (free) toggle(free);
          return;
        }
        const option = options[activeIndex];
        if (option) toggle(option);
        return;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        } else if (text) {
          event.preventDefault();
          setText("");
        }
        return;
      case "Backspace":
        if (text === "" && value.length) {
          event.preventDefault();
          remove(value[value.length - 1].code);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  return (
    <div
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {name ? <input type="hidden" name={name} value={value.map((s) => s.code).join(",")} /> : null}
      <div
        className={cn(styles.field, isInvalid && styles.invalid, !term && styles.disabled)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
            openIfUseful();
          }
        }}
      >
        {value.length ? (
          <ul className={styles.chips} aria-label="Selected subjects">
            {value.map((subject) => (
              <li key={subject.code} className={styles.tag} title={subject.description ? subject.code : undefined}>
                <span>{displayTitle(subject.description) || subject.code}</span>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${subject.code}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(subject.code);
                  }}
                >
                  {"×"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={cn(wiring["aria-describedby"], limitHit && hintId) || undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={!term ? "Select a term first" : value.length ? "Add another..." : "e.g. Computer Science"}
          className={styles.input}
          value={text}
          disabled={!term}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={openIfUseful}
          onClick={openIfUseful}
          onKeyDown={onKeyDown}
        />
        {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      </div>
      {limitHit ? (
        <p id={hintId} className={styles.hint} role="status">
          Up to {max} subjects. Remove one to add another.
        </p>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label="Subjects"
        aria-multiselectable="true"
        className={styles.list}
        hidden={!open}
      >
        {open && loading && options.length === 0 ? (
          <li className={styles.status} role="presentation">
            Loading subjects…
          </li>
        ) : null}
        {open && failed ? (
          <>
            <li className={styles.status} role="presentation">
              Couldn&rsquo;t load subjects. Type a subject code (e.g. CSC).
            </li>
            {free ? (
              <li
                id={optionId(0)}
                role="option"
                aria-selected={selectedCodes.has(free.code)}
                className={styles.option}
                data-active={activeIndex === 0 || undefined}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => toggle(free)}
              >
                <span className={styles.code}>{free.code}</span>
                <span className={styles.desc}>Use this code</span>
              </li>
            ) : null}
          </>
        ) : null}
        {open && !failed
          ? options.map((subject, index) => {
              const selected = selectedCodes.has(subject.code);
              return (
                <li
                  key={subject.code}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  className={styles.option}
                  data-active={index === activeIndex || undefined}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => {
                    if (index !== activeIndex) setActive(index);
                  }}
                  onClick={() => toggle(subject)}
                >
                  <span className={styles.code}>{subject.code}</span>
                  <span className={styles.desc}>{displayTitle(subject.description)}</span>
                </li>
              );
            })
          : null}
        {open && !loading && !failed && options.length === 0 ? (
          <li className={styles.status} role="presentation">
            No subjects match &ldquo;{query}&rdquo;
          </li>
        ) : null}
      </ul>
    </div>
  );
}
