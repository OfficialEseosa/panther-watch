import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";
import styles from "./AssistantChat.module.css";

/**
 * Assistant text as plain text (line breaks kept by CSS `white-space: pre-wrap`) with links:
 * - a PantherWatch URL (absolute on one of `appOrigins`, or a bare app path like /tracked-classes)
 *   becomes an in-app next/link with a short label from its path ("Open CSC 4350 in course search");
 * - any other https URL stays a plain auto-link that opens in a new tab (plain http stays text);
 * - `[label](url)`, which models write even when asked not to, keeps its label.
 * No other markdown is interpreted.
 */
export function RichText({ text, appOrigins }: { text: string; appOrigins: readonly string[] }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index;
    const [whole, mdLabel, mdUrl, bareUrl, bareLead, barePath] = match;
    let raw = mdUrl ?? bareUrl ?? barePath;
    let consumed = whole;
    let lead = "";
    if (barePath !== undefined) lead = bareLead ?? "";
    if (mdUrl === undefined) {
      // Trailing punctuation belongs to the sentence, not the URL.
      const trimmed = trimTrailing(raw);
      consumed = consumed.slice(0, consumed.length - (raw.length - trimmed.length));
      raw = trimmed;
    }
    if (index > last) nodes.push(text.slice(last, index));
    if (lead) nodes.push(lead);
    nodes.push(<LinkTo key={index} href={raw} label={mdLabel} appOrigins={appOrigins} />);
    last = index + consumed.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/**
 * [label](url) | an http(s) URL | an app path at the start of a word. Plain http URLs are matched
 * only so a local APP_URL (http://localhost:3000) links in-app; other http URLs stay text.
 */
const TOKEN =
  /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)|(https?:\/\/[^\s<>"']+)|(^|[\s(])(\/(?:course-results|course-search|tracked-classes|schedule-builder|dashboard|settings|assistant)(?:[/?#][^\s<>"']*)?)(?![\w-])/gm;

function trimTrailing(url: string): string {
  let out = url.replace(/[.,;:!?*_'"]+$/, "");
  // Drop a closing paren that has no opening one in the URL: "(see https://x.y/z)".
  while (out.endsWith(")") && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) {
    out = out.slice(0, -1).replace(/[.,;:!?]+$/, "");
  }
  return out;
}

function LinkTo({ href, label, appOrigins }: { href: string; label?: string; appOrigins: readonly string[] }) {
  const inApp = appPath(href, appOrigins);
  if (inApp) {
    return (
      <Link href={inApp} className={styles.appLink}>
        {label ?? labelFor(inApp)}
        <ArrowRightIcon size={14} aria-hidden="true" />
      </Link>
    );
  }
  if (!href.startsWith("https://")) return <>{label ?? href}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {label ?? href}
    </a>
  );
}

/** "/path?query#hash" when `href` is on PantherWatch, else null. */
function appPath(href: string, appOrigins: readonly string[]): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (!appOrigins.includes(url.origin)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const PAGE_LABELS: Record<string, string> = {
  "/course-search": "Course search",
  "/tracked-classes": "Tracked classes",
  "/schedule-builder": "Schedule builder",
  "/dashboard": "Dashboard",
  "/settings": "Settings",
  "/assistant": "AI Assistant",
  "/": "PantherWatch",
};

/** A short name for an in-app link, from its path (and the course, for search results). */
export function labelFor(path: string): string {
  const url = new URL(path, "https://app.invalid");
  if (url.pathname === "/course-results") {
    const subject = (url.searchParams.get("subjects") ?? url.searchParams.get("subject") ?? "").split(",")[0];
    const number = url.searchParams.get("courseNumber");
    const course = [subject, number].filter(Boolean).join(" ").toUpperCase();
    return course ? `Open ${course} in course search` : "Open in course search";
  }
  return PAGE_LABELS[url.pathname.replace(/\/+$/, "") || "/"] ?? url.pathname;
}
