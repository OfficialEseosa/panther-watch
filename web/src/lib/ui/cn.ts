/** Joins class names, skipping falsy values. `cn("a", cond && "b", undefined)` -> "a b". */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
