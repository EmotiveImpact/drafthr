import type { Draft } from "@/lib/letters/types";
import { sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { runHealthChecks, computeHealthScore } from "@/lib/finalize/healthChecks";
import { getLatestReview, REVIEW_KIND_LABELS } from "@/lib/journey/reviews";
import { displayTitleFor } from "@/lib/letters/display";
import { approvalWord } from "@/lib/journey/stage";
import {
  dateGivenOf,
  fmtDayMonYear,
  fmtTime,
  getSentRecord,
  givenByActivity,
  type GivenBy,
  type LetterFormat,
  type SendWay,
} from "./record";

/**
 * The files the Send step, the Sent panel and the full Finalise page make.
 * Each runs the same renderer as the document bar's Export menu (the PDF with
 * the counsel attestation stamped in, the Word file, the plain text and the
 * evidence pack), plus the audit record. Each throws on failure so the
 * caller can stop before marking the letter as sent; nothing here records
 * the export (the caller does, once the file is out).
 */

export type ExportFormat = LetterFormat | "pack" | "audit";

export type Attestation = { reviewedBy: string; reviewedOn: string };

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "Plain text",
  pack: "Evidence pack",
  audit: "Audit record",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The letter as plain text (accepted suggestions merged, entities decoded). */
export function letterPlainText(draft: Draft): string {
  const htmlToPlain = (html: string): string => {
    const el = document.createElement("div");
    el.innerHTML = html ?? "";
    el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    el.querySelectorAll("li").forEach((li) => li.prepend("- "));
    el.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, div, tr").forEach((b) => b.append("\n\n"));
    return (el.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  return draft.sections
    .map((s) => htmlToPlain(sanitizeLetterHtmlForExport(mergeAcceptedSuggestionsHtml(s.html ?? "", { forExport: true }))))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The send being recorded right now, for an audit record downloaded with
 * "Download and mark as sent": the file is made before the sent record is
 * saved, so it is told how and when the letter was given.
 */
export type PendingSend = {
  way: SendWay;
  givenBy: GivenBy;
  /** YYYY-MM-DD */
  dateGiven: string;
  emailedTo?: string;
  emailedName?: string;
  /** The person recording the send. */
  actorName?: string;
};

export type AuditOptions = {
  /** Who drafted the letter when its record names no one: the person in this workspace (as Activity's "You"). */
  drafterName?: string;
  /** The send this file goes out with. */
  pendingSend?: PendingSend;
};

/** The audit record: who drafted, checked, reviewed, approved and sent the letter, and when. */
export function buildAuditRecord(
  draft: Draft,
  attestation?: Attestation,
  now = Date.now(),
  opts: AuditOptions = {}
): string {
  const when = (ms: number) => `${fmtDayMonYear(ms)}, ${fmtTime(ms)}`;
  const lines: string[] = [];
  const title = displayTitleFor(draft);
  lines.push("AUDIT RECORD", "============", "");
  lines.push(`Letter:        ${title}`);
  lines.push(`Recipient:     ${draft.mode === "employer" ? draft.employee.legalName || "Not named" : draft.employer.legalName || "Not named"}`);
  lines.push(`Employer:      ${draft.employer.legalName || "Not named"}`);
  lines.push(`Jurisdiction:  ${draft.context.jurisdiction}`);
  lines.push(`Generated:     ${when(now)}`);
  lines.push("");

  const timeline = [...(draft.timeline ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  const created = timeline.find((t) => t.kind === "created");
  lines.push("WHO DID WHAT", "------------");
  const drafter = created?.actorName?.trim() || opts.drafterName?.trim() || "Not recorded";
  lines.push(`Drafted        ${drafter}, ${when(created?.createdAt ?? draft.createdAt)}`);

  const checks = runHealthChecks(draft);
  const score = computeHealthScore(checks);
  const passing = checks.filter((c) => c.severity === "pass").length;
  lines.push(`Checked        DraftHR, ${passing} of ${checks.length} checks passing, health ${score.score} (at ${when(now)})`);

  const review = getLatestReview(draft.id);
  if (review && review.status !== "recalled") {
    const rounds = review.rounds.length;
    const finished = review.finishedAt ? `, finished ${when(review.finishedAt)}` : review.status === "out" ? ", still out" : "";
    lines.push(
      `Reviewed       ${review.reviewer.name} (${REVIEW_KIND_LABELS[review.kind]}), ${rounds} round${rounds === 1 ? "" : "s"}${finished}`
    );
  } else {
    lines.push("Reviewed       Not reviewed (review is optional)");
  }

  // An employee's own letter has no approver: its approval is their sign-off (FOUNDATION-X5).
  const approved = approvalWord(draft).padEnd(15);
  for (const a of draft.approvals ?? []) {
    const who = a.reviewerName || "the approver";
    if (a.decision === "submitted") lines.push(`Sent to approve  ${who}, ${when(a.createdAt)}`);
    else if (a.decision === "approved") lines.push(`${approved}${who}, ${when(a.createdAt)}${a.body ? ` ("${a.body}")` : ""}`);
    else lines.push(`Changes asked  ${who}, ${when(a.createdAt)}${a.body ? ` ("${a.body}")` : ""}`);
  }
  if (!(draft.approvals ?? []).some((a) => a.decision === "approved")) lines.push(`${approved}Not yet`);

  if (attestation) lines.push(`Counsel        ${attestation.reviewedBy}, reviewed ${fmtDayMonYear(attestation.reviewedOn)}`);

  const pending = opts.pendingSend;
  const rec = getSentRecord(draft);
  const given = pending?.dateGiven ?? dateGivenOf(draft);
  if (pending) {
    const how = givenByActivity(pending.givenBy, pending.way, pending.emailedName);
    const by = pending.actorName ? `, recorded by ${pending.actorName}` : "";
    lines.push(
      `Sent           ${how}, given ${fmtDayMonYear(pending.dateGiven)}${pending.emailedTo ? ` to ${pending.emailedTo}` : ""}${by} (at ${when(now)})`
    );
  } else if (given) {
    const how = rec ? givenByActivity(rec.givenBy, rec.way, rec.emailedName) : "Marked as sent";
    lines.push(`Sent           ${how}, given ${fmtDayMonYear(given)}${rec?.emailedTo ? ` to ${rec.emailedTo}` : ""}`);
  } else {
    lines.push("Sent           Not yet");
  }
  lines.push("");

  const exports = [...(draft.exports ?? [])].sort((a, b) => a.exportedAt - b.exportedAt);
  if (exports.length) {
    lines.push("FILES AND SENDS", "---------------");
    for (const e of exports) {
      const label = e.format === "marked-sent" ? "Marked as sent" : `Downloaded ${FORMAT_LABEL[e.format as ExportFormat] ?? e.format}`;
      lines.push(`${when(e.exportedAt)}  ${label}${e.reviewedBy ? ` (counsel: ${e.reviewedBy})` : ""}`);
    }
    lines.push("");
  }

  if (timeline.length) {
    lines.push("FULL TIMELINE", "-------------");
    for (const t of timeline) {
      const who = t.actorName ? ` (${t.actorName})` : "";
      lines.push(`${when(t.createdAt)}  ${t.title}${who}${t.detail ? `: ${t.detail}` : ""}`);
    }
    lines.push("");
  }
  lines.push("Made by DraftHR from the letter's own record.");
  return lines.join("\n");
}

export type ExportOptions = {
  /** Evidence pack: leave these evidence items out. */
  excludeEvidence?: string[];
  /** Evidence pack: a covering note for the file, put on the pack's summary page. */
  coverNote?: string;
  /** Audit record: who drafted it and the send it goes out with. */
  audit?: AuditOptions;
};

/** Download one file. Throws when it cannot be made. */
export async function runExport(
  draft: Draft,
  format: ExportFormat,
  attestation: Attestation | undefined,
  opts: ExportOptions = {}
): Promise<void> {
  if (format === "pdf") {
    const { renderLetterPdfBlob, filenameFor } = await import("@/lib/export/pdf");
    const blob = await renderLetterPdfBlob(draft, attestation);
    downloadBlob(blob, filenameFor(draft));
    return;
  }
  if (format === "docx") {
    const { renderLetterDocxBlob, docxFilenameFor } = await import("@/lib/export/docx");
    const blob = await renderLetterDocxBlob(draft);
    downloadBlob(blob, docxFilenameFor(draft));
    return;
  }
  if (format === "txt") {
    // Named like the PDF and Word files (type-employee-date.txt).
    const { filenameFor } = await import("@/lib/export/pdf");
    const blob = new Blob([letterPlainText(draft)], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, filenameFor(draft).replace(/\.pdf$/i, "") + ".txt");
    return;
  }
  if (format === "audit") {
    const { filenameFor } = await import("@/lib/export/pdf");
    const base = filenameFor(draft).replace(/\.pdf$/i, "");
    const blob = new Blob([buildAuditRecord(draft, attestation, Date.now(), opts.audit)], {
      type: "text/plain;charset=utf-8",
    });
    downloadBlob(blob, `${base}-audit-record.txt`);
    return;
  }
  // Evidence pack: the chosen evidence only, and the covering note on the
  // summary page's timeline (escaped there like every other entry).
  const { exportLetterPack } = await import("@/lib/export/pack");
  const exclude = new Set(opts.excludeEvidence ?? []);
  const note = opts.coverNote?.trim();
  const packDraft: Draft = {
    ...draft,
    evidence: draft.evidence ? draft.evidence.filter((e) => !exclude.has(e.id)) : draft.evidence,
    timeline: note
      ? [
          ...(draft.timeline ?? []),
          {
            id: `cover-note-${Date.now()}`,
            kind: "details_updated",
            createdAt: Date.now(),
            title: "Covering note for the file",
            detail: note,
          },
        ]
      : draft.timeline,
  };
  await exportLetterPack(packDraft, attestation);
}
