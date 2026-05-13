import type { Draft } from "@/lib/letters/types";

/**
 * Letter health — deterministic static checks that run against a Draft to
 * produce a "Letter Health Score" on the Finalize page.
 *
 * These are pure rules, no AI. Each rule returns { passed, label, detail? }.
 * The page renders these as a checklist next to an AI evaluation band, with
 * a combined score ring driven by `computeHealthScore`.
 *
 * Design choices:
 *  - Checks are atomic — one concern per rule, easy to add/remove.
 *  - Severity is binary (pass/fail) plus a "warn" fallback for "fixable but
 *    not blocking" (e.g. word count outside expected range, unresolved
 *    [placeholder] tokens). Warnings count for 0.5 of a passed check so the
 *    score communicates "almost there" instead of failing hard.
 *  - The score is a 0-100 integer so it fits a ring + dopamine count-up.
 *  - Bands: ≥80 Strong, 60-79 Adequate, <60 Weak. The band drives colour.
 */

export type HealthSeverity = "pass" | "warn" | "fail";

/**
 * Where the "Fix it" button on a failing check should route the user.
 *
 *   editor   — open the draft editor (most issues are fixed inline there)
 *   evidence — open the Evidence step (broken evidence references)
 *   settings — open profile/Settings (signature, letterhead live there)
 *
 * The Finalize page maps this enum to a concrete URL because only the
 * page knows the current draftId.
 */
export type HealthActionRoute = "editor" | "evidence" | "settings";

/**
 * Each check belongs to one of three dimensions. The Finalize page rolls
 * checks up per-dimension and displays a sub-score ring alongside the
 * primary score, so the user sees not just "82" but where their weakest
 * dimension is.
 *
 *   compliance — legal/structural/procedural requirements
 *                ("must have right to appeal", "no broken evidence refs")
 *   quality    — register, persuasion, polish
 *                ("word count in range", "signature attached")
 *   risk       — liability, PII exposure, escalation risk
 *                ("no NI numbers", "no admissions of liability")
 *
 * AI-driven checks (tone, liability scan, cross-letter consistency) slot
 * into the same dimensions when they're added later.
 */
export type HealthDimension = "compliance" | "quality" | "risk";

export type HealthCheck = {
  id: string;
  label: string;
  severity: HealthSeverity;
  dimension: HealthDimension;
  detail?: string;
  /** Surface text for the action button on the Fix-this-first card.
   * Only set on checks that aren't passing. */
  actionLabel?: string;
  /** Where the action button should route. */
  actionRoute?: HealthActionRoute;
};

/** A single prioritised fix surfaced on the "Fix this first" card. */
export type Fix = {
  check: HealthCheck;
  /** Predicted score gain if this check flips to pass, in [0,100]. */
  impact: number;
};

export type HealthBand = "strong" | "adequate" | "weak";

export type DimensionScore = {
  dimension: HealthDimension;
  score: number; // 0-100
  band: HealthBand;
  passCount: number;
  warnCount: number;
  failCount: number;
  totalCount: number;
};

export type HealthScore = {
  /** Primary 0-100 — the hero number, rolled up from the dimensions. */
  score: number;
  band: HealthBand;
  passCount: number;
  warnCount: number;
  failCount: number;
  totalCount: number;
  oneLiner: string;
  /** Per-dimension sub-scores rendered as smaller secondary rings. */
  dimensions: DimensionScore[];
};

/**
 * Weights used when rolling dimension scores up into the overall. Compliance
 * carries the most weight because a non-compliant letter literally cannot
 * be sent — risk and quality affect *how well* it lands, not *whether* it
 * can land. Sum is 1.
 */
const DIMENSION_WEIGHTS: Record<HealthDimension, number> = {
  compliance: 0.4,
  quality: 0.3,
  risk: 0.3,
};

export const DIMENSION_LABELS: Record<HealthDimension, string> = {
  compliance: "Compliance",
  quality: "Quality",
  risk: "Risk",
};

export const DIMENSION_DESCRIPTIONS: Record<HealthDimension, string> = {
  compliance: "Legal, structural, and procedural requirements",
  quality: "Tone, persuasion, and professional finish",
  risk: "Liability exposure and data hygiene",
};

const PLACEHOLDER_RE = /\[([a-z][a-z0-9_]*)\]/gi;
const PII_PATTERNS: { id: string; re: RegExp; label: string }[] = [
  {
    id: "ni-number",
    re: /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/,
    label: "UK NI number",
  },
  {
    id: "us-ssn",
    re: /\b\d{3}-\d{2}-\d{4}\b/,
    label: "US SSN",
  },
  {
    id: "dob-long",
    re: /\b\d{1,2}\/\d{1,2}\/(19|20)\d{2}\b/,
    label: "full date of birth",
  },
];

/** Expected word count band per letter type. Kept conservative — outliers warn,
 * not fail. The user can always override. */
function expectedWordRange(letterType: string): { min: number; max: number } {
  // Settlement letters tend to be long; resignation letters short.
  if (letterType.includes("settlement") || letterType.includes("tribunal")) {
    return { min: 400, max: 1200 };
  }
  if (letterType.includes("resign")) return { min: 80, max: 300 };
  if (letterType.includes("grievance")) return { min: 200, max: 800 };
  return { min: 200, max: 700 };
}

/** Strip HTML tags so we can count words and scan for PII in plain text. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
}

/** Combine all section bodies into one plain-text blob. */
function bodyText(draft: Draft): string {
  return draft.sections.map((s) => stripHtml(s.html ?? "")).join("\n");
}

/* ===========================================================================
 * Individual check functions. Each returns one HealthCheck.
 * ========================================================================= */

function checkSections(draft: Draft): HealthCheck {
  const total = draft.sections.length;
  const ready = draft.sections.filter(
    (s) => s.status === "ready" || s.status === "edited",
  ).length;
  if (ready === total) {
    return {
      id: "sections-filled",
      dimension: "compliance",
      label: `All ${total} sections filled`,
      severity: "pass",
    };
  }
  return {
    id: "sections-filled",
    dimension: "compliance",
    label: `${ready} of ${total} sections filled`,
    severity: ready === 0 ? "fail" : "warn",
    detail: `${total - ready} section${total - ready === 1 ? "" : "s"} still empty`,
    actionLabel: "Open editor",
    actionRoute: "editor",
  };
}

function checkRecipientAndSender(draft: Draft): HealthCheck {
  const hasRecipient =
    Boolean(draft.employer?.legalName) ||
    Boolean((draft.answers as Record<string, unknown>).recipientName);
  const hasSender =
    Boolean(draft.employee?.legalName) ||
    Boolean((draft.answers as Record<string, unknown>).signatoryName);
  if (hasRecipient && hasSender) {
    return {
      id: "parties",
      dimension: "compliance",
      label: "Recipient and sender both present",
      severity: "pass",
    };
  }
  const missing = [!hasRecipient && "recipient", !hasSender && "sender"]
    .filter(Boolean)
    .join(" + ");
  return {
    id: "parties",
    dimension: "compliance",
    label: `Missing ${missing}`,
    severity: "fail",
    detail: "Letter cannot be sent without both parties identified",
    actionLabel: "Add details",
    actionRoute: "settings",
  };
}

function checkPlaceholders(draft: Draft): HealthCheck {
  const text = bodyText(draft);
  const found = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    found.add(m[1]);
  }
  if (found.size === 0) {
    return {
      id: "placeholders",
      dimension: "compliance",
      label: "No unresolved placeholders",
      severity: "pass",
    };
  }
  const list = [...found].slice(0, 3).join(", ");
  const more = found.size > 3 ? ` (+${found.size - 3} more)` : "";
  return {
    id: "placeholders",
    dimension: "compliance",
    label: `${found.size} placeholder${found.size === 1 ? "" : "s"} unresolved`,
    severity: "warn",
    detail: `Still in body: ${list}${more}`,
    actionLabel: "Open editor",
    actionRoute: "editor",
  };
}

function checkPII(draft: Draft): HealthCheck {
  const text = bodyText(draft);
  const hits: string[] = [];
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) hits.push(p.label);
  }
  if (hits.length === 0) {
    return {
      id: "pii",
      dimension: "risk",
      label: "No PII red flags in body",
      severity: "pass",
    };
  }
  return {
    id: "pii",
    dimension: "risk",
    label: `${hits.length} PII pattern${hits.length === 1 ? "" : "s"} detected`,
    severity: "fail",
    detail: `Found: ${hits.join(", ")}. Consider redacting before send.`,
    actionLabel: "Review in editor",
    actionRoute: "editor",
  };
}

function checkWordCount(draft: Draft): HealthCheck {
  const text = bodyText(draft).trim();
  const words = text ? text.split(/\s+/).length : 0;
  const range = expectedWordRange(draft.letterType);
  if (words >= range.min && words <= range.max) {
    return {
      id: "wordcount",
      dimension: "quality",
      label: `Word count in range (${words} / ${range.min}–${range.max})`,
      severity: "pass",
    };
  }
  return {
    id: "wordcount",
    dimension: "quality",
    label: `Word count ${words < range.min ? "below" : "above"} range (${words} / ${range.min}–${range.max})`,
    severity: "warn",
    detail:
      words < range.min
        ? "Letter may be too short to be persuasive"
        : "Letter is long — consider trimming repetition",
    actionLabel: words < range.min ? "Expand in editor" : "Trim in editor",
    actionRoute: "editor",
  };
}

function checkSignature(draft: Draft): HealthCheck {
  const answers = draft.answers as Record<string, unknown>;
  const hasSignature =
    Boolean(answers.signatureDataUrl) || Boolean(answers.signatoryName);
  if (hasSignature) {
    return {
      id: "signature",
      dimension: "quality",
      label: "Signature attached",
      severity: "pass",
    };
  }
  return {
    id: "signature",
    dimension: "quality",
    label: "No signature attached",
    severity: "warn",
    detail: "Sign in Settings to attach automatically to all letters",
    actionLabel: "Add in Settings",
    actionRoute: "settings",
  };
}

function checkEvidenceRefs(draft: Draft): HealthCheck {
  const text = bodyText(draft);
  const refs = [...text.matchAll(/\[See Fig\.?\s*(\d+)\]/gi)].map((m) =>
    Number(m[1]),
  );
  if (refs.length === 0) {
    return {
      id: "evidence",
      dimension: "compliance",
      label: "No evidence references to validate",
      severity: "pass",
    };
  }
  const evidenceCount = draft.evidence?.length ?? 0;
  const broken = refs.filter((n) => n > evidenceCount || n < 1);
  if (broken.length === 0) {
    return {
      id: "evidence",
      dimension: "compliance",
      label: `${refs.length} evidence reference${refs.length === 1 ? "" : "s"} resolve`,
      severity: "pass",
    };
  }
  return {
    id: "evidence",
    dimension: "compliance",
    label: `${broken.length} broken evidence reference${broken.length === 1 ? "" : "s"}`,
    severity: "fail",
    detail: `[See Fig ${broken.join(", ")}] — no matching attachment`,
    actionLabel: "Edit evidence",
    actionRoute: "evidence",
  };
}

function checkLetterhead(draft: Draft): HealthCheck {
  const answers = draft.answers as Record<string, unknown>;
  // Letterhead is employer-mode only; employee letters don't need one.
  if (draft.mode === "employee") {
    return {
      id: "letterhead",
      dimension: "quality",
      label: "Letterhead not required (employee letter)",
      severity: "pass",
    };
  }
  if (answers.hasLetterhead || answers.letterheadDataUrl) {
    return {
      id: "letterhead",
      dimension: "quality",
      label: "Letterhead applied",
      severity: "pass",
    };
  }
  return {
    id: "letterhead",
    dimension: "quality",
    label: "No company letterhead",
    severity: "warn",
    detail: "Add a letterhead in Settings for a professional finish",
    actionLabel: "Add in Settings",
    actionRoute: "settings",
  };
}

function checkUnresolvedComments(draft: Draft): HealthCheck {
  const unresolved = (draft.comments ?? []).filter((c) => !c.resolved).length;
  if (unresolved === 0) {
    return {
      id: "comments",
      dimension: "quality",
      label: "No unresolved comments",
      severity: "pass",
    };
  }
  return {
    id: "comments",
    dimension: "quality",
    label: `${unresolved} unresolved comment${unresolved === 1 ? "" : "s"}`,
    severity: "warn",
    detail: "Review and resolve before sending",
    actionLabel: "Resolve in editor",
    actionRoute: "editor",
  };
}

/* ===========================================================================
 * Public API
 * ========================================================================= */

/**
 * Run every check against a draft and return the full list.
 */
export function runHealthChecks(draft: Draft): HealthCheck[] {
  return [
    checkSections(draft),
    checkRecipientAndSender(draft),
    checkPlaceholders(draft),
    checkPII(draft),
    checkWordCount(draft),
    checkEvidenceRefs(draft),
    checkSignature(draft),
    checkLetterhead(draft),
    checkUnresolvedComments(draft),
  ];
}

/**
 * Score a single subset of checks (one dimension's worth). Shared shape with
 * the overall scorer so the rings can render identically.
 *
 * Scoring: each pass = 1.0, each warn = 0.5, each fail = 0.0. Divide by total
 * and multiply by 100. Cap at 60 if there are any fails — a compliance
 * blocker should never read as "Strong".
 *
 * If a dimension has zero checks (theoretical edge case until we add AI
 * checks) we return a neutral 100 so it doesn't punish the overall score.
 */
function scoreSubset(
  dimension: HealthDimension,
  checks: HealthCheck[],
): DimensionScore {
  const subset = checks.filter((c) => c.dimension === dimension);
  if (subset.length === 0) {
    return {
      dimension,
      score: 100,
      band: "strong",
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      totalCount: 0,
    };
  }
  const passCount = subset.filter((c) => c.severity === "pass").length;
  const warnCount = subset.filter((c) => c.severity === "warn").length;
  const failCount = subset.filter((c) => c.severity === "fail").length;
  const totalCount = subset.length;

  const raw = (passCount + warnCount * 0.5) / totalCount;
  let score = Math.round(raw * 100);
  if (failCount > 0) score = Math.min(score, 60);

  const band: HealthBand =
    score >= 80 ? "strong" : score >= 60 ? "adequate" : "weak";

  return { dimension, score, band, passCount, warnCount, failCount, totalCount };
}

/**
 * Reduce a list of checks to a 0-100 overall score plus three per-dimension
 * sub-scores. The overall is a weighted average of the dimensions (see
 * DIMENSION_WEIGHTS) — compliance carries more weight because a non-compliant
 * letter literally cannot be sent.
 *
 * The Finalize page renders the overall as the hero ring and the three
 * dimension scores as smaller secondary rings beneath the verdict.
 */
export function computeHealthScore(checks: HealthCheck[]): HealthScore {
  const dimensions: DimensionScore[] = (
    ["compliance", "quality", "risk"] as const
  ).map((d) => scoreSubset(d, checks));

  const weighted = dimensions.reduce(
    (acc, d) => acc + d.score * DIMENSION_WEIGHTS[d.dimension],
    0,
  );
  const score = Math.round(weighted);

  // Counts across all dimensions for the one-line verdict + the action bar's
  // "Mark as sent" disable rule. The page also uses these directly so the
  // summary line under the ring matches the checklist.
  const passCount = checks.filter((c) => c.severity === "pass").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  const failCount = checks.filter((c) => c.severity === "fail").length;
  const totalCount = checks.length;

  const band: HealthBand =
    score >= 80 && failCount === 0
      ? "strong"
      : score >= 60
        ? "adequate"
        : "weak";

  const oneLiner = oneLinerFor(band, passCount, warnCount, failCount, totalCount);

  return {
    score,
    band,
    passCount,
    warnCount,
    failCount,
    totalCount,
    oneLiner,
    dimensions,
  };
}

/**
 * Compute the top `limit` actionable fixes for this draft, sorted by the
 * score gain that would result from flipping each check to "pass".
 *
 * "Impact" is the delta on the overall (weighted) score, computed by
 * cloning the checks list, forcing the target check to "pass", and re-
 * scoring. That keeps the impact number honest — fixing a compliance
 * fail moves the overall a lot (compliance is heavily weighted); a
 * quality warn moves it less.
 *
 * Passing checks are excluded so the card never shows "everything is
 * fine" rows. If a draft has fewer than `limit` issues, the function
 * returns however many it has (often 0 — at which point the consumer
 * should hide the card entirely).
 */
export function topFixes(checks: HealthCheck[], limit = 3): Fix[] {
  const issues = checks.filter((c) => c.severity !== "pass");
  if (issues.length === 0) return [];

  const baseline = computeHealthScore(checks).score;

  const ranked = issues.map<Fix>((c) => {
    const simulated = checks.map((other) =>
      other.id === c.id ? { ...other, severity: "pass" as const } : other,
    );
    const next = computeHealthScore(simulated).score;
    const impact = Math.max(0, next - baseline);
    return { check: c, impact };
  });

  // Sort by impact desc, then by severity (fails before warns) so that
  // two checks with identical impact still order intuitively.
  const sevRank: Record<HealthSeverity, number> = { fail: 0, warn: 1, pass: 2 };
  ranked.sort((a, b) => {
    if (b.impact !== a.impact) return b.impact - a.impact;
    return sevRank[a.check.severity] - sevRank[b.check.severity];
  });

  return ranked.slice(0, limit);
}

function oneLinerFor(
  band: HealthBand,
  pass: number,
  warn: number,
  fail: number,
  total: number,
): string {
  if (fail > 0) {
    return `${fail} compliance issue${fail === 1 ? "" : "s"} must be resolved before sending.`;
  }
  if (band === "strong" && warn === 0) {
    return "Send-ready. Every check passed.";
  }
  if (band === "strong") {
    return `Send-ready with ${warn} minor polish suggestion${warn === 1 ? "" : "s"}.`;
  }
  if (band === "adequate") {
    return `${pass} of ${total} checks pass — review the warnings before sending.`;
  }
  return "Letter needs more work before it should be sent.";
}
