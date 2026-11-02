"use client";

import { useId, useState } from "react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CAMPUS_OPTIONS, isLevelPreference, type LevelPreference } from "@/lib/account/levels";
import { patchJson, reportApiError } from "@/lib/client/http";
import ui from "./Settings.module.css";

/**
 * Settings > Campus: the degree level (GoSolar US / UA / GS) the course search form starts on
 * and the assistant searches when the student doesn't say. Saves on change (PATCH /api/account);
 * "Not set" clears it, and both then fall back to bachelor's.
 */
export function CampusPreference({ initial }: { initial: LevelPreference | null }) {
  const toast = useToast();
  const labelId = useId();
  const hintId = useId();
  const [value, setValue] = useState<LevelPreference | null>(initial);
  const [pending, setPending] = useState(false);

  const onChange = async (raw: string) => {
    const next = isLevelPreference(raw) ? raw : null;
    const previous = value;
    setValue(next);
    setPending(true);
    try {
      await patchJson<{ levelPreference: LevelPreference | null }>("/api/account", { levelPreference: next });
      toast.success(next ? "Campus saved" : "Campus cleared", {
        body: next
          ? "Course search and the assistant will start with these classes."
          : "Course search and the assistant will start with bachelor's classes.",
      });
    } catch (error) {
      setValue(previous);
      reportApiError(toast, error, "Couldn't save your campus");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={ui.item}>
      <div className={ui.info}>
        <p className={ui.label} id={labelId}>
          Your campus
        </p>
        <p className={ui.description} id={hintId}>
          Course search and the assistant show this campus&rsquo;s classes unless you pick another. Perimeter College
          classes are listed separately from Atlanta campus classes.
        </p>
      </div>
      <div className={ui.campusControl}>
        <Select
          aria-labelledby={labelId}
          aria-describedby={hintId}
          value={value ?? ""}
          disabled={pending}
          onChange={(event) => void onChange(event.target.value)}
        >
          <option value="">Not set</option>
          {CAMPUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
