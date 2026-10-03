import { buildExpectedEvidenceStatus, evidenceReferenceStatus } from "@/lib/evidence";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import type { Draft, Matter } from "@/lib/letters/types";
import { isSafeImageRef } from "@/lib/safe-data-url";
import { getLetterMeta } from "@/lib/letters/catalog";
import { countDraftWords } from "@/lib/letters/wordCount";

export type DraftLifecycleStatus =
  | "drafting"
  | "needs_review"
  | "blocked"
  | "ready_to_send"
  | "sent";

export type ReadinessAction = "editor" | "evidence" | "review" | "settings";

export type ReadinessIssue = {
  id: string;
  label: string;
  detail?: string;
  action: ReadinessAction;
  sectionIds?: string[];
};

export type CounselAttestation = {
  reviewedBy: string;
  reviewedOn: string;
};

export type DraftReadiness = {
  status: DraftLifecycleStatus;
  statusLabel: string;
  editingComplete: boolean;
  reviewComplete: boolean;
  canFinalise: boolean;
  canExport: boolean;
  canMarkSent: boolean;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  passed: string[];
  sections: {
    total: number;
    written: number;
    reviewed: number;
    ready: number;
    requiredEmpty: number;
  };
  placeholders: {
    count: number;
    sectionIds: string[];
  };
  evidence: {
    attached: number;
    expected: number;
    satisfied: number;
    requiredMissing: number;
    optionalMissing: number;
    brokenReferences: number;
  };
  counsel: {
    required: boolean;
    attested: boolean;
    attestation?: CounselAttestation;
  };
  recipientComplete: boolean;
  senderComplete: boolean;
  letterheadAttached: boolean;
  usesExternalLetterhead: boolean;
};

export type DraftReadinessOptions = {
  matter?: Matter;
  counselAttestation?: CounselAttestation | null;
};

// Count occurrences, not unique token names. Exclude the app's legitimate
// evidence cross-reference syntax while catching [TBD], {{templateToken}},
// and human-readable scaffold tokens such as [date] or [Employee name].
const PLACEHOLDER_RE =
  /\[TBD(?:\s*:[^\]]*)?\]|\{\{[^{}]+\}\}|\[(?!See\s+Fig\.?\s*\d+\])(?:[a-z][a-z0-9_ -]{1,60})\]/gi;

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ");
}

export function countUnresolvedPlaceholders(html: string): number {
  return [...plainText(html).matchAll(PLACEHOLDER_RE)].length;
}

export function counselAttestationForDraft(draft: Draft): CounselAttestation | undefined {
  // Export records are immutable history, not the current review decision.
  // Reading them here resurrected cleared reviews and overrode newer reviewers.
  // Legacy export attestations remain available in the audit timeline.
  const manual = (draft.answers as Record<string, unknown>)._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  if (manual?.reviewedBy?.trim() && manual.reviewedOn?.trim()) {
    return { reviewedBy: manual.reviewedBy.trim(), reviewedOn: manual.reviewedOn.trim() };
  }
  return undefined;
}

export function getDraftReadiness(
  draft: Draft,
  options: DraftReadinessOptions = {},
): DraftReadiness {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const passed: string[] = [];

  const total = draft.sections.length;
  const streamingSections = draft.sections.filter((section) => section.status === "streaming");
  if (streamingSections.length > 0) {
    blockers.push({
      id: "generation-active",
      label: "Letter generation is still in progress",
      detail: "Wait for generation to finish or stop it and review the saved text.",
      action: "editor",
      sectionIds: streamingSections.map((section) => section.id),
    });
  }
  if (total === 0) {
    blockers.push({
      id: "no-sections",
      label: "The letter has no sections",
      detail: "Add letter content before finalising.",
      action: "editor",
    });
  }
  const writtenSections = draft.sections.filter((section) =>
    plainText(section.html ?? "").trim().length > 0,
  );
  const requiredEmptySections = draft.sections.filter(
    (section) => section.required && plainText(section.html ?? "").trim().length === 0,
  );
  const placeholderSections = draft.sections
    .map((section) => ({ id: section.id, count: countUnresolvedPlaceholders(section.html ?? "") }))
    .filter((section) => section.count > 0);
  const placeholderCount = placeholderSections.reduce((sum, section) => sum + section.count, 0);

  if (requiredEmptySections.length > 0) {
    blockers.push({
      id: "required-sections",
      label: `${requiredEmptySections.length} required section${requiredEmptySections.length === 1 ? " is" : "s are"} empty`,
      detail: "Complete every required section before finalising.",
      action: "editor",
      sectionIds: requiredEmptySections.map((section) => section.id),
    });
  } else {
    passed.push("All required sections are written");
  }

  if (placeholderCount > 0) {
    blockers.push({
      id: "placeholders",
      label: `${placeholderCount} unresolved placeholder${placeholderCount === 1 ? "" : "s"}`,
      detail: `Found across ${placeholderSections.length} section${placeholderSections.length === 1 ? "" : "s"}.`,
      action: "editor",
      sectionIds: placeholderSections.map((section) => section.id),
    });
  } else {
    passed.push("No unresolved placeholders");
  }

  const expectedEvidence = buildExpectedEvidenceStatus(draft);
  const references = evidenceReferenceStatus(draft);
  if (references.broken.length > 0) {
    blockers.push({
      id: "broken-evidence-references",
      label: `${references.broken.length} broken evidence reference${references.broken.length === 1 ? "" : "s"}`,
      detail: [...new Set(references.broken.map((ref) => ref.label))].join(", ") + " — no matching figure.",
      action: "evidence",
      sectionIds: [...new Set(references.broken.map((ref) => ref.sectionId))],
    });
  }
  const requiredMissing = expectedEvidence.filter(
    (item) => item.expectation.required && !item.ok,
  );
  const optionalMissing = expectedEvidence.filter(
    (item) => !item.expectation.required && !item.ok,
  );
  if (requiredMissing.length > 0) {
    blockers.push({
      id: "required-evidence",
      label: `${requiredMissing.length} required evidence item${requiredMissing.length === 1 ? " is" : "s are"} missing`,
      detail: requiredMissing.map((item) => item.expectation.label).join(", "),
      action: "evidence",
    });
  } else if (expectedEvidence.length > 0) {
    passed.push("Required evidence is linked");
  }
  if (optionalMissing.length > 0) {
    warnings.push({
      id: "optional-evidence",
      label: `${optionalMissing.length} suggested evidence item${optionalMissing.length === 1 ? " is" : "s are"} missing`,
      detail: optionalMissing.map((item) => item.expectation.label).join(", "),
      action: "evidence",
    });
  }

  const recipientComplete =
    draft.mode === "employer"
      ? Boolean(draft.employee.legalName?.trim())
      : Boolean(draft.employer.legalName?.trim() || draft.employer.signatoryName?.trim());
  const senderComplete =
    draft.mode === "employer"
      ? Boolean(draft.employer.legalName?.trim() && draft.employer.signatoryName?.trim())
      : Boolean(draft.employee.legalName?.trim());
  if (!recipientComplete || !senderComplete) {
    blockers.push({
      id: "parties",
      label: `Missing ${[!recipientComplete && "recipient", !senderComplete && "sender"]
        .filter(Boolean)
        .join(" and ")} details`,
      detail: "Both parties must be identified before the letter can be sent.",
      action: "editor",
    });
  } else {
    passed.push("Recipient and sender details are complete");
  }

  const counselRequired = exportRequiresCounselGate(draft);
  const counselAttestation =
    options.counselAttestation === null
      ? undefined
      : options.counselAttestation ?? counselAttestationForDraft(draft);
  if (counselRequired && !counselAttestation) {
    blockers.push({
      id: "counsel-review",
      label: "Counsel review required",
      detail: "A named counsel-review attestation is required before export or send.",
      action: "review",
    });
  } else if (counselRequired) {
    passed.push("Counsel review is confirmed");
  }

  const reviewStatus = draft.reviewStatus ?? "draft";
  if (reviewStatus === "in_review") {
    blockers.push({
      id: "approval-pending",
      label: "Approval is still pending",
      detail: "Wait for the active approval request to be resolved.",
      action: "review",
    });
  } else if (reviewStatus === "changes_requested") {
    blockers.push({
      id: "changes-requested",
      label: "Requested changes are unresolved",
      detail: "Apply the requested changes and resubmit the draft.",
      action: "review",
    });
  } else if (reviewStatus === "approved") {
    passed.push("Draft approval is complete");
  }

  const unresolvedComments = (draft.comments ?? []).filter((comment) => !comment.resolved).length;
  if (unresolvedComments > 0) {
    warnings.push({
      id: "comments",
      label: `${unresolvedComments} unresolved comment${unresolvedComments === 1 ? "" : "s"}`,
      detail: "Resolve or acknowledge review comments before sending.",
      action: "review",
    });
  }

  const wordCount = countDraftWords(draft);
  const [minWords, maxWords] = getLetterMeta(draft.letterType).wordRange;
  if (wordCount > 0 && (wordCount < minWords || wordCount > maxWords)) {
    warnings.push({
      id: "word-count",
      label: `Word count is ${wordCount < minWords ? "below" : "above"} the expected range`,
      detail: `${wordCount} words; this letter usually needs ${minWords}–${maxWords}.`,
      action: "editor",
    });
  }

  const letterheadAttached = isSafeImageRef(draft.employer.letterheadDataUrl);
  const usesExternalLetterhead = Boolean(draft.employer.hasLetterhead && !letterheadAttached);
  if (draft.mode === "employer" && !letterheadAttached && !usesExternalLetterhead) {
    warnings.push({
      id: "letterhead",
      label: "No company letterhead configured",
      detail: "Add letterhead in Settings or confirm the exported letter will be placed on it.",
      action: "settings",
    });
  }

  const allWritten = total > 0 && writtenSections.length === total;
  const editingComplete =
    allWritten &&
    requiredEmptySections.length === 0 &&
    placeholderCount === 0 &&
    streamingSections.length === 0;
  const reviewComplete = reviewStatus === "approved";
  const sent = (draft.exports ?? []).some((event) => event.format === "marked-sent");
  const ready = blockers.length === 0;
  const hasNonReviewBlocker = blockers.some(
    (issue) => issue.id !== "approval-pending" && issue.id !== "changes-requested",
  );
  const status: DraftLifecycleStatus = sent
    ? "sent"
    : !allWritten
      ? "drafting"
      : hasNonReviewBlocker
        ? "blocked"
        : reviewStatus === "in_review" || reviewStatus === "changes_requested"
          ? "needs_review"
          : ready
            ? "ready_to_send"
            : "blocked";
  const statusLabel: Record<DraftLifecycleStatus, string> = {
    drafting: "Drafting",
    needs_review: "Needs review",
    blocked: "Blocked",
    ready_to_send: "Ready to send",
    sent: "Sent",
  };

  // A section is ready only when it is written, not streaming, and contains
  // no unresolved placeholder. "Reviewed" is intentionally tied to the
  // persisted approval decision rather than the legacy ready/edited flag.
  const readySections = writtenSections.filter(
    (section) =>
      section.status !== "streaming" && countUnresolvedPlaceholders(section.html ?? "") === 0,
  );
  const reviewed = reviewComplete ? readySections.length : 0;

  return {
    status,
    statusLabel: statusLabel[status],
    editingComplete,
    reviewComplete,
    canFinalise: ready,
    canExport: ready,
    canMarkSent: ready,
    blockers,
    warnings,
    passed,
    sections: {
      total,
      written: writtenSections.length,
      reviewed,
      ready: readySections.length,
      requiredEmpty: requiredEmptySections.length,
    },
    placeholders: {
      count: placeholderCount,
      sectionIds: placeholderSections.map((section) => section.id),
    },
    evidence: {
      attached: draft.evidence?.length ?? 0,
      expected: expectedEvidence.length,
      satisfied: expectedEvidence.filter((item) => item.ok).length,
      requiredMissing: requiredMissing.length,
      optionalMissing: optionalMissing.length,
      brokenReferences: references.broken.length,
    },
    counsel: {
      required: counselRequired,
      attested: Boolean(counselAttestation),
      attestation: counselAttestation,
    },
    recipientComplete,
    senderComplete,
    letterheadAttached,
    usesExternalLetterhead,
  };
}
