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

export function resolveOptions(options: GoSolarOptions = {}): ResolvedOptions {
  return {
    fetchImpl: options.fetchImpl ?? undiciFetch,
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

export function buildUrl(baseUrl: string, path: string, params: [string, string][]): string {
  const query = new URLSearchParams(params).toString();
  return `${baseUrl}${path}${query ? `?${query}` : ""}`;
}
