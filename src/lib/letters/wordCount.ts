import type { Draft } from "@/lib/letters/types";

/** Count human-readable words in stored rich-text HTML.
 *
 * A token must contain a letter or number, so punctuation-only tokens such as
 * an em dash do not inflate the total. Keeping this in one helper prevents the
 * Page editor, health checks, readiness warnings, and Matter rows disagreeing.
 */
export function countHtmlWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function countDraftWords(draft: Pick<Draft, "sections">): number {
  return countHtmlWords(draft.sections.map((section) => section.html ?? "").join(" "));
}
