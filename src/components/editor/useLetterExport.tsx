import { useState } from "react";
import { toast } from "sonner";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { HighRiskExportGate } from "./HighRiskExportGate";

export type LetterExportFormat = "pdf" | "docx" | "txt" | "pack";

export const EXPORT_FORMATS: { format: LetterExportFormat; label: string; ext: string }[] = [
  { format: "pdf", label: "PDF", ext: ".pdf" },
  { format: "docx", label: "Word", ext: ".docx" },
  { format: "txt", label: "Plain text", ext: ".txt" },
  { format: "pack", label: "Evidence pack", ext: ".zip" },
];

type Attestation = { reviewedBy: string; reviewedOn: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The letter's four exports (PDF, Word, plain text, evidence pack) for the
 * 11A document bar. Each format runs the same renderer and records the same
 * export event as the Finalise page (src/routes/Finalize.tsx), and high-risk
 * letters pass through the HighRiskExportGate first: without a stored
 * counsel attestation the gate asks who reviewed the letter, persists that
 * attestation on the draft (the same answers._counselReview record Finalise
 * and the counsel pill use) and stamps it into the export.
 *
 * Returns the trigger plus the gate element, which the caller must render.
 * Accepts an undefined draft so it can be called before a route's
 * not-found return; it does nothing until a draft is present.
 */
export function useLetterExport(draft: Draft | undefined) {
  const recordExport = useDraftStore((s) => s.recordExport);
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const [busy, setBusy] = useState<LetterExportFormat | null>(null);
  const [gateFor, setGateFor] = useState<LetterExportFormat | null>(null);

  const gateRequired = draft ? exportRequiresCounselGate(draft) : false;
  const stored = (draft?.answers as Record<string, unknown> | undefined)?._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  const storedAttestation: Attestation | undefined =
    stored?.reviewedBy && stored.reviewedOn
      ? { reviewedBy: stored.reviewedBy, reviewedOn: stored.reviewedOn }
      : undefined;

  const run = async (format: LetterExportFormat, att: Attestation | undefined) => {
    if (!draft) return;
    setBusy(format);
    try {
      if (format === "pdf") {
        const { renderLetterPdfBlob, filenameFor } = await import("@/lib/export/pdf");
        const blob = await renderLetterPdfBlob(draft, att);
        downloadBlob(blob, filenameFor(draft));
      } else if (format === "docx") {
        const { renderLetterDocxBlob, docxFilenameFor } = await import("@/lib/export/docx");
        const blob = await renderLetterDocxBlob(draft);
        downloadBlob(blob, docxFilenameFor(draft));
      } else if (format === "txt") {
        // Same flattening as Finalise: resolve inline suggestions first, then
        // decode entities and break lines at block boundaries.
        const htmlToPlain = (html: string): string => {
          const el = document.createElement("div");
          el.innerHTML = html ?? "";
          el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
          el.querySelectorAll("li").forEach((li) => li.prepend("- "));
          el.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, div, tr").forEach((b) =>
            b.append("\n\n"),
          );
          return (el.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        };
        const plain = draft.sections
          .map((s) =>
            htmlToPlain(
              sanitizeLetterHtmlForExport(mergeAcceptedSuggestionsHtml(s.html ?? "", { forExport: true })),
            ),
          )
          .filter(Boolean)
          .join("\n\n");
        const blob = new Blob([plain], { type: "text/plain;charset=utf-8" });
        const slug = (draft.title ?? getLetterMeta(draft.letterType).title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        downloadBlob(blob, `${slug || "letter"}.txt`);
      } else {
        const { exportLetterPack } = await import("@/lib/export/pack");
        await exportLetterPack(draft, att);
      }
      recordExport(draft.id, { format, reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
    } catch (err) {
      const label = EXPORT_FORMATS.find((f) => f.format === format)?.label ?? format;
      toast.error(`${label} export failed`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const requestExport = (format: LetterExportFormat) => {
    if (busy || !draft) return;
    if (gateRequired && !storedAttestation) {
      setGateFor(format);
      return;
    }
    void run(format, gateRequired ? storedAttestation : undefined);
  };

  const gate = draft && gateRequired ? (
    <HighRiskExportGate
      draft={draft}
      open={gateFor !== null}
      onClose={() => setGateFor(null)}
      onConfirm={(review) => {
        const format = gateFor;
        setGateFor(null);
        updateAnswers(draft.id, {
          ...draft.answers,
          _counselReview: { ...review, attestedAt: Date.now() },
        });
        if (format) void run(format, review);
      }}
    />
  ) : null;

  return { requestExport, busy, gate };
}
