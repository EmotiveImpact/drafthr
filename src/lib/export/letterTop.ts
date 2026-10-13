import type { Draft } from "@/lib/letters/types";
import { formatDateOnly } from "@/lib/date-only";
import { isSafeImageRef } from "@/lib/safe-data-url";

/**
 * The top of the exported letter, as the letter page in the editor shows it
 * (components/editor/Letterhead.tsx): the company name on the left and its
 * address on the right over a hairline (or the uploaded letterhead image,
 * when the letter goes out on company letterhead), the "Private and
 * confidential" line, and the issue date under the recipient's address when
 * the recipient block does not carry a date already.
 *
 * Plain HTML with inline styles so every renderer (server PDF, the
 * in-browser PDF, the mobile read view, the pack summary) prints the same.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textOf(html: string): string {
  return (html ?? "")
    .replace(/<del\b[^>]*data-status="pending"[^>]*>[\s\S]*?<\/del>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Unit 4", "Quayside Park", "Bristol BS1 6XN" become two or three lines. */
function groupAddress(parts: string[]): string[] {
  if (parts.length <= 3) return parts;
  const head = parts.slice(0, -1);
  const out: string[] = [];
  for (let i = 0; i < head.length; i += 2) out.push(head.slice(i, i + 2).join(", "));
  out.push(parts[parts.length - 1]);
  return out;
}

/** The letterhead block: the uploaded image, or the company name and address. */
export function letterheadBlockHtml(draft: Draft): string {
  const url = draft.employer?.letterheadDataUrl;
  if (draft.employer?.hasLetterhead && isSafeImageRef(url)) {
    return `<div data-letter-top="letterhead" style="margin:0 0 24px 0;text-align:center;"><img src="${esc(url)}" style="max-width:100%;max-height:120px;display:inline-block;" alt="" /></div>`;
  }
  const name = draft.employer?.legalName?.trim() ?? "";
  const lines = groupAddress(
    (draft.employer?.address ?? "")
      .replace(/\s*\n\s*/g, ", ")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const phone = draft.employer?.phone?.trim() ?? "";
  if (!name && lines.length === 0) return "";
  const right = [...lines, ...(phone ? [phone] : [])].map((l) => `<div>${esc(l)}</div>`).join("");
  // Flex boxes rather than a table: the PDF styles put borders on every cell.
  return `<div data-letter-top="letterhead" style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin:0 0 20px 0;padding:0 0 12px 0;border-bottom:1px solid #e8e8ea;">
    <div style="min-width:0;font-size:15pt;line-height:1.2;color:#111110;">${esc(name)}</div>
    <div style="flex-shrink:0;text-align:right;font-size:9pt;line-height:1.5;color:#6b6b70;">${right}</div>
  </div>`;
}

/** "Private and confidential" (or "Confidential"), as the letter is set. */
export function confidentialLineHtml(draft: Draft): string {
  const c = draft.context?.confidentiality;
  if (c !== "private_and_confidential" && c !== "confidential") return "";
  return `<p data-letter-top="confidential" style="margin:0 0 6pt 0;font-size:9pt;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b70;">${
    c === "private_and_confidential" ? "Private and confidential" : "Confidential"
  }</p>`;
}

const DATE_RE =
  /\b\d{1,2}(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

/** The issue date line goes under the recipient block when that block has no date of its own. */
export function needsIssueDateLine(draft: Draft): boolean {
  if (!draft.context?.issueDate) return false;
  const recipient = (draft.sections ?? []).find((s) => s.sectionId === "recipient_block");
  if (!recipient) return false;
  return !DATE_RE.test(textOf(recipient.html));
}

/** The issue date as the letter prints it ("13 October 2026"; US: "October 13, 2026"). */
export function issueDateLineHtml(draft: Draft): string {
  if (!needsIssueDateLine(draft)) return "";
  const text =
    draft.context.jurisdiction === "US"
      ? formatDateOnly(draft.context.issueDate, { month: "long", day: "numeric", year: "numeric" }, "en-US")
      : formatDateOnly(draft.context.issueDate, { day: "numeric", month: "long", year: "numeric" }, "en-GB");
  return text ? `<p data-letter-top="date" style="margin:0 0 8pt 0;">${esc(text)}</p>` : "";
}
