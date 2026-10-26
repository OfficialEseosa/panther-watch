import type { Agent } from "undici";
import { decodeEntities } from "@/lib/email/escape";
import { GoSolarAffinityError, GoSolarError } from "./errors";
import {
  GOSOLAR_HEADERS,
  buildUrl,
  getJson,
  resolveOptions,
  type GoSolarOptions,
  type ResolvedOptions,
} from "./http";
import type { SearchParams, SearchResponse, SearchResult } from "./types";

/**
 * Why every session owns a dedicated single-connection Agent:
 *
 * GoSolar sits behind an F5 BIG-IP. Searching is two requests (declare the term, then
 * search) that must hit the SAME backend node, because the declaration creates server-side
 * state on that node. The F5 picks a node per TCP connection and pins later requests via
 * the `BIGipServer...` affinity cookie, which it only issues on a fresh connection. A
 * shared keep-alive pool (Node's global undici dispatcher, which on Vercel Fluid compute
 * also outlives a single invocation) hands out already-pinned sockets: no BIGipServer cookie
 * comes back and the search lands on a node that never saw the declaration. GoSolar then
 * answers `success:true, data:null`; this was the production-only empty-search bug fixed
 * in the Java backend by commit e8233ee (see docs/audit-2026-10/02-backend-audit.md §1a).
 *
 * A new Agent with `connections: 1` guarantees the declaration opens a brand-new socket
 * (so the F5 issues the cookie) and the search reuses that same socket (or, if the server
 * closed it, a new one carrying the cookie). Never run concurrent searches on one session,
 * and always close it.
 */
export class GoSolarSession implements AsyncDisposable {
  private closed = false;

  constructor(
    readonly term: string,
    /** `name=value; name=value` from the declaration's Set-Cookie headers. */
    readonly cookies: string,
    private readonly agent: Agent,
    private readonly options: ResolvedOptions,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const query: [string, string][] = [
      ["txt_subject", params.subject],
      ["txt_courseNumber", params.courseNumber ?? ""],
      ["txt_term", this.term],
      ["pageOffset", String(params.pageOffset ?? 0)],
      ["pageMaxSize", String(params.pageMaxSize ?? 200)],
      ["sortColumn", "subjectDescription"],
      ["sortDirection", "asc"],
    ];
    if (params.level?.trim()) query.push(["txt_level", params.level.trim()]);

    const url = buildUrl(this.options.baseUrl, "/searchResults/searchResults", query);
    const body = (await getJson(url, this.options, {
      headers: { Cookie: this.cookies },
      dispatcher: this.agent,
    })) as SearchResponse | null;

    if (!body) throw new GoSolarError("GoSolar search returned an empty body", 200, url);
    if (body.success !== true) {
      throw new GoSolarError("GoSolar search returned success:false", 200, url);
    }
    if (body.data === null) {
      throw new GoSolarAffinityError(url, cookieNames(this.cookies));
    }
    return { ...body, data: (body.data ?? []).map(decodeStrings) };
  }

  /**
   * Destroys the Agent and its socket. `destroy()` rather than `close()`: close waits for
   * in-flight requests, which can hang on a half-dead connection after a timeout.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.agent.destroy();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/** Declares `term` on a fresh connection and returns a session pinned to that GoSolar node. */
export async function createGoSolarSession(
  term: string,
  options?: GoSolarOptions,
): Promise<GoSolarSession> {
  const resolved = resolveOptions(options);
  const agent = resolved.agentFactory();
  const url = `${resolved.baseUrl}/term/search`;

  try {
    const response = await resolved.fetchImpl(url, {
      method: "POST",
      headers: {
        ...GOSOLAR_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ term }).toString(),
      // A 302 here still carries the session cookies; following it would drop them.
      redirect: "manual",
      signal: AbortSignal.timeout(resolved.timeoutMs),
      dispatcher: agent,
    });
    // Drain the body so the single socket is free for the search request.
    await response.text().catch(() => "");

    if (response.status < 200 || response.status >= 400) {
      throw new GoSolarError(
        `GoSolar term declaration responded ${response.status}`,
        response.status,
        url,
      );
    }

    const cookies = joinSetCookies(response.headers.getSetCookie());
    if (!cookies) {
      throw new GoSolarError(
        "GoSolar term declaration returned no session cookies",
        response.status,
        url,
      );
    }
    return new GoSolarSession(term, cookies, agent, resolved);
  } catch (error) {
    await agent.destroy().catch(() => {});
    throw error;
  }
}

/** Keeps only `name=value` from each Set-Cookie header, joined for a Cookie header. */
export function joinSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";", 1)[0].trim())
    .filter((pair) => pair.includes("="))
    .join("; ");
}

function cookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((pair) => pair.split("=", 1)[0].trim())
    .filter(Boolean);
}

/**
 * Banner HTML-escapes its text fields ("Arts &amp; Humanities", "Lab &amp; Lecture"), which React
 * would show literally. Every string in a section is decoded once, here, for every caller.
 */
function decodeStrings<T>(value: T): T {
  if (typeof value === "string") return (value.includes("&") ? decodeEntities(value) : value) as T;
  if (Array.isArray(value)) return value.map(decodeStrings) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeStrings(item)])) as T;
  }
  return value;
}
