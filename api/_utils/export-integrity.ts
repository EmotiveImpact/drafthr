import { createHash } from "node:crypto";

/**
 * Export integrity for the `draft.exported` audit entry.
 *
 * The export endpoint receives rendered HTML from the browser, so a hash of
 * that HTML only proves what the client chose to send. The audit record
 * instead hashes the draft content AS STORED for the tenant, and records
 * whether the exported HTML actually carries that stored text.
 */

export type StoredSection = {
  sectionId: string;
  title: string;
  html: string;
  position: number;
};

/** Canonical SHA-256 of the stored draft content (sections in position order). */
export function storedDraftSha256(sections: StoredSection[]): string {
  const canonical = JSON.stringify(
    [...sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => [s.sectionId, s.title, s.html]),
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Does the exported HTML contain the stored draft's text, in order?
 *
 * The browser transforms section HTML before export (accepted suggestions
 * merged, figure references renumbered, letterhead / disclaimer / footer
 * added), so byte equality is impossible. Instead, strip the stored text of
 * everything those transforms can change (suggestion marks in either state
 * and figure / attachment reference tokens) and require every remaining word
 * to appear in the exported text in the same order. Text that was edited,
 * removed or reordered after the last save fails the check; additions the
 * exporter makes (headers, footers, accepted insertions) do not.
 */
export function exportedHtmlMatchesStored(exportedHtml: string, sections: StoredSection[]): boolean {
  const exported = words(htmlToText(exportedHtml));
  const stored = [...sections]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => words(htmlToText(stripVolatileMarkup(s.html))));
  let i = 0;
  for (const word of stored) {
    while (i < exported.length && exported[i] !== word) i += 1;
    if (i >= exported.length) return false;
    i += 1;
  }
  return true;
}

function stripVolatileMarkup(html: string): string {
  return html
    .replace(/<(ins|del)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<span\b[^>]*\bdata-(?:fig|att)-id="[^"]*"[^>]*>[\s\S]*?<\/span>/gi, " ");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  );
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    const c = code.toLowerCase();
    if (c.startsWith("#x")) return safeChar(parseInt(c.slice(2), 16), m);
    if (c.startsWith("#")) return safeChar(parseInt(c.slice(1), 10), m);
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return named[c] ?? m;
  });
}

function safeChar(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function words(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s ]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}
