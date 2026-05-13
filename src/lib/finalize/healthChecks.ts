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

export type HealthCheck = {
  id: string;
  label: string;
  severity: HealthSeverity;
  detail?: string;
};

export type HealthBand = "strong" | "adequate" | "weak";

export type HealthScore = {
  score: number; // 0-100
  band: HealthBand;
  passCount: number;
  warnCount: number;
  failCount: number;
  totalCount: number;
  oneLiner: string;
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
      label: `All ${total} sections filled`,
      severity: "pass",
    };
  }
  return {
    id: "sections-filled",
    label: `${ready} of ${total} sections filled`,
    severity: ready === 0 ? "fail" : "warn",
    detail: `${total - ready} section${total - ready === 1 ? "" : "s"} still empty`,
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
      label: "Recipient and sender both present",
      severity: "pass",
    };
  }
  const missing = [!hasRecipient && "recipient", !hasSender && "sender"]
    .filter(Boolean)
    .join(" + ");
  return {
    id: "parties",
    label: `Missing ${missing}`,
    severity: "fail",
    detail: "Letter cannot be sent without both parties identified",
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
      label: "No unresolved placeholders",
      severity: "pass",
    };
  }
  const list = [...found].slice(0, 3).join(", ");
  const more = found.size > 3 ? ` (+${found.size - 3} more)` : "";
  return {
    id: "placeholders",
    label: `${found.size} placeholder${found.size === 1 ? "" : "s"} unresolved`,
    severity: "warn",
    detail: `Still in body: ${list}${more}`,
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
      label: "No PII red flags in body",
      severity: "pass",
    };
  }
  return {
    id: "pii",
    label: `${hits.length} PII pattern${hits.length === 1 ? "" : "s"} detected`,
    severity: "fail",
    detail: `Found: ${hits.join(", ")}. Consider redacting before send.`,
  };
}

function checkWordCount(draft: Draft): HealthCheck {
  const text = bodyText(draft).trim();
  const words = text ? text.split(/\s+/).length : 0;
  const range = expectedWordRange(draft.letterType);
  if (words >= range.min && words <= range.max) {
    return {
      id: "wordcount",
      label: `Word count in range (${words} / ${range.min}–${range.max})`,
      severity: "pass",
    };
  }
  return {
    id: "wordcount",
    label: `Word count ${words < range.min ? "below" : "above"} range (${words} / ${range.min}–${range.max})`,
    severity: "warn",
    detail:
      words < range.min
        ? "Letter may be too short to be persuasive"
        : "Letter is long — consider trimming repetition",
  };
}

function checkSignature(draft: Draft): HealthCheck {
  const answers = draft.answers as Record<string, unknown>;
  const hasSignature =
    Boolean(answers.signatureDataUrl) || Boolean(answers.signatoryName);
  if (hasSignature) {
    return {
      id: "signature",
      label: "Signature attached",
      severity: "pass",
    };
  }
  return {
    id: "signature",
    label: "No signature attached",
    severity: "warn",
    detail: "Sign in Settings to attach automatically to all letters",
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
      label: "No evidence references to validate",
      severity: "pass",
    };
  }
  const evidenceCount = draft.evidence?.length ?? 0;
  const broken = refs.filter((n) => n > evidenceCount || n < 1);
  if (broken.length === 0) {
    return {
      id: "evidence",
      label: `${refs.length} evidence reference${refs.length === 1 ? "" : "s"} resolve`,
      severity: "pass",
    };
  }
  return {
    id: "evidence",
    label: `${broken.length} broken evidence reference${broken.length === 1 ? "" : "s"}`,
    severity: "fail",
    detail: `[See Fig ${broken.join(", ")}] — no matching attachment`,
  };
}

function checkLetterhead(draft: Draft): HealthCheck {
  const answers = draft.answers as Record<string, unknown>;
  // Letterhead is employer-mode only; employee letters don't need one.
  if (draft.mode === "employee") {
    return {
      id: "letterhead",
      label: "Letterhead not required (employee letter)",
      severity: "pass",
    };
  }
  if (answers.hasLetterhead || answers.letterheadDataUrl) {
    return {
      id: "letterhead",
      label: "Letterhead applied",
      severity: "pass",
    };
  }
  return {
    id: "letterhead",
    label: "No company letterhead",
    severity: "warn",
    detail: "Add a letterhead in Settings for a professional finish",
  };
}

function checkUnresolvedComments(draft: Draft): HealthCheck {
  const unresolved = (draft.comments ?? []).filter((c) => !c.resolved).length;
  if (unresolved === 0) {
    return {
      id: "comments",
      label: "No unresolved comments",
      severity: "pass",
    };
  }
  return {
    id: "comments",
    label: `${unresolved} unresolved comment${unresolved === 1 ? "" : "s"}`,
    severity: "warn",
    detail: "Review and resolve before sending",
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
 * Reduce a list of checks to a 0-100 score, band, and one-line verdict.
 *
 * Scoring: each pass = 1.0, each warn = 0.5, each fail = 0.0. Divide by total
 * and multiply by 100. We cap at 95 if there are any fails — even one
 * compliance failure shouldn't read as "Strong".
 */
export function computeHealthScore(checks: HealthCheck[]): HealthScore {
  const passCount = checks.filter((c) => c.severity === "pass").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  const failCount = checks.filter((c) => c.severity === "fail").length;
  const totalCount = checks.length;

  const raw = (passCount + warnCount * 0.5) / Math.max(totalCount, 1);
  let score = Math.round(raw * 100);
  if (failCount > 0) score = Math.min(score, 60);

  const band: HealthBand =
    score >= 80 ? "strong" : score >= 60 ? "adequate" : "weak";

  const oneLiner = oneLinerFor(band, passCount, warnCount, failCount, totalCount);

  return {
    score,
    band,
    passCount,
    warnCount,
    failCount,
    totalCount,
    oneLiner,
  };
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
