import type { FetchLike, GoSolarRequestInit, GoSolarResponse } from "../http";

export interface FakeResponse {
  status?: number;
  setCookies?: string[];
  body?: unknown;
}

export interface RecordedCall {
  url: string;
  init: GoSolarRequestInit;
}

export function response({ status = 200, setCookies = [], body = null }: FakeResponse = {}): GoSolarResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => setCookies },
    json: async () => body,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

/** Returns queued responses in order and records every call. */
export function fakeFetch(...responses: GoSolarResponse[]): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return next;
  };
  return { fetchImpl, calls };
}

export const DECLARE_OK = () =>
  response({
    setCookies: [
      "JSESSIONID=abc123; Path=/StudentRegistrationSsb; Secure; HttpOnly",
      "BIGipServerregistration.gosolar.gsu.edu=1234.5678.0000; path=/; Httponly; Secure",
    ],
  });
