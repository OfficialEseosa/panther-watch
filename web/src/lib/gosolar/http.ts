import { AsyncLocalStorage } from "node:async_hooks";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { GoSolarError } from "./errors";

export const GOSOLAR_BASE_URL = "https://registration.gosolar.gsu.edu/StudentRegistrationSsb/ssb";
export const DEFAULT_TIMEOUT_MS = 10_000;

export const GOSOLAR_HEADERS = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
} as const;

export interface GoSolarRequestInit {
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  redirect?: "manual" | "follow";
  signal: AbortSignal;
  dispatcher?: Dispatcher;
}

/** The subset of a fetch Response this client relies on. */
export interface GoSolarResponse {
  ok: boolean;
  status: number;
  headers: { getSetCookie(): string[] };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: GoSolarRequestInit) => Promise<GoSolarResponse>;

/** Creates the dedicated dispatcher of one GoSolar session (see session.ts). */
export type AgentFactory = () => Agent;

/** One fresh socket per session: the F5 issues its affinity cookie only on a new connection. */
export const createSessionAgent: AgentFactory = () => new Agent({ connections: 1 });

export interface GoSolarOptions {
  /** Injectable for tests. Defaults to undici's fetch, which matches the undici Agent used for sessions. */
  fetchImpl?: FetchLike;
  /** Injectable for tests (e.g. to observe the Agent). Defaults to `createSessionAgent`. */
  agentFactory?: AgentFactory;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ResolvedOptions {
  fetchImpl: FetchLike;
  agentFactory: AgentFactory;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * GoSolar request counts and time for whatever runs inside `measureGoSolar` (e.g. one assistant
 * tool call). AsyncLocalStorage, so concurrent work in other contexts is never mixed in; outside
 * a measurement nothing is recorded. `ms` is the sum of request durations (headers through the
 * body being read), so concurrent requests can add up to more than the wall time.
 */
export interface GoSolarStats {
  requests: number;
  /** Term declarations (`POST /term/search`): one per GoSolar session. */
  sessions: number;
  ms: number;
}

const statsStore = new AsyncLocalStorage<GoSolarStats>();

/** `POST /term/search`, with or without `?mode=courseSearch`. */
const TERM_DECLARATION = /\/term\/search(\?|$)/;

/** Runs `work`, counting its GoSolar requests into `gosolar` (readable while it runs, too). */
export async function measureGoSolar<T>(
  work: () => Promise<T>,
  gosolar: GoSolarStats = { requests: 0, sessions: 0, ms: 0 },
): Promise<{ value: T; gosolar: GoSolarStats }> {
  const value = await statsStore.run(gosolar, work);
  return { value, gosolar };
}

/** Wraps a FetchLike so requests (and reading their bodies) count toward the active measurement. */
function measured(fetchImpl: FetchLike): FetchLike {
  return async (url, init) => {
    const stats = statsStore.getStore();
    if (!stats) return fetchImpl(url, init);
    const started = performance.now();
    stats.requests++;
    if (TERM_DECLARATION.test(url)) stats.sessions++;
    const settle = () => {
      stats.ms += performance.now() - started;
    };
    let response: GoSolarResponse;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      settle();
      throw error;
    }
    let done = false;
    const finish = <T>(read: () => Promise<T>) => async (): Promise<T> => {
      try {
        return await read();
      } finally {
        if (!done) {
          done = true;
          settle();
        }
      }
    };
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      json: finish(() => response.json()),
      text: finish(() => response.text()),
    };
  };
}

export function resolveOptions(options: GoSolarOptions = {}): ResolvedOptions {
  return {
    fetchImpl: measured(options.fetchImpl ?? undiciFetch),
    agentFactory: options.agentFactory ?? createSessionAgent,
    baseUrl: options.baseUrl ?? GOSOLAR_BASE_URL,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** GET a JSON endpoint; non-2xx and unparseable bodies become a GoSolarError. */
export async function getJson(
  url: string,
  options: ResolvedOptions,
  extra: { headers?: Record<string, string>; dispatcher?: Dispatcher } = {},
): Promise<unknown> {
  const response = await options.fetchImpl(url, {
    method: "GET",
    headers: { ...GOSOLAR_HEADERS, ...extra.headers },
    signal: AbortSignal.timeout(options.timeoutMs),
    dispatcher: extra.dispatcher,
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new GoSolarError(`GoSolar responded ${response.status}`, response.status, url);
  }
  try {
    return await response.json();
  } catch (cause) {
    // E.g. an HTML maintenance or login page served with 200.
    throw new GoSolarError("GoSolar returned a body that is not JSON", response.status, url, {
      cause,
    });
  }
}

/** Accept header of Banner's HTML fragment endpoints (`searchResults/getSectionPrerequisites` etc.). */
export const GOSOLAR_HTML_HEADERS = {
  Accept: "text/html, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
} as const;

/**
 * POST a form and return the body text; non-2xx becomes a GoSolarError. Timeouts and socket
 * errors are wrapped in a GoSolarError too (status null, original error as `cause`).
 */
export async function postFormText(
  url: string,
  form: Record<string, string>,
  options: ResolvedOptions,
  extra: { headers?: Record<string, string>; dispatcher?: Dispatcher } = {},
): Promise<string> {
  try {
    const response = await options.fetchImpl(url, {
      method: "POST",
      headers: {
        ...GOSOLAR_HTML_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...extra.headers,
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(options.timeoutMs),
      dispatcher: extra.dispatcher,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new GoSolarError(`GoSolar responded ${response.status}`, response.status, url);
    }
    return text;
  } catch (error) {
    throw asGoSolarError(error, url);
  }
}

/** Leaves GoSolarErrors as they are; wraps timeouts, aborts and socket errors in one. */
export function asGoSolarError(error: unknown, url: string): unknown {
  if (error instanceof GoSolarError) return error;
  if (error instanceof Error) {
    const network =
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      (error instanceof TypeError && error.message === "fetch failed");
    if (network) {
      const what = error.name === "TimeoutError" ? "timed out" : "failed";
      return new GoSolarError(`GoSolar request ${what}`, null, url, { cause: error });
    }
  }
  return error;
}

export function buildUrl(baseUrl: string, path: string, params: [string, string][]): string {
  const query = new URLSearchParams(params).toString();
  return `${baseUrl}${path}${query ? `?${query}` : ""}`;
}
