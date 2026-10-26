import { fetch as undiciFetch, type Dispatcher } from "undici";

/** Same Chrome UA the Java clients sent (APEX sits behind Cloudflare). */
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface MetaRequestInit {
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  redirect?: "manual" | "follow";
  signal: AbortSignal;
  dispatcher?: Dispatcher;
}

/** The subset of a fetch Response these clients rely on. */
export interface MetaResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null; getSetCookie(): string[] };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: MetaRequestInit) => Promise<MetaResponse>;

/** Defaults to undici's fetch, which honours the per-session `dispatcher`. */
export const defaultFetch: FetchLike = undiciFetch;

export class CourseMetaHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = "CourseMetaHttpError";
  }
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  expiresAt: number | null;
}

/**
 * A deliberately small RFC 6265 cookie jar: enough for APEX's redirect chain (session,
 * affinity and Cloudflare `__cf_bm` cookies), which fetch's `redirect: "follow"` would
 * drop. Handles Domain / Path / Max-Age / Expires and deletion; ignores SameSite and
 * Secure (every request here is https).
 */
export interface CookieJar {
  /** Stores the Set-Cookie headers of a response for `url`. */
  store(url: string, setCookies: readonly string[]): void;
  /** The Cookie header value for a request to `url` ("" when nothing matches). */
  header(url: string): string;
}

export function createCookieJar(now: () => number = Date.now): CookieJar {
  const cookies = new Map<string, StoredCookie>();
  const id = (cookie: Pick<StoredCookie, "name" | "domain" | "path">) =>
    `${cookie.domain};${cookie.path};${cookie.name}`;

  return {
    store(url, setCookies) {
      const { hostname, pathname } = new URL(url);
      const host = hostname.toLowerCase();
      for (const raw of setCookies) {
        const [pair, ...attributes] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const cookie: StoredCookie = {
          name: pair.slice(0, eq).trim(),
          value: pair.slice(eq + 1).trim(),
          domain: host,
          hostOnly: true,
          path: defaultPath(pathname),
          expiresAt: null,
        };
        let maxAgeSeen = false;
        for (const attribute of attributes) {
          const sep = attribute.indexOf("=");
          const key = (sep >= 0 ? attribute.slice(0, sep) : attribute).trim().toLowerCase();
          const value = sep >= 0 ? attribute.slice(sep + 1).trim() : "";
          if (key === "domain" && value) {
            const domain = value.replace(/^\./, "").toLowerCase();
            if (host !== domain && !host.endsWith(`.${domain}`)) {
              cookie.name = ""; // foreign domain: reject
              break;
            }
            cookie.domain = domain;
            cookie.hostOnly = false;
          } else if (key === "path" && value.startsWith("/")) {
            cookie.path = value;
          } else if (key === "max-age" && /^-?\d+$/.test(value)) {
            maxAgeSeen = true;
            cookie.expiresAt = now() + Number.parseInt(value, 10) * 1000;
          } else if (key === "expires" && !maxAgeSeen) {
            const time = Date.parse(value);
            if (!Number.isNaN(time)) cookie.expiresAt = time;
          }
        }
        if (!cookie.name) continue;
        if (cookie.expiresAt !== null && cookie.expiresAt <= now()) {
          cookies.delete(id(cookie));
        } else {
          cookies.set(id(cookie), cookie);
        }
      }
    },

    header(url) {
      const { hostname, pathname } = new URL(url);
      const host = hostname.toLowerCase();
      const current = now();
      const pairs: string[] = [];
      for (const [key, cookie] of cookies) {
        if (cookie.expiresAt !== null && cookie.expiresAt <= current) {
          cookies.delete(key);
          continue;
        }
        const domainOk = cookie.hostOnly
          ? host === cookie.domain
          : host === cookie.domain || host.endsWith(`.${cookie.domain}`);
        if (domainOk && pathMatches(pathname, cookie.path)) pairs.push(`${cookie.name}=${cookie.value}`);
      }
      return pairs.join("; ");
    },
  };
}

function defaultPath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}
