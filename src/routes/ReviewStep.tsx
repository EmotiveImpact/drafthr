import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { ReviewPanel } from "@/components/editor/ReviewPanel";
import { HighRiskExportGate } from "@/components/editor/HighRiskExportGate";
import { Button } from "@/components/ui/button";
import { exportLetterPack } from "@/lib/export/pack";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { cn } from "@/lib/utils";

/**
 * Review step — the page that sits between Evidence & Attachments and
 * the export download. Reuses ReviewPanel for the actual checklist UI;
 * this route wraps it with the previous/next breadcrumb and the export
 * gate handling for high-risk letter types.
 *
 *   Edit → Evidence & Attachments → REVIEW → Export pack
 *
 * No view-mode tab in the editor — Review is a discrete workflow stage
 * with its own URL, not a way of looking at the letter.
 */
export function ReviewStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const recordExport = useDraftStore((s) => s.recordExport);
  const updateAnswers = useDraftStore((s) => s.updateAnswers);

  const [exporting, setExporting] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4 mr-1" /> Back home
        </Button>
      </div>
    );
  }

  const meta = getLetterMeta(draft.letterType);
  const requiresCounsel = exportRequiresCounselGate(draft);

  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const last = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (last?.reviewedBy && last.reviewedOn) {
      return { reviewedBy: last.reviewedBy, reviewedOn: last.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy?: string; reviewedOn?: string }
      | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) {
      return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    }
    return null;
  })();

  const runExport = async (attestation?: { reviewedBy: string; reviewedOn: string }) => {
    setExporting(true);
    try {
      await exportLetterPack(draft, attestation);
      recordExport(draft.id, {
        format: "pack",
        reviewedBy: attestation?.reviewedBy,
        reviewedOn: attestation?.reviewedOn,
      });
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setExporting(false);
    }
  };

  const onExport = () => {
    if (requiresCounsel && !counselReview) {
      setGateOpen(true);
      return;
    }
    void runExport(counselReview ?? undefined);
  };

  const unresolvedCommentCount = (draft.comments ?? []).filter(
    (c) => !c.resolved
  ).length;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {/* Breadcrumb header */}
      <header className="h-12 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav(`/editor/${draft.id}/evidence`)}
          className="text-[12px]"
        >
          <ArrowLeft className="size-3.5 mr-1.5" />
          Evidence
        </Button>
        <span className="text-[var(--ds-subtle)]">/</span>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">Review</span>
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">
          · {meta.title}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}`)}
            className="text-[12px]"
          >
            Back to editor
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left rail: wizard chrome + per-section jump links. Mirrors the
         * sidebar pattern from Editor / Evidence so the three wizard pages
         * feel like one experience. */}
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardChrome
            draftId={draft.id}
            mode={draft.mode}
            current="review"
          />
          <div className="border-b border-[var(--ds-line-2)] px-4 py-3">
            <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
              Sections
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            {draft.sections.map((section, index) => {
              const sectionComments = (draft.comments ?? []).filter(
                (c) => c.sectionId === section.id && !c.resolved
              ).length;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() =>
                    nav(`/editor/${draft.id}?section=${section.id}`)
                  }
                  className={cn(
                    "mb-1 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
                    "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-[var(--ds-line-2)] text-[10px] text-[var(--ds-muted)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  {sectionComments > 0 && (
                    <span
                      className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--ds-amber-fg)] text-[10px] font-semibold text-white"
                      title={`${sectionComments} unresolved comment${sectionComments === 1 ? "" : "s"}`}
                    >
                      {sectionComments}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          <ReviewPanel
            draft={draft}
            counselReviewedBy={counselReview}
            unresolvedComments={unresolvedCommentCount}
            onJumpToSection={(sectionId) => {
              nav(`/editor/${draft.id}?section=${sectionId}`);
            }}
            onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
            onExport={onExport}
          />

          {/* Footer with explicit next/export buttons */}
          <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6 flex items-center gap-2 justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => nav(`/editor/${draft.id}/evidence`)}
            >
              <ArrowLeft className="size-3.5 mr-1.5" />
              Back to Evidence
            </Button>
            <Button size="sm" disabled={exporting} onClick={onExport}>
              {exporting ? "Building pack…" : "Export pack"}
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          </div>
        </main>
      </div>

      {requiresCounsel && gateOpen && (
        <HighRiskExportGate
          draft={draft}
          open={gateOpen}
          onClose={() => setGateOpen(false)}
          onConfirm={async ({ reviewedBy, reviewedOn }) => {
            try {
              const updated = {
                ...(draft.answers as object),
                _counselReview: { reviewedBy, reviewedOn },
              };
              updateAnswers(draft.id, updated);
            } catch {
              /* ignore */
            }
            setGateOpen(false);
            await runExport({ reviewedBy, reviewedOn });
          }}
        />
      )}
    </div>
  );
}

