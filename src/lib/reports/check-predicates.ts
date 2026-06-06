/* ============================================================================
 * Health-check predicates for the Reports surface.
 *
 * Mirrors the rules in `lib/finalize/healthChecks.ts` but exposes them in the
 * shape the /reports drill-down needs:
 *
 *   predicate(draft) => null            // letter passes
 *   predicate(draft) => "reason string" // letter fails, with the specific
 *                                       // reason this letter is failing
 *
 * The Reports page consumes the same HEALTH_CHECKS list so the workspace-
 * level aggregate counts and the per-check drill-down list never diverge.
 *
 * Why a separate file vs. extending healthChecks.ts directly?
 *   - healthChecks.ts is the per-draft scorer used by Finalize; it returns a
 *     full HealthCheck object (label/severity/dimension/etc) per draft.
 *   - The Reports drill-down only needs "is this letter failing THIS named
 *     check, and if so, why?" — a thinner predicate API. Layering this on
 *     top keeps the scorer focused on scoring and the reporter focused on
 *     reporting, while both share the same underlying signals (sections,
 *     placeholders, PII patterns, evidence refs, etc).
 * ==========================================================================*/

import type { Draft } from "@/lib/letters/types";
import { validFigureNumbers } from "@/lib/evidence";
import { differenceInCalendarDays, format } from "date-fns";

export type HealthCheck = {
  /** Stable id used in routes (/reports/checks/:checkId) — kebab-case. */
  id: string;
  /** Short label rendered in the Reports list and drill-down header. */
  label: string;
  /** One-line "why this matters" copy for the drill-down header. */
  description: string;
  /** Returns null when the draft passes, or a short specific reason string
   * when it fails. */
  predicate: (draft: Draft) => null | string;
};

/* ─── shared helpers (kept local — same shape as healthChecks.ts) ─────── */

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
}

function bodyText(draft: Draft): string {
  return draft.sections.map((s) => stripHtml(s.html ?? "")).join("\n");
}

const PLACEHOLDER_RE = /\[([a-z][a-z0-9_]*)\]/gi;
const PII_PATTERNS: { id: string; re: RegExp; label: string }[] = [
  { id: "ni-number", re: /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/, label: "UK NI number" },
  { id: "us-ssn", re: /\b\d{3}-\d{2}-\d{4}\b/, label: "US SSN" },
  { id: "dob-long", re: /\b\d{1,2}\/\d{1,2}\/(19|20)\d{2}\b/, label: "full date of birth" },
];

/** Detect a disclaimer block: a closing horizontal rule followed by any
 * paragraph that mentions "confidential", "without prejudice", or
 * "privileged" — the three phrases our templates consistently use. */
function hasDisclaimerBlock(draft: Draft): boolean {
  for (const s of draft.sections) {
    const html = s.html ?? "";
    if (!/<hr\b/i.test(html)) continue;
    const after = html.split(/<hr\b[^>]*>/i).slice(1).join(" ");
    const plain = stripHtml(after).toLowerCase();
    if (/confidential|without prejudice|privileged/.test(plain)) return true;
  }
  return false;
}

/* ─── individual predicates ───────────────────────────────────────────── */

function predicateMissingDisclaimer(draft: Draft): null | string {
  if (hasDisclaimerBlock(draft)) return null;
  return "No <hr> + disclaimer block detected at the foot of the letter";
}

function predicateUnapprovedSevenDays(draft: Draft): null | string {
  const reviewStatus = draft.reviewStatus ?? "draft";
  // Approved drafts and drafts already marked-as-sent are out of scope.
  if (reviewStatus === "approved") return null;
  const wasSent = (draft.exports ?? []).some((e) => e.format === "marked-sent");
  if (wasSent) return null;
  const days = differenceInCalendarDays(new Date(), new Date(draft.updatedAt));
  if (days < 7) return null;
  const editedOn = format(new Date(draft.updatedAt), "yyyy-MM-dd");
  return `Last edited ${editedOn}, no approval recorded (${days} days ago)`;
}

function predicateUnresolvedPlaceholders(draft: Draft): null | string {
  const text = bodyText(draft);
  const found = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) found.add(m[1]);
  if (found.size === 0) return null;
  const list = [...found].slice(0, 3).join(", ");
  const more = found.size > 3 ? ` (+${found.size - 3} more)` : "";
  return `${found.size} unresolved placeholder${found.size === 1 ? "" : "s"} in body: ${list}${more}`;
}

function predicateEmptySections(draft: Draft): null | string {
  const total = draft.sections.length;
  const empty = draft.sections.filter(
    (s) => s.status !== "ready" && s.status !== "edited"
  );
  if (empty.length === 0) return null;
  return `${empty.length} of ${total} section${total === 1 ? "" : "s"} still empty`;
}

function predicateMissingParties(draft: Draft): null | string {
  const answers = draft.answers as Record<string, unknown>;
  const hasRecipient =
    Boolean(draft.employer?.legalName) || Boolean(answers.recipientName);
  const hasSender =
    Boolean(draft.employee?.legalName) || Boolean(answers.signatoryName);
  if (hasRecipient && hasSender) return null;
  const missing = [!hasRecipient && "recipient", !hasSender && "sender"]
    .filter(Boolean)
    .join(" + ");
  return `Missing ${missing} — letter cannot be sent without both parties identified`;
}

function predicatePiiLeak(draft: Draft): null | string {
  const text = bodyText(draft);
  const hits: string[] = [];
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) hits.push(p.label);
  }
  if (hits.length === 0) return null;
  return `PII pattern${hits.length === 1 ? "" : "s"} detected: ${hits.join(", ")}`;
}

function predicateBrokenEvidenceRefs(draft: Draft): null | string {
  const text = bodyText(draft);
  const refs = [...text.matchAll(/\[See Fig\.?\s*(\d+)\]/gi)].map((m) =>
    Number(m[1])
  );
  if (refs.length === 0) return null;
  const validFigures = validFigureNumbers(draft.evidence ?? []);
  const broken = refs.filter((n) => !validFigures.has(n));
  if (broken.length === 0) return null;
  return `[See Fig ${broken.join(", ")}] — no matching attachment in evidence`;
}

/* ─── public list — Reports.tsx + drill-downs read the same array ─────── */

/**
 * Ordered list of health checks the Reports surface runs against every
 * HR draft. Order is significant: it's the order the Reports list
 * displays them in. Add new checks here; both the aggregate counters
 * and the drill-down list will pick them up automatically.
 *
 * Severity is intentionally not modelled here — the Reports surface
 * shows the failure count regardless. Severity / dimension live on the
 * richer HealthCheck shape inside `lib/finalize/healthChecks.ts` for
 * the per-draft Finalize ring.
 */
export const HEALTH_CHECKS: HealthCheck[] = [
  {
    id: "missing-disclaimer",
    label: "Missing disclaimer",
    description:
      "Letters should close with a confidentiality / without-prejudice disclaimer below a horizontal rule.",
    predicate: predicateMissingDisclaimer,
  },
  {
    id: "unapproved-7d",
    label: "Unapproved >7d",
    description:
      "Drafts that have sat without approval for more than a week tend to go stale or get sent without sign-off.",
    predicate: predicateUnapprovedSevenDays,
  },
  {
    id: "unresolved-placeholders",
    label: "Unresolved placeholders",
    description:
      "Square-bracket placeholders like [date] or [employee_name] still in the body mean the letter wasn't fully filled out.",
    predicate: predicateUnresolvedPlaceholders,
  },
  {
    id: "empty-sections",
    label: "Empty sections",
    description:
      "Required outline sections that were never drafted — usually the result of an abandoned wizard run.",
    predicate: predicateEmptySections,
  },
  {
    id: "missing-parties",
    label: "Missing recipient or sender",
    description:
      "A letter without both parties identified cannot be sent — fix in the editor or in profile settings.",
    predicate: predicateMissingParties,
  },
  {
    id: "pii-leak",
    label: "PII red flags",
    description:
      "Letters containing NI numbers, SSNs, or full DOBs should be redacted before send to limit exposure.",
    predicate: predicatePiiLeak,
  },
  {
    id: "broken-evidence-refs",
    label: "Broken evidence references",
    description:
      "`[See Fig N]` references that don't map to an attached evidence item — the reader will see a dangling number.",
    predicate: predicateBrokenEvidenceRefs,
  },
];

/** Lookup by id — used by the failing-check drill-down route. */
export function getHealthCheck(id: string): HealthCheck | undefined {
  return HEALTH_CHECKS.find((c) => c.id === id);
}

/** Apply every check to every draft and return drafts that fail `checkId`,
 * paired with the per-draft reason string. Drafts are returned in the
 * order they appear in `drafts`. */
export type FailingDraft = { draft: Draft; reason: string };

export function failingDraftsForCheck(
  drafts: Draft[],
  checkId: string
): FailingDraft[] {
  const check = getHealthCheck(checkId);
  if (!check) return [];
  const out: FailingDraft[] = [];
  for (const d of drafts) {
    try {
      const reason = check.predicate(d);
      if (reason) out.push({ draft: d, reason });
    } catch {
      // skip drafts the predicate can't process — same defensive stance as
      // runHealthChecks() in the scorer.
    }
  }
  return out;
}

/** Count failing drafts for a check — Reports.tsx aggregate uses this. */
export function failingCountForCheck(drafts: Draft[], checkId: string): number {
  return failingDraftsForCheck(drafts, checkId).length;
}
