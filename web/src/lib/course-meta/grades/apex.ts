import * as cheerio from "cheerio";
import { Agent } from "undici";
import {
  CHROME_USER_AGENT,
  CourseMetaHttpError,
  createCookieJar,
  defaultFetch,
  type CookieJar,
  type FetchLike,
} from "../http";

/**
 * Client for GSU's Oracle APEX "Grade Distributions By Course Sections" report
 * (app 140, page 184) at dssapex.gsu.edu.
 *
 * APEX is a stateful web UI, not an API:
 *   1. `GET f?p=140:184:0` 302-redirects a few times, handing out a session id
 *      (`p_instance`) plus affinity and Cloudflare cookies. Every hop can set cookies,
 *      so redirects are followed by hand with a cookie jar.
 *   2. Set the term filter (session state): `f?p=140:184:{session}::NO::P_TERM_184:{term}`.
 *      The rendered page is also where the two report region ids are discovered.
 *   3. Download the full CSV for a region: `f?p=140:184:{session}:FLOW_EXCEL_OUTPUT_{regionId}_en`.
 *      The HTML report is paginated (~30 rows); the export has every row (~7k per term).
 *      The export reflects the session's filter, so step 2 must precede step 3 on the same
 *      session, and the two cannot be combined into one URL.
 */

export const APEX_BASE_URL = "https://dssapex.gsu.edu/ords/f";
const APP = 140;
const PAGE = 184;
export const APEX_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 10;

const P_INSTANCE = /name="p_instance"[^>]*value="(\d{6,})"/;

export interface ApexOptions {
  /** Injectable for tests. Defaults to undici's fetch. */
  fetchImpl?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface RegionIds {
  summary: string;
  detailed: string;
}

export interface ApexSession extends AsyncDisposable {
  readonly id: string;
  /** Term codes from the landing page's P_TERM_184 dropdown, newest first. */
  readonly terms: string[];
  /** Sets the report's term filter (all subjects) and returns the rendered HTML. */
  setTerm(term: string): Promise<string>;
  /** Downloads the full CSV for a report region, reflecting the current term filter. */
  downloadCsv(regionId: string): Promise<string>;
  close(): Promise<void>;
}

export interface TermCsvs {
  term: string;
  regionIds: RegionIds;
  summaryCsv: string;
  detailedCsv: string;
}

// ------------------------------------------------------------------ HTML parsing (pure)

/** The APEX session id from a rendered page, or null. */
export function parsePInstance(html: string): string | null {
  return P_INSTANCE.exec(html)?.[1] ?? null;
}

/** Six-digit term codes from `select[name=P_TERM_184]`, newest first, deduplicated. */
export function parseTermOptions(html: string): string[] {
  const $ = cheerio.load(html);
  const values = new Set<string>();
  $(`select[name="P_TERM_${PAGE}"] option`).each((_i, option) => {
    const value = ($(option).attr("value") ?? "").trim();
    if (/^\d{6}$/.test(value)) values.add(value);
  });
  return [...values].sort().reverse();
}

/**
 * Finds the two report regions: the summary has a "Professor" column header, the detailed
 * one an "A+" header. Throws when either is missing (APEX layout changed, or an error page).
 */
export function extractRegionIds(html: string): RegionIds {
  const $ = cheerio.load(html);
  let summary: string | null = null;
  let detailed: string | null = null;
  for (const region of $("[data-region-id]").toArray()) {
    const regionId = $(region).attr("data-region-id") ?? "";
    if (!regionId) continue;
    const headers = $(region)
      .find("th")
      .toArray()
      .map((th) => $(th).text().replace(/\s+/g, " ").trim());
    if (headers.some((header) => header.toLowerCase() === "professor")) {
      summary = regionId;
    } else if (headers.includes("A+")) {
      detailed = regionId;
    }
  }
  if (!summary || !detailed) {
    throw new Error(
      `Could not find APEX grade report regions (summary=${summary ?? "none"}, detailed=${detailed ?? "none"})`,
    );
  }
  return { summary, detailed };
}

// ------------------------------------------------------------------------- session

interface Resolved {
  fetchImpl: FetchLike;
  baseUrl: string;
  timeoutMs: number;
}

/** GET with manual redirect following so cookies set on every hop land in the jar. */
async function apexGet(url: string, jar: CookieJar, agent: Agent, options: Resolved): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = {
      "User-Agent": CHROME_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,text/csv,*/*",
    };
    const cookie = jar.header(current);
    if (cookie) headers.Cookie = cookie;

    const response = await options.fetchImpl(current, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      dispatcher: agent,
    });
    jar.store(current, response.headers.getSetCookie());

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.text().catch(() => "");
      current = new URL(location, current).toString();
      continue;
    }

    const body = await response.text();
    if (!response.ok) {
      throw new CourseMetaHttpError(`APEX responded ${response.status}`, response.status, current);
    }
    return body;
  }
  throw new CourseMetaHttpError(`APEX redirected more than ${MAX_REDIRECTS} times`, null, url);
}

/**
 * Bootstraps a brand-new APEX session on its own undici Agent and cookie jar. Always
 * close it (try/finally, or `await using`).
 */
export async function createApexSession(options: ApexOptions = {}): Promise<ApexSession> {
  const resolved: Resolved = {
    fetchImpl: options.fetchImpl ?? defaultFetch,
    baseUrl: options.baseUrl ?? APEX_BASE_URL,
    timeoutMs: options.timeoutMs ?? APEX_TIMEOUT_MS,
  };
  const agent = new Agent();
  const jar = createCookieJar();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await agent.close();
  };

  try {
    const landing = await apexGet(`${resolved.baseUrl}?p=${APP}:${PAGE}:0`, jar, agent, resolved);
    const id = parsePInstance(landing);
    if (!id) throw new Error("Could not establish APEX session: no p_instance in landing page");
    const terms = parseTermOptions(landing);

    return {
      id,
      terms,
      setTerm: async (term) => {
        if (!/^\d{6}$/.test(term)) throw new Error(`Invalid term code: ${term}`);
        return apexGet(
          `${resolved.baseUrl}?p=${APP}:${PAGE}:${id}::NO::P_TERM_${PAGE}:${term}`,
          jar,
          agent,
          resolved,
        );
      },
      downloadCsv: (regionId) =>
        apexGet(
          `${resolved.baseUrl}?p=${APP}:${PAGE}:${id}:FLOW_EXCEL_OUTPUT_${encodeURIComponent(regionId)}_en`,
          jar,
          agent,
          resolved,
        ),
      close,
      [Symbol.asyncDispose]: close,
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

/** Sets `term` on the session, discovers the report regions and downloads both CSVs. */
export async function downloadTermCsvs(session: ApexSession, term: string): Promise<TermCsvs> {
  const html = await session.setTerm(term);
  const regionIds = extractRegionIds(html);
  const summaryCsv = await session.downloadCsv(regionIds.summary);
  const detailedCsv = await session.downloadCsv(regionIds.detailed);
  return { term, regionIds, summaryCsv, detailedCsv };
}
