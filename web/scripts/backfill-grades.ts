/**
 * Backfill of grade distributions from the APEX CSV exports committed in `web/data/grade-csv/`
 * (`<term>__summary.csv` + `<term>__detailed.csv`, see web/data/README.md) into `grade_terms` /
 * `section_grades`. APEX sits behind a Cloudflare challenge that blocks non-browser clients,
 * so this script (and the admin upload) is how grades get into production.
 *
 *   DATABASE_URL=... DATABASE_CA_CERT=... npx tsx scripts/backfill-grades.ts \
 *     [--dir ./data/grade-csv] [--terms 202508,202601] [--dry-run]
 *
 * Every selected term is parsed (with the same `parseTerm` the cron uses) before anything is
 * written; any parse failure aborts the run with a non-zero exit and no writes. Posted terms
 * are replaced via `upsertTerm`; terms with no CRS AVG yet are recorded via
 * `markTermUnposted` (which never downgrades a term that is already posted). Re-running is
 * safe.
 *
 * Connection: built exactly like `src/db/migrate.ts` (node-postgres Pool, verified TLS,
 * optional `DATABASE_CA_CERT`), except that `.env*` files are NOT loaded: `DATABASE_URL` must
 * be passed explicitly in the environment so the script never picks up a database by accident.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { CourseMetaDb } from "@/lib/course-meta/db";
import { gradeCsvKind, isTermPosted, parseTerm, type SectionGradeRow } from "@/lib/course-meta/grades/parse";
import { markTermUnposted, upsertTerm } from "@/lib/course-meta/grades/store";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const FILE_RE = /^(\d{6})__(summary|detailed)\.csv$/;
/** web/data/grade-csv, resolved from this file so the default works from any cwd. */
export const DEFAULT_DIR = fileURLToPath(new URL("../data/grade-csv", import.meta.url));

export interface BackfillOptions {
  /** Directory holding `<term>__summary.csv` + `<term>__detailed.csv` pairs. */
  dir: string;
  /** Only these terms (each must have a complete pair in `dir`); default every pair found. */
  terms?: readonly string[];
  /** Required unless `dryRun`. */
  db?: CourseMetaDb;
  /** Parse and report only; never touches the database. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface TermReport {
  term: string;
  rows: number;
  posted: boolean;
  /** Parse + write time. */
  ms: number;
}

export interface BackfillResult {
  terms: TermReport[];
  /** Rows stored (or, in a dry run, that would be stored). */
  totalRows: number;
  /** `term: reason` for every term that could not be parsed. Non-empty means nothing was written. */
  failures: string[];
  dryRun: boolean;
}

interface ParsedTerm {
  term: string;
  rows: SectionGradeRow[];
  posted: boolean;
  parseMs: number;
}

/** Terms in `dir` mapped to which of the two files exist. */
async function discoverTerms(dir: string): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  for (const name of await readdir(dir)) {
    const match = FILE_RE.exec(name);
    if (!match) continue;
    const kinds = found.get(match[1]) ?? new Set<string>();
    kinds.add(match[2]);
    found.set(match[1], kinds);
  }
  return found;
}

async function parseOne(dir: string, term: string): Promise<ParsedTerm> {
  const started = performance.now();
  const [summaryCsv, detailedCsv] = await Promise.all([
    readFile(path.join(dir, `${term}__summary.csv`), "utf8"),
    readFile(path.join(dir, `${term}__detailed.csv`), "utf8"),
  ]);
  for (const [expected, csv] of [["summary", summaryCsv], ["detailed", detailedCsv]] as const) {
    const kind = gradeCsvKind(csv);
    if (kind === expected) continue;
    throw new Error(
      kind ? `${expected} file is the ${kind} export (files swapped?)` : `${expected} file is not an APEX grade CSV`,
    );
  }
  const rows = parseTerm(summaryCsv, detailedCsv, term);
  if (rows.length === 0) throw new Error("no section rows parsed");
  return { term, rows, posted: isTermPosted(rows), parseMs: performance.now() - started };
}

/** Parses every selected term, then (unless `dryRun`) writes them oldest first. */
export async function backfill(options: BackfillOptions): Promise<BackfillResult> {
  const log = options.log ?? console.log;
  const dryRun = options.dryRun ?? false;
  if (!dryRun && !options.db) throw new Error("backfill: `db` is required unless dryRun");

  const available = await discoverTerms(options.dir);
  const wanted = options.terms ? [...new Set(options.terms)] : [...available.keys()];
  wanted.sort();

  const failures: string[] = [];
  const parsed: ParsedTerm[] = [];
  for (const term of wanted) {
    const kinds = available.get(term);
    const missing = ["summary", "detailed"].filter((kind) => !kinds?.has(kind));
    if (missing.length > 0) {
      failures.push(`${term}: missing ${missing.map((kind) => `${term}__${kind}.csv`).join(", ")}`);
      continue;
    }
    try {
      parsed.push(await parseOne(options.dir, term));
    } catch (error) {
      failures.push(`${term}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (wanted.length === 0) failures.push(`no <term>__summary.csv / <term>__detailed.csv pairs in ${options.dir}`);

  if (failures.length > 0) {
    for (const failure of failures) log(`FAILED ${failure}`);
    log("Aborted: nothing was written.");
    return { terms: [], totalRows: 0, failures, dryRun };
  }

  const reports: TermReport[] = [];
  for (const { term, rows, posted, parseMs } of parsed) {
    const started = performance.now();
    let stored = posted ? rows.length : 0;
    if (!dryRun) {
      if (posted) stored = await upsertTerm(term, rows, { db: options.db });
      else await markTermUnposted(term, { db: options.db });
    }
    const report: TermReport = { term, rows: stored, posted, ms: Math.round(parseMs + performance.now() - started) };
    reports.push(report);
    log(
      `${term}  ${String(report.rows).padStart(6)} rows  ${posted ? "posted  " : "unposted"}  ${report.ms} ms` +
        (dryRun ? "  (dry run)" : ""),
    );
  }

  const totalRows = reports.reduce((sum, report) => sum + report.rows, 0);
  const postedCount = reports.filter((report) => report.posted).length;
  log(
    `Total: ${reports.length} terms (${postedCount} posted, ${reports.length - postedCount} unposted), ` +
      `${totalRows} rows${dryRun ? " (dry run, database untouched)" : ""}.`,
  );
  return { terms: reports, totalRows, failures, dryRun };
}

// ------------------------------------------------------------------------------ CLI

function parseArgs(argv: readonly string[]): { dir: string; terms?: string[]; dryRun: boolean } {
  let dir: string | undefined;
  let terms: string[] | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const value = () => {
      const v = inline ?? argv[++i];
      if (!v) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--dir") dir = value();
    else if (flag === "--terms") terms = value().split(",").map((t) => t.trim()).filter(Boolean);
    else if (flag === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const bad = terms?.find((t) => !/^\d{6}$/.test(t));
  if (bad) throw new Error(`Invalid term code: ${bad}`);
  return { dir: dir ? path.resolve(dir) : DEFAULT_DIR, terms, dryRun };
}

/** Same pool options as src/db/migrate.ts. */
function createPool(raw: string): { pool: Pool; target: string } {
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);
  const ca = process.env.DATABASE_CA_CERT?.trim()
    ? process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n")
    : undefined;
  const plaintext = sslmode === "disable" && LOOPBACK_HOSTS.has(url.hostname);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: plaintext ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  return { pool, target: `${url.hostname}:${url.port || "5432"}${url.pathname}` };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Reading ${args.dir}`);

  if (args.dryRun) {
    const result = await backfill({ ...args, dryRun: true });
    if (result.failures.length > 0) process.exitCode = 1;
    return;
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set (pass it explicitly; .env files are not read)");
  const { pool, target } = createPool(raw);
  console.log(`Backfilling ${target}`);
  try {
    const result = await backfill({ ...args, db: drizzle(pool) });
    if (result.failures.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
