/**
 * Mail-merge helpers for bulk letter generation.
 *
 * The flow (orchestrated by BulkOperations.tsx):
 *
 *   1. Build a single "merge template" wizard-answers payload from CSV
 *      row 1, plus an instruction (built here) telling the model to emit
 *      {{placeholders}} for any field that varies per recipient.
 *   2. Call /api/draft ONCE with that payload — streaming the same
 *      section-by-section prompts the single-letter flow uses. The result
 *      is a "template draft" whose section HTML contains {{placeholders}}.
 *   3. For each CSV row (including row 1), client-side substitute the
 *      placeholders against that row's data, then write the resulting
 *      HTML directly into a freshly created draft via the existing
 *      store.updateSection action.
 *
 * Everything in this module is pure (no AI, no store, no DOM) except
 * `generateMergeTemplate` which wraps the existing `streamDraft` client.
 * All substitution work is intentionally pure so it's trivially testable.
 *
 * See: src/lib/bulk/mailmerge.test.ts for the contract.
 */

import { streamDraft } from "@/lib/llm/client";
import {
  buildSystemPrompt,
} from "@/lib/prompts/system";
import { buildSectionPrompt } from "@/lib/prompts/sections";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { getLetterMeta } from "@/lib/letters/catalog";
import { loadTemplate } from "@/lib/letters/templates";
import { letterStepsFor } from "@/lib/letters/questions";
import type {
  Draft,
  Jurisdiction,
  LetterAnswers,
  LetterTypeId,
  Mode,
  Section,
  SectionId,
} from "@/lib/letters/types";
import { todayDateOnly } from "@/lib/date-only";
import { foldKey } from "./keys";
import { useProfileStore } from "@/lib/profile";

export type MergeRow = Record<string, string | number | undefined>;

/* ============================================================================
 * Substitution — pure functions
 * ==========================================================================*/

/**
 * Match {{placeholder}} / {{ placeholder }} / {{placeholder_name}} —
 * placeholder identifiers may contain letters, digits, underscores, dots
 * and hyphens. The capture group strips surrounding whitespace.
 */
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

/**
 * HTML-escape a substituted value so a CSV cell containing literal HTML
 * (or a stray <, >, & character) can't break out of the surrounding
 * markup. We escape the same five characters DOMPurify would treat as
 * structural, plus quotes for the attribute-context case.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a normalised lookup over a merge row: keys lowercased, dots and
 * hyphens folded to underscores. Lets the model write {{employee-name}}
 * and still match the CSV column `employee_name`.
 */
function normaliseRow(row: MergeRow): Map<string, string> {
  const out = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(row)) {
    if (rawValue === undefined || rawValue === null) continue;
    const key = foldKey(rawKey);
    const value = typeof rawValue === "number" ? String(rawValue) : rawValue;
    if (value === "") continue;
    out.set(key, value);
  }
  return out;
}

/**
 * Replace {{placeholder}} tokens in an HTML string with values from the
 * row. Case-insensitive, whitespace-tolerant. HTML-escapes substituted
 * values. Missing values fall back to a visible "[name not set]" marker
 * so the user can spot incomplete rows after generation.
 */
export function substituteHtml(html: string, row: MergeRow): string {
  if (!html) return html;
  const lookup = normaliseRow(row);
  return html.replace(PLACEHOLDER_RE, (_match, rawName: string) => {
    // foldKey handles camelCase too, so a stray {{reviewMeetingDate}} the model
    // emitted still resolves against a review_meeting_date column (bug #18).
    const value = lookup.get(foldKey(rawName));
    if (value === undefined) {
      return `[${rawName} not set]`;
    }
    return escapeHtml(value);
  });
}

/**
 * Substitute across an array of draft sections. Returns a new array —
 * never mutates input. Sections without an html field pass through.
 */
export function substituteSections<T extends { html?: string }>(
  sections: T[],
  row: MergeRow
): T[] {
  return sections.map((section) => {
    if (typeof section.html !== "string" || section.html.length === 0) {
      return { ...section };
    }
    return { ...section, html: substituteHtml(section.html, row) };
  });
}

/**
 * Heuristic: any {{placeholder}} left in the HTML is unresolved. Used
 * by the results card to flag incomplete rows with an amber dot.
 */
export function findUnresolvedPlaceholders(html: string): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    out.add(match[1]);
  }
  return Array.from(out);
}

/* ============================================================================
 * Placeholder key derivation + prompt augmentation
 * ==========================================================================*/

/**
 * From a template letterType, derive the placeholder keys we'd expect
 * the AI to use. Driven by the wizard schema's scalar fields plus any
 * CSV header columns the user supplied. The intersection is what the
 * model can safely reference.
 *
 * Keys are returned in CSV-header order first (so the model is biased
 * towards the columns the user actually filled), then wizard-only keys.
 * Duplicates are deduplicated by lowercase comparison.
 */
export function placeholderKeysFor(
  letterType: string,
  csvHeaders: string[]
): string[] {
  const steps = letterStepsFor(letterType as LetterTypeId);
  const wizardScalars: string[] = [];
  for (const step of steps) {
    for (const q of step.questions) {
      if (
        q.type === "text" ||
        q.type === "textarea" ||
        q.type === "number" ||
        q.type === "date" ||
        q.type === "currency"
      ) {
        // Emit snake_case so the advertised token matches the snake_case
        // substitution layer (bug #18). A camelCase wizard id like
        // reviewMeetingDate becomes review_meeting_date — the form the CSV
        // column and the model's {{placeholder}} both resolve through.
        wizardScalars.push(foldKey(q.id));
      }
    }
  }

  // Universal CSV aliases produced by rowToAnswers — these always exist
  // as placeholders even when the wizard doesn't enumerate them.
  const aliases = [
    "employee_name",
    "employee_job_title",
    "employee_email",
    "employee_start_date",
  ];

  const merged = [...csvHeaders, ...aliases, ...wizardScalars];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of merged) {
    const trimmed = key.trim();
    // Dedup by the FOLDED key so a snake_case CSV header and its camelCase
    // wizard-id twin collapse to one advertised placeholder (bug #18).
    const norm = foldKey(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(trimmed);
  }
  return out;
}

/**
 * Compose the system-prompt augmentation string. Appended (server-side)
 * to the master system prompt for the ONE template-generation call —
 * NOT for downstream single-letter draft generation.
 *
 * The hint explicitly overrides the master prompt's "NEVER leave
 * {{placeholder}}" rule for this single call.
 */
export function buildMergeInstruction(placeholderKeys: string[]): string {
  if (placeholderKeys.length === 0) {
    return [
      "MAIL-MERGE TEMPLATE MODE.",
      "You are drafting a REUSABLE TEMPLATE for many recipients, not a single personalised letter.",
      "For any field that varies per recipient (names, dates, role titles, addresses, outcomes), emit a {{placeholder}} token instead of a concrete value. Use snake_case identifiers.",
      "OVERRIDE: The master prompt's 'never emit {{placeholder}}' rule does NOT apply to this single template generation. Placeholders are REQUIRED.",
      "Do NOT use [TBD] for variable per-recipient fields — use {{placeholders}} so a downstream substitution step can fill them in.",
      "Keep the gold-standard structure, register, and legal citations exactly as they would appear in a single letter.",
    ].join("\n");
  }
  const list = placeholderKeys.map((k) => `{{${k}}}`).join(", ");
  return [
    "MAIL-MERGE TEMPLATE MODE.",
    "You are drafting a REUSABLE TEMPLATE for many recipients, not a single personalised letter.",
    `For any field that varies per recipient, emit one of these {{placeholder}} tokens instead of a concrete value: ${list}.`,
    "If a per-recipient field falls outside that list, invent a new snake_case {{placeholder}} for it rather than hard-coding a value or writing [TBD].",
    "OVERRIDE: The master prompt's 'never emit {{placeholder}}' rule does NOT apply to this single template generation. Placeholders are REQUIRED here.",
    "Do NOT echo the placeholder tokens twice and do NOT wrap them in <code>. Just write them inline in the prose, e.g. <p>Dear {{employee_name}},</p>.",
    "Keep the gold-standard structure, register, and legal citations exactly as they would appear in a single letter.",
  ].join("\n");
}

/* ============================================================================
 * Template-draft orchestration — ONE AI call producing N drafts of HTML
 * ==========================================================================*/

export type TemplateSection = {
  /** Stable wizard section id (e.g. "body", "salutation"). */
  sectionId: SectionId;
  /** Display title from the catalog. */
  title: string;
  required: boolean;
  /** Section HTML containing {{placeholder}} tokens. */
  html: string;
};

export type TemplateDraft = {
  letterType: LetterTypeId;
  mode: Mode;
  jurisdiction: Jurisdiction;
  /** The wizard-shaped answers we used as the "seed" recipient. */
  seedAnswers: LetterAnswers;
  /** Section HTML keyed by sectionId, each carrying {{placeholders}}. */
  sections: TemplateSection[];
};

export type TemplateProgress =
  | { phase: "drafting"; sectionId: SectionId; sectionTitle: string; sectionIndex: number; sectionCount: number }
  | { phase: "retry"; retryCount: number; delayMs: number; reason: string };

export type GenerateTemplateOptions = {
  letterType: LetterTypeId;
  mode: Mode;
  /** The wizard-shaped answers derived from CSV row 1 (rowToAnswers output). */
  seedAnswers: LetterAnswers;
  /** CSV header columns — drives the {{placeholder}} key list. */
  csvHeaders: string[];
  signal?: AbortSignal;
  onProgress?: (p: TemplateProgress) => void;
};

/**
 * Build the seed Draft shape required by buildSystemPrompt /
 * buildSectionPrompt. This is the same shape the store's createDraft
 * action constructs, but we don't persist it — we just need the prompt
 * builders to see a complete object. The seed embeds row-1 data so the
 * model has concrete examples of *what* the placeholders represent, but
 * the merge instruction tells it to emit {{placeholders}} anyway.
 */
function buildSeedDraft(
  letterType: LetterTypeId,
  mode: Mode,
  answers: LetterAnswers
): Draft {
  const meta = getLetterMeta(letterType);
  const a = answers as Record<string, string | boolean | number | string[] | undefined>;
  const jurisdiction = ((a.jurisdiction as Jurisdiction) ?? "UK") as Jurisdiction;

  const sections: Section[] = meta.defaultSections.map((s) => ({
    id: `merge_${s.id}`,
    sectionId: s.id,
    title: s.title,
    html: "",
    required: s.required,
    status: "empty",
    versions: [],
  }));

  return {
    id: "merge_template",
    mode,
    letterType,
    context: {
      mode,
      jurisdiction,
      ukRegion: a.ukRegion as Draft["context"]["ukRegion"],
      usState: a.usState as Draft["context"]["usState"],
      workerClass: (a.workerClass as Draft["context"]["workerClass"]) ?? "employee",
      letterType,
      effectiveDate: (a.effectiveDate as string) ?? "",
      issueDate: todayDateOnly(),
      deliveryMethod:
        (a.deliveryMethod as Draft["context"]["deliveryMethod"]) ?? "email",
      tone: (a.tone as Draft["context"]["tone"]) ?? "formal",
      confidentiality:
        (a.confidentiality as Draft["context"]["confidentiality"]) ?? "public",
      counselReviewRequired: meta.legalReviewRequired,
      riskFlags: {
        protectedStatus: Boolean(a.protectedStatus),
        grievanceLast90Days: Boolean(a.grievanceLast90Days),
        collectiveConsultation: Boolean(a.collectiveConsultation),
      },
    },
    employer: {
      legalName: (a.employerLegalName as string) ?? "",
      address: (a.employerAddress as string) ?? "",
      hasLetterhead: false,
      signatoryName: (a.signatoryName as string) ?? "",
      signatoryTitle: (a.signatoryTitle as string) ?? "",
    },
    employee: {
      legalName: (a.employeeLegalName as string) ?? "",
      jobTitle: (a.employeeJobTitle as string) ?? "",
      department: a.employeeDepartment as string | undefined,
      address: (a.employeeAddress as string) ?? "",
      email: a.employeeEmail as string | undefined,
      startDate: (a.employeeStartDate as string) ?? "",
      serviceMonths: 0,
    },
    answers,
    sections,
    timeline: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Light-weight HTML cleaner for template output. We deliberately do NOT
 * use the draft.ts `sanitiseHtml` helper because that one rewrites
 * {{placeholders}} to [TBD] — which would defeat the entire mail-merge.
 */
function stripCodeFences(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  // If the model returned plain prose without HTML tags, wrap paragraphs.
  if (!/^\s*<(p|h\d|table|div|ul|ol|blockquote)/i.test(out)) {
    out = out
      .split(/\n\s*\n/)
      .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }
  return out;
}

function activeModel(): string | undefined {
  return useProfileStore.getState().profile.defaults.qwenModel;
}

/**
 * Stream the template-letter generation. ONE AI call per section, all
 * sharing the same system prompt + merge instruction. Returns a
 * TemplateDraft with {{placeholders}} preserved in the section HTML.
 *
 * Throws on abort or a non-retryable client error. Streams retry events
 * via onProgress.
 */
export async function generateMergeTemplate(
  options: GenerateTemplateOptions
): Promise<TemplateDraft> {
  const seed = buildSeedDraft(options.letterType, options.mode, options.seedAnswers);
  await loadTemplate(seed.letterType, seed.context.jurisdiction).catch(() => undefined);
  const system = buildSystemPrompt(seed);
  const keys = placeholderKeysFor(options.letterType, options.csvHeaders);
  const mergeHint = buildMergeInstruction(keys);
  const model = activeModel();

  const priorTitles: string[] = [];
  const outSections: TemplateSection[] = [];

  for (let idx = 0; idx < seed.sections.length; idx++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const section = seed.sections[idx];

    options.onProgress?.({
      phase: "drafting",
      sectionId: section.sectionId,
      sectionTitle: section.title,
      sectionIndex: idx,
      sectionCount: seed.sections.length,
    });

    const userPrompt = buildSectionPrompt(seed, section, priorTitles);
    let acc = "";

    await streamDraft({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 1100,
      model,
      // Goes server-side to /api/draft, which prepends it as an extra
      // system message ahead of `system` above. Anthropic treats stacked
      // system messages as joined top-level guidance.
      extraSystemHint: mergeHint,
      signal: options.signal,
      onToken: (delta) => {
        acc += delta;
      },
      onRetry: (retryCount, delayMs, reason) => {
        // Retry re-streams the whole section — drop the truncated attempt so
        // the template section isn't first-attempt + second-attempt garbage.
        acc = "";
        options.onProgress?.({ phase: "retry", retryCount, delayMs, reason });
      },
    });

    // Run through DOMPurify (sanitizeLetterHtml) — keeps placeholders
    // intact because `{{` `}}` are plain text, not HTML constructs.
    const cleaned = sanitizeLetterHtml(stripCodeFences(acc));
    outSections.push({
      sectionId: section.sectionId,
      title: section.title,
      required: section.required,
      html: cleaned,
    });
    priorTitles.push(section.title);
  }

  return {
    letterType: options.letterType,
    mode: options.mode,
    jurisdiction: seed.context.jurisdiction,
    seedAnswers: options.seedAnswers,
    sections: outSections,
  };
}

/* ============================================================================
 * Post-substitution helpers
 * ==========================================================================*/

/**
 * Substitute a template draft against a single recipient row. The
 * returned sections still carry their wizard sectionId + title — the
 * caller is expected to match them up against the real Section.id of a
 * freshly created draft (one per section, by sectionId) and write each
 * one back via `store.updateSection(draftId, sectionId, html)`.
 */
export function personaliseTemplate(
  template: TemplateDraft,
  row: MergeRow
): TemplateSection[] {
  return template.sections.map((s) => ({
    ...s,
    html: substituteHtml(s.html, row),
  }));
}
