"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CheckIcon } from "@/components/ui/icons";
import type { Subject } from "@/lib/gosolar/types";
import { fetchSubjects } from "@/lib/client/courses";
import { isAbortError } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import styles from "./SubjectCombobox.module.css";

export type SubjectComboboxProps = {
  term: string;
  /** Committed subject code ("" = none). */
  value: string;
  onChange: (code: string) => void;
  /**
   * Called on Enter when no option is highlighted (submit the search), with the code just
   * committed: the parent's `value` state hasn't updated yet at that point. When set, Enter
   * doesn't also submit the surrounding form natively.
   */
  onSubmit?: (code: string) => void;
  invalid?: boolean;
  /** Input id, for the parent's <label htmlFor>. */
  id?: string;
  /** Input class (the parent's form-control look). */
  className?: string;
  "aria-describedby"?: string;
  "data-autofocus"?: boolean;
};

const DEBOUNCE_MS = 200;
const CODE = /^[A-Za-z]{2,8}$/;

/**
 * Single-subject autocomplete (ARIA 1.2 combobox + listbox, spec.md §2.4 keyboard model,
 * single-select). Options come from /api/courses/subjects?q, debounced, with stale responses
 * dropped. A typed code that matches the pattern is accepted even without picking an option.
 * Label it with a <label htmlFor={id}>.
 */
export function SubjectCombobox({ term, value, onChange, onSubmit, invalid, className, ...rest }: SubjectComboboxProps) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Subject[] | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  const load = (query: string, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const id = ++requestId.current;
      setOptions(null);
      setFailed(false);
      fetchSubjects(term, query.trim(), ctrl.signal)
        .then((subjects) => {
          if (id !== requestId.current) return;
          setOptions(subjects);
          setHighlight(subjects.length ? 0 : -1);
        })
        .catch((error: unknown) => {
          if (isAbortError(error) || id !== requestId.current) return;
          setOptions([]);
          setFailed(true);
        });
    }, delay);
  };

  const openList = () => {
    if (!open) {
      setOpen(true);
      if (options === null) load(text, 0);
    }
  };

  const commit = (code: string): string => {
    const upper = code.toUpperCase();
    setText(upper);
    setOpen(false);
    if (upper !== value) onChange(upper);
    return upper;
  };

  /** Commits what was typed (an exact option or a valid code); returns the committed code. */
  const commitTyped = (): string => {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value !== "") onChange("");
      return "";
    }
    const exact = options?.find((o) => o.code.toUpperCase() === trimmed.toUpperCase());
    if (exact) return commit(exact.code);
    if (CODE.test(trimmed)) return commit(trimmed);
    return value;
  };

  const scrollToOption = (index: number) => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options?.length ?? 0;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        if (count === 0) return;
        const next = (highlight + 1) % count;
        setHighlight(next);
        scrollToOption(next);
        return;
      }
      case "ArrowUp": {
        if (!open || count === 0) return;
        event.preventDefault();
        const next = (highlight - 1 + count) % count;
        setHighlight(next);
        scrollToOption(next);
        return;
      }
      case "Enter": {
        if (open && options && highlight >= 0 && options[highlight]) {
          event.preventDefault();
          commit(options[highlight].code);
          return;
        }
        const code = commitTyped();
        setOpen(false);
        if (onSubmit) {
          event.preventDefault();
          onSubmit(code);
        }
        return;
      }
      case "Escape": {
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (text !== "") {
          event.preventDefault();
          event.stopPropagation();
          setText("");
          if (value !== "") onChange("");
        }
        return;
      }
      case "Tab":
        setOpen(false);
        return;
    }
  };

  const activeId = open && highlight >= 0 && options?.[highlight] ? `${listId}-opt-${highlight}` : undefined;

  return (
    <div className={styles.wrap}>
      <input
        {...rest}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="e.g. CSC"
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          load(event.target.value, DEBOUNCE_MS);
        }}
        onClick={openList}
        onBlur={() => {
          commitTyped();
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Subjects"
        className={styles.list}
        hidden={!open}
        // Keep focus in the input while clicking an option.
        onPointerDown={(event) => event.preventDefault()}
      >
        {options === null ? (
          <li className={styles.empty} role="presentation">
            Loading subjects…
          </li>
        ) : options.length === 0 ? (
          <li className={styles.empty} role="presentation">
            {failed ? "Couldn't load subjects. You can still type a code." : `No subjects match “${text.trim()}”`}
          </li>
        ) : (
          options.map((subject, index) => (
            <li
              key={subject.code}
              id={`${listId}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={subject.code === value}
              className={cn(styles.option, index === highlight && styles.highlighted)}
              onPointerEnter={() => setHighlight(index)}
              onClick={() => commit(subject.code)}
            >
              <span className={styles.code}>{subject.code}</span>
              <span className={styles.desc}>{subject.description}</span>
              {subject.code === value ? <CheckIcon size={16} className={styles.check} /> : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
