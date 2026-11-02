import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { termLabel } from "@/lib/format";
import { TOOLS, type ToolDefinition } from "@/lib/tools/registry";

/**
 * The shared PantherWatch tools (src/lib/tools/registry.ts) as Claude API tool definitions, and
 * the short labels the chat UI shows while a tool runs.
 */

type JsonSchema = Record<string, unknown>;

/** JSON Schema keywords strict tool use accepts (and that our Zod schemas produce). */
const KEPT = new Set(["type", "description", "enum", "const", "required", "items", "properties", "anyOf", "allOf"]);

const NOTES: Record<string, (value: unknown) => string> = {
  default: (v) => `Default: ${JSON.stringify(v)}.`,
  minimum: (v) => `Minimum ${v}.`,
  maximum: (v) => `Maximum ${v}.`,
  exclusiveMinimum: (v) => `Greater than ${v}.`,
  exclusiveMaximum: (v) => `Less than ${v}.`,
  minLength: (v) => `At least ${v} characters.`,
  maxLength: (v) => `At most ${v} characters.`,
  minItems: (v) => `At least ${v} items.`,
  maxItems: (v) => `At most ${v} items.`,
  pattern: (v) => `Must match the regular expression ${v}.`,
};

/**
 * Rewrites a Zod-generated JSON Schema into the subset strict tool use supports: every object
 * closed (`additionalProperties: false`), unsupported constraints (lengths, ranges, patterns,
 * defaults) moved into the description as hints. The tool handlers still validate the full
 * Zod schema, so nothing is lost; the model just isn't constrained by those keywords.
 */
export function toStrictSchema(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  const notes: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([name, child]) => [name, toStrictSchema(child)]),
      );
    } else if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      out.items = toStrictSchema(value as JsonSchema);
    } else if ((key === "anyOf" || key === "allOf") && Array.isArray(value)) {
      out[key] = value.map((child) => toStrictSchema(child as JsonSchema));
    } else if (KEPT.has(key)) {
      out[key] = value;
    } else if (NOTES[key]) {
      notes.push(NOTES[key](value));
    }
    // Anything else ($schema, additionalProperties, ...) is dropped.
  }
  if (out.type === "object") {
    out.properties ??= {};
    out.additionalProperties = false;
  }
  if (notes.length) out.description = [out.description, ...notes].filter(Boolean).join(" ");
  return out;
}

function toApiTool(tool: ToolDefinition): Anthropic.Beta.BetaTool {
  const schema = toStrictSchema(z.toJSONSchema(tool.inputSchema, { io: "input" }) as JsonSchema);
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  };
}

let cached: Anthropic.Beta.BetaTool[] | undefined;

/**
 * Every tool, in registry order (deterministic: the tool list is part of the cached prefix),
 * with a cache breakpoint on the last one.
 */
export function apiTools(): Anthropic.Beta.BetaTool[] {
  if (!cached) {
    const tools = TOOLS.map(toApiTool);
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
    cached = tools;
  }
  return cached;
}

// ------------------------------------------------------------------ labels

const MAX_LABEL = 60;

/** Model-supplied strings shown in a label: printable, short. */
function clean(value: unknown, max = 24): string {
  return typeof value === "string" ? value.replace(/[^\p{L}\p{N} .,'&()/-]/gu, "").trim().slice(0, max) : "";
}

function course(input: Record<string, unknown>): string {
  return [clean(input.subject, 8).toUpperCase(), clean(input.courseNumber, 8).toUpperCase()].filter(Boolean).join(" ");
}

function crnPart(input: Record<string, unknown>): string {
  const crn = clean(input.crn, 5);
  return crn ? `CRN ${crn}` : "";
}

function term(input: Record<string, unknown>): string {
  const code = clean(input.term, 6);
  return code ? termLabel(code) : "";
}

const LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  list_terms: () => "Checking which terms are open",
  search_subjects: (i) => (clean(i.query) ? `Looking up subjects matching "${clean(i.query)}"` : "Looking up subject codes"),
  search_sections: (i) => `Searching ${[course(i) || "sections", term(i) && `in ${term(i)}`].filter(Boolean).join(" ")}`,
  get_section_details: (i) =>
    `Getting grades and ratings for ${[course(i), crnPart(i) && `(${crnPart(i)})`].filter(Boolean).join(" ") || "a section"}`,
  get_course_requirements: (i) =>
    `Checking requirements for ${[course(i), crnPart(i) && (course(i) ? `(${crnPart(i)})` : crnPart(i))].filter(Boolean).join(" ") || "a section"}`,
  get_syllabus_summary: (i) =>
    `Reading the syllabus for ${[course(i), crnPart(i) && (course(i) ? `(${crnPart(i)})` : crnPart(i))].filter(Boolean).join(" ") || "a section"}`,
  list_watches: (i) => (i.includeSeats ? "Checking seats in your tracked classes" : "Checking your tracked classes"),
  list_schedule: () => "Checking your schedule",
  check_conflicts: (i) =>
    `Checking time conflicts${Array.isArray(i.crns) ? ` for ${i.crns.length} sections` : ""}`,
  add_watch: (i) => `Tracking ${[course(i), crnPart(i) && `(${crnPart(i)})`].filter(Boolean).join(" ") || "a section"}`,
  remove_watch: (i) => `Stopping alerts for ${crnPart(i) || "a section"}`,
  add_to_schedule: (i) =>
    `Adding ${[course(i), crnPart(i) && `(${crnPart(i)})`].filter(Boolean).join(" ") || "a section"} to your schedule`,
  remove_from_schedule: (i) => `Removing ${crnPart(i) || "a section"} from your schedule`,
};

/** "Searching CSC 4350 in Spring 2027": what the UI shows while a tool runs (at most 60 characters). */
export function toolLabel(name: string, input: unknown): string {
  const args = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const label = (LABELS[name] ?? (() => "Looking something up"))(args);
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label;
}
