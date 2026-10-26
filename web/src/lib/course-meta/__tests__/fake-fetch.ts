import type { FetchLike, MetaRequestInit, MetaResponse } from "../http";

export interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  setCookies?: string[];
  /** A string is returned verbatim by text(); anything else is JSON. */
  body?: unknown;
}

export interface RecordedCall {
  url: string;
  init: MetaRequestInit;
}

export function response({ status = 200, headers = {}, setCookies = [], body = "" }: FakeResponse = {}): MetaResponse {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower.get(name.toLowerCase()) ?? null, getSetCookie: () => setCookies },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

type Responder = MetaResponse | Error | ((url: string, init: MetaRequestInit) => MetaResponse);

/** Returns queued responses in order (an Error is thrown) and records every call. */
export function fakeFetch(...responses: Responder[]): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
  return { fetchImpl, calls };
}
