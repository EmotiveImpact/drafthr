import type { Draft, Section } from "@/lib/letters/types";
import { DIMENSION_LABELS, type HealthCheck } from "@/lib/finalize/healthChecks";

/**
 * What the Fix button on a health check does (FM "Fix button on a finding":
 * a fix asks DraftHR, and the change arrives as a suggested edit card).
 *
 *   ai        DraftHR rewrites one section as a suggested edit
 *   comments  open the Edits tab on Comments
 *   evidence  open the evidence drawer
 *   settings  go to Settings (signature, letterhead, company details)
 *   section   scroll to a section the person has to write themselves
 */
export type FixPlan =
  | { kind: "ai"; section: Section; instruction: string; category: string }
  | { kind: "comments" }
  | { kind: "evidence" }
  | { kind: "settings" }
  | { kind: "section"; sectionId: string };

// Same pattern as the health engine's placeholder check.
const PLACEHOLDER_RE = /\[(TBD[^\]]{0,80}|[A-Za-z][A-Za-z0-9_ ]{0,40})\]|\{\{\s*([^}]{1,60}?)\s*\}\}/g;
const NOT_PLACEHOLDERS = new Set(["sic", "emphasis added", "emphasis in original", "redacted"]);
const PII_RE = /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b|\b\d{3}-\d{2}-\d{4}\b|\b(?:date of birth|DOB)\b/i;

export function textOf(html: string): string {
  return (html ?? "")
    .replace(/<del\b[^>]*data-status="pending"[^>]*>[\s\S]*?<\/del>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The placeholders still in a piece of text ("[date of review meeting]"). */
export function placeholdersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const inner = (m[1] ?? m[2] ?? "").trim();
    if (!inner || NOT_PLACEHOLDERS.has(inner.toLowerCase()) || /^see\s/i.test(inner)) continue;
    out.push(m[0]);
  }
  return out;
}

/** The section a check points at, when it points at one. */
export function sectionForCheck(check: HealthCheck, draft: Draft): Section | null {
  const sections = draft.sections ?? [];
  if (check.id === "placeholders") {
    return sections.find((s) => placeholdersIn(textOf(s.html)).length > 0) ?? null;
  }
  if (check.id === "pii") {
    return sections.find((s) => PII_RE.test(textOf(s.html))) ?? null;
  }
  if (check.id === "sections-filled") {
    return sections.find((s) => s.required && !textOf(s.html)) ?? sections.find((s) => !textOf(s.html)) ?? null;
  }
  if (check.id === "wordcount") {
    return (
      sections.find((s) => s.sectionId === "body") ??
      [...sections].sort((a, b) => textOf(b.html).length - textOf(a.html).length)[0] ??
      null
    );
  }
  return null;
}

export function planFix(check: HealthCheck, draft: Draft): FixPlan {
  const category = DIMENSION_LABELS[check.dimension] ?? "Compliance";
  if (check.id === "comments") return { kind: "comments" };
  if (check.actionRoute === "evidence" || check.id === "evidence") return { kind: "evidence" };
  if (check.actionRoute === "settings") return { kind: "settings" };
  const section = sectionForCheck(check, draft);
  if (!section) return { kind: "settings" };
  if (check.id === "placeholders") {
    const list = placeholdersIn(textOf(section.html));
    return {
      kind: "ai",
      section,
      category,
      instruction: `Replace the unfilled placeholder${list.length === 1 ? "" : "s"} ${list.join(", ")} with the real detail from the letter's facts. If the detail is not known, reword the sentence so it reads naturally without it, for example by saying the date will be confirmed in writing. Keep everything else the same.`,
    };
  }
  if (check.id === "pii") {
    return {
      kind: "ai",
      section,
      category,
      instruction:
        "Remove personal identifiers that the letter does not need (National Insurance numbers, social security numbers, dates of birth). Keep everything else the same.",
    };
  }
  if (check.id === "wordcount") {
    return {
      kind: "ai",
      section,
      category,
      instruction: `${check.label}. Adjust the length of this section so the letter falls within the expected range, without dropping any fact, date or required clause.`,
    };
  }
  if (check.id === "sections-filled") {
    return {
      kind: "ai",
      section,
      category,
      instruction: "Draft this section from the letter's facts.",
    };
  }
  return { kind: "section", sectionId: section.id };
}

/** "Required · <detail>" / "Recommended · <detail>" under a check. */
export function checkBasis(check: HealthCheck): string {
  const sev = check.severity === "fail" ? "Required" : "Recommended";
  return check.detail ? `${sev} · ${check.detail}` : sev;
}
