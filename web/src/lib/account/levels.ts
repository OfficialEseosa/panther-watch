import { z } from "zod";

/**
 * The degree levels (GoSolar `txt_level`) a student can save as their campus preference, and
 * how Settings and the tools name them. Pure: safe to import from client components.
 *
 * - US: bachelor's level, Atlanta campus and online (the default everywhere when nothing is set)
 * - UA: associate level, Perimeter College campuses (and Perimeter's own online sections)
 * - GS: graduate level
 */
export const LEVEL_PREFERENCES = ["US", "UA", "GS"] as const;
export type LevelPreference = (typeof LEVEL_PREFERENCES)[number];

/** What search_sections and the course search form use when the student hasn't chosen. */
export const DEFAULT_LEVEL: LevelPreference = "US";

export const isLevelPreference = (value: unknown): value is LevelPreference =>
  typeof value === "string" && (LEVEL_PREFERENCES as readonly string[]).includes(value);

/** Short names for tool results ("levelName"). */
export const LEVEL_NAMES: Record<LevelPreference, string> = {
  US: "Bachelor's level",
  UA: "Associate level (Perimeter College)",
  GS: "Graduate level",
};

/** The Settings > Campus choices, in display order. */
export const CAMPUS_OPTIONS: ReadonlyArray<{ value: LevelPreference; label: string }> = [
  { value: "US", label: "Atlanta campus or online (bachelor's)" },
  { value: "UA", label: "Perimeter College (associate)" },
  { value: "GS", label: "Graduate" },
];

/** PATCH /api/account body: `levelPreference` is a level, or null to clear it. */
export const accountPatchSchema = z
  .object({
    levelPreference: z.enum(LEVEL_PREFERENCES, { message: "levelPreference must be US, UA, GS or null" }).nullable(),
  })
  .strict();
