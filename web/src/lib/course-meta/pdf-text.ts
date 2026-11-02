import { createHash } from "node:crypto";
import { CHROME_USER_AGENT } from "./http";

/**
 * Fetches a syllabus PDF from GSU's CDN and extracts its text, for the syllabus summaries
 * (syllabus-summary.ts). Only `https://cdn.gsu.edu/` is ever fetched (a hard allowlist: the URL
 * comes from our own index, but the check keeps this from becoming a general fetcher), redirects
 * are not followed, and the download is capped in time and size.
 *
 * Text extraction uses unpdf (PDF.js's serverless build: pure JS, no native dependencies, so it
 * runs in a Vercel Node function).
 */

export const PDF_ALLOWED_PREFIX = "https://cdn.gsu.edu/";
export const PDF_TIMEOUT_MS = 10_000;
export const PDF_MAX_BYTES = 8 * 1024 * 1024;
/** Longest text handed to the model (characters, after whitespace is collapsed). */
export const PDF_MAX_TEXT_CHARS = 60_000;
/** Less extracted text than this is treated as a scanned (image-only) PDF. */
const MIN_TEXT_CHARS = 200;

export type PdfFetch = (url: string, init: { headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }) => Promise<Response>;

/** Why a syllabus couldn't be read. `transient` failures may succeed on a later try. */
export type PdfFailure =
  | { reason: "not_allowed"; transient: false; detail: string }
  | { reason: "fetch_failed"; transient: true; detail: string }
  | { reason: "too_large"; transient: false; detail: string }
  | { reason: "not_pdf"; transient: false; detail: string }
  | { reason: "no_text"; transient: false; detail: string };

export type PdfTextResult =
  | {
      ok: true;
      /** Whitespace-collapsed text, cut at PDF_MAX_TEXT_CHARS. */
      text: string;
      /** SHA-256 (hex) of the full collapsed text, before the cut. */
      sha256: string;
      truncated: boolean;
      pages: number;
    }
  | ({ ok: false } & PdfFailure);

export interface PdfTextOptions {
  fetchImpl?: PdfFetch;
  /** Tests: replaces PDF parsing (bytes -> per-page text). */
  extract?: (bytes: Uint8Array) => Promise<{ pages: number; text: string }>;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Whether `url` is on the allowlist: https, host cdn.gsu.edu, default port, no credentials. */
export function isAllowedPdfUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "cdn.gsu.edu" &&
    parsed.port === "" &&
    !parsed.username &&
    !parsed.password &&
    parsed.href.startsWith(PDF_ALLOWED_PREFIX)
  );
}

export const collapseWhitespace = (text: string): string =>
  text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\r?\n[\s]*/g, "\n")
    .trim();

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

async function defaultExtract(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // verbosity 0: errors only (PDF.js otherwise logs font warnings for many real syllabi).
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pages: totalPages, text: text.join("\n\n") };
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}

/** Reads the body, refusing more than `max` bytes (Content-Length first, then while streaming). */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const looksLikePdf = (bytes: Uint8Array): boolean =>
  // "%PDF-" within the first KB (some generators put a few bytes before the header).
  Buffer.from(bytes.subarray(0, 1024)).includes("%PDF-");

/** Downloads `url` (allowlisted) and returns its text, or why it couldn't. Never throws. */
export async function fetchPdfText(url: string, options: PdfTextOptions = {}): Promise<PdfTextResult> {
  if (!isAllowedPdfUrl(url)) {
    return { ok: false, reason: "not_allowed", transient: false, detail: "Only syllabi on cdn.gsu.edu can be read." };
  }
  const fetchImpl: PdfFetch = options.fetchImpl ?? ((u, init) => fetch(u, init));
  const max = options.maxBytes ?? PDF_MAX_BYTES;
  const signal = AbortSignal.timeout(options.timeoutMs ?? PDF_TIMEOUT_MS);

  let bytes: Uint8Array | null;
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": CHROME_USER_AGENT, Accept: "application/pdf,*/*;q=0.5" },
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, reason: "fetch_failed", transient: true, detail: `GSU's file server answered HTTP ${response.status}.` };
    }
    bytes = await readCapped(response, max);
  } catch (error) {
    const timedOut = signal.aborted || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
    return {
      ok: false,
      reason: "fetch_failed",
      transient: true,
      detail: timedOut ? "GSU's file server didn't answer in time." : "Couldn't download the syllabus from GSU's file server.",
    };
  }
  if (!bytes) return { ok: false, reason: "too_large", transient: false, detail: `The syllabus file is over ${max / 1024 / 1024} MB.` };
  if (!looksLikePdf(bytes)) return { ok: false, reason: "not_pdf", transient: false, detail: "The posted syllabus isn't a PDF." };

  let extracted: { pages: number; text: string };
  try {
    extracted = await (options.extract ?? defaultExtract)(bytes);
  } catch (error) {
    console.warn("syllabus: PDF text extraction failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "not_pdf", transient: false, detail: "The syllabus PDF couldn't be opened (damaged or protected)." };
  }
  const full = collapseWhitespace(extracted.text);
  if (full.length < MIN_TEXT_CHARS) {
    return { ok: false, reason: "no_text", transient: false, detail: "The syllabus PDF has no readable text (probably a scan)." };
  }
  return {
    ok: true,
    text: full.slice(0, PDF_MAX_TEXT_CHARS),
    sha256: sha256Hex(full),
    truncated: full.length > PDF_MAX_TEXT_CHARS,
    pages: extracted.pages,
  };
}
