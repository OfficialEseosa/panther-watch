const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for use in HTML text or a quoted attribute. */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decodes the handful of entities GoSolar (Banner SSB) puts in course titles, e.g.
 * "Lab &amp; Lecture". Run before escapeHtml so such titles are not double-escaped into a
 * visible "&amp;". The result is plain text and must still be escaped before going into HTML.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Rough HTML-to-text for the plain-text part of admin emails, whose body is raw HTML.
 * Block-level closers and <br> become line breaks, every other tag is dropped.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const inner = label.replace(/<[^>]*>/g, "").trim();
      return inner && inner !== href ? `${inner} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|table|blockquote)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Email subjects are headers: collapse CR/LF and surrounding whitespace into one space. */
export function cleanSubject(subject: string): string {
  return subject.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
