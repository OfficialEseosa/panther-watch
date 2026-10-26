/**
 * Schedule color palette, ported from frontend-web/src/utils/scheduleColors.js. The DB stores
 * `schedule_entries.color` as an index into SCHEDULE_PALETTE (null = derive from the CRN),
 * so never reorder or remove entries; only append. The fills are the original flat palette;
 * `scheduleTextColor` picks a readable text color for each. Pure: safe to import from client
 * components.
 */

export interface ScheduleColor {
  id: string;
  hex: string;
  label: string;
  /** Closest CSS3 color name, for the RFC 7986 COLOR property in calendar exports. */
  icsName: string;
}

export const SCHEDULE_COLORS: readonly ScheduleColor[] = [
  { id: "blue", hex: "#2563eb", label: "Blue", icsName: "royalblue" },
  { id: "teal", hex: "#0d9488", label: "Teal", icsName: "teal" },
  { id: "violet", hex: "#7c3aed", label: "Violet", icsName: "blueviolet" },
  { id: "pink", hex: "#db2777", label: "Pink", icsName: "mediumvioletred" },
  { id: "orange", hex: "#ea580c", label: "Orange", icsName: "chocolate" },
  { id: "green", hex: "#16a34a", label: "Green", icsName: "forestgreen" },
  { id: "cyan", hex: "#0891b2", label: "Cyan", icsName: "darkcyan" },
  { id: "slate", hex: "#475569", label: "Slate", icsName: "darkslategray" },
];

/** The palette as hex strings; `schedule_entries.color` indexes this array. */
export const SCHEDULE_PALETTE: readonly string[] = SCHEDULE_COLORS.map((color) => color.hex);

export const PALETTE_SIZE = SCHEDULE_PALETTE.length;

export function isColorIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < PALETTE_SIZE;
}

/** Hex for a palette index, or null when out of range. */
export function colorIndexToHex(index: number | null | undefined): string | null {
  return isColorIndex(index) ? SCHEDULE_PALETTE[index] : null;
}

/** Palette index of a hex color (case-insensitive, `#` optional), or null when not in the palette. */
export function hexToColorIndex(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const normalized = `#${hex.trim().replace(/^#/, "").toLowerCase()}`;
  const index = SCHEDULE_PALETTE.indexOf(normalized);
  return index === -1 ? null : index;
}

/**
 * Stable fallback for entries with no stored color: the CRN's digits modulo the palette, so
 * the same class always renders the same color (same rule as the old `colorForCrn`).
 */
export function colorIndexForCrn(crn: string): number {
  const numeric = parseInt(String(crn).replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(numeric) ? 0 : numeric % PALETTE_SIZE;
}

/** The stored color, else the CRN-derived one. */
export function resolveColorIndex(color: number | null | undefined, crn: string): number {
  return isColorIndex(color) ? color : colorIndexForCrn(crn);
}

/**
 * Default color for a newly added class: the first palette index not used by another class
 * in the same term, cycling by count when the palette is exhausted (old `pickDefaultColor`).
 */
export function pickDefaultColorIndex(usedIndexes: readonly (number | null | undefined)[]): number {
  const used = new Set(usedIndexes.filter(isColorIndex));
  for (let i = 0; i < PALETTE_SIZE; i++) {
    if (!used.has(i)) return i;
  }
  return usedIndexes.length % PALETTE_SIZE;
}

/** Block text colors: white, or the old heading navy where white falls short of 4.5:1. */
export const SCHEDULE_TEXT_LIGHT = "#ffffff";
export const SCHEDULE_TEXT_DARK = "#0b1222";

function luminance(hex: string): number {
  const value = hex.replace(/^#/, "");
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2 contrast ratio between two #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text color for a block filled with palette color `index`: white when it reaches 4.5:1 (WCAG
 * AA), else whichever of white / dark navy contrasts more. Several of the original fills (teal,
 * orange, green, cyan, pink) are too light for white text.
 */
export function scheduleTextColor(index: number): string {
  const fill = SCHEDULE_PALETTE[isColorIndex(index) ? index : 0];
  const light = contrastRatio(fill, SCHEDULE_TEXT_LIGHT);
  if (light >= 4.5) return SCHEDULE_TEXT_LIGHT;
  return contrastRatio(fill, SCHEDULE_TEXT_DARK) > light ? SCHEDULE_TEXT_DARK : SCHEDULE_TEXT_LIGHT;
}

/** CSS3 color name for the ICS COLOR property, or null. Accepts an index or a hex string. */
export function icsColorName(color: number | string | null | undefined): string | null {
  const index = typeof color === "string" ? hexToColorIndex(color) : isColorIndex(color) ? color : null;
  return index === null ? null : SCHEDULE_COLORS[index].icsName;
}
