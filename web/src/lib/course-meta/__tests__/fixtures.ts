import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Reads a file from __tests__/fixtures. */
export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}
