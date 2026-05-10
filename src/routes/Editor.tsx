import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { SectionsList } from "@/components/editor/SectionsList";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { CompliancePanel } from "@/components/editor/CompliancePanel";
import { EmployeeRail } from "@/components/editor/EmployeeRail";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { WithoutPrejudiceToggle } from "@/components/editor/WithoutPrejudiceToggle";
import { ToneOverride } from "@/components/editor/ToneOverride";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import { InlineDisclaimer } from "@/components/editor/InlineDisclaimer";
import { HighRiskExportGate } from "@/components/editor/HighRiskExportGate";
import { RetryBanner, type RetryEvent } from "@/components/editor/RetryBanner";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Sparkles,
  Download,
  ChevronLeft,
  StopCircle,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { generateAllSections, regenerateSection } from "@/lib/llm/draft";
import type { Section } from "@/lib/letters/types";
import { exportLetterToPdf } from "@/lib/export/pdf";
import { exportLetterToDocx } from "@/lib/export/docx";
import { getLetterMeta } from "@/lib/letters/catalog";

type ExportFormat = "pdf" | "docx";

export function Editor() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [globallyStreaming, setGloballyStreaming] = useState(false);
  const [historySection, setHistorySection] = useState<Section | null>(null);
  const [retryEvent, setRetryEvent] = useState<RetryEvent | null>(null);
  const [pendingExport, setPendingExport] = useState<ExportFormat | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showRail, setShowRail] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const meta = useMemo(
    () => (draft ? getLetterMeta(draft.letterType) : null),
    [draft]
  );

  // Auto-generate on first visit if all sections are empty.
  useEffect(() => {
    if (!draft) return;
    const allEmpty = draft.sections.every((s) => s.status === "empty" && !s.html);
    if (allEmpty && !globallyStreaming) {
      void runGenerateAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  if (!draft || !draftId || !meta) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ChevronLeft className="size-4 mr-1" /> Back home
        </Button>
      </div>
    );
  }

  const isHighRisk = exportRequiresCounselGate(draft);
  const setWithoutPrejudice = useDraftStore((s) => s.setWithoutPrejudice);
  const recordExport = useDraftStore((s) => s.recordExport);

  const onRetry = (retryCount: number, delayMs: number, reason: string) => {
    setRetryEvent({ retryCount, delayMs, reason, startedAt: Date.now() });
    setTimeout(() => setRetryEvent(null), delayMs);
  };

  const runGenerateAll = async () => {
    if (globallyStreaming) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setGloballyStreaming(true);
    try {
      await generateAllSections(
        draft,
        { appendToSection, setSectionStatus, pushSectionVersion, updateSection },
        abortRef.current.signal,
        { onRetry }
      );
    } catch (err) {
      console.error(err);
      alert("Generation failed: " + (err instanceof Error ? err.message : "unknown error"));
    } finally {
      setGloballyStreaming(false);
      setRetryEvent(null);
    }
  };

  const onRegenerateSection = async (section: Section) => {
    if (globallyStreaming) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setGloballyStreaming(true);
    try {
      await regenerateSection(
        draft,
        section,
        { appendToSection, setSectionStatus, pushSectionVersion, updateSection },
        abortRef.current.signal,
        { onRetry }
      );
    } catch (err) {
      console.error(err);
      alert("Regeneration failed: " + (err instanceof Error ? err.message : "unknown error"));
    } finally {
      setGloballyStreaming(false);
      setRetryEvent(null);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setGloballyStreaming(false);
    setRetryEvent(null);
    draft.sections.forEach((s) => {
      if (s.status === "streaming") {
        setSectionStatus(draft.id, s.id, s.html ? "edited" : "empty");
      }
    });
  };

  const requestExport = (format: ExportFormat) => {
    if (isHighRisk) {
      setPendingExport(format);
      return;
    }
    void doExport(format);
  };

  const doExport = async (format: ExportFormat, attestation?: { reviewedBy: string; reviewedOn: string }) => {
    try {
      if (format === "pdf") await exportLetterToPdf(draft);
      else await exportLetterToDocx(draft);
      recordExport(draft.id, { format, reviewedBy: attestation?.reviewedBy, reviewedOn: attestation?.reviewedOn });
    } catch (err) {
      alert(
        `Export (${format.toUpperCase()}) failed: ` +
          (err instanceof Error ? err.message : "unknown error")
      );
    }
  };

  const onConfirmHighRiskExport = async (attestation?: { reviewedBy: string; reviewedOn: string }) => {
    const fmt = pendingExport;
    setPendingExport(null);
    if (fmt) await doExport(fmt, attestation);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Editor actions row — sits below the EditorTopbar provided by Layout */}
      <div className="border-b border-letter-rule bg-muted/20">
        <div className="px-3 sm:px-6 h-11 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden size-8"
              onClick={() => setShowSidebar((s) => !s)}
              aria-label="Toggle sections"
            >
              <PanelLeft className="size-4" />
            </Button>
            <ToneOverride draft={draft} />
            <WithoutPrejudiceToggle
              draft={draft}
              onChange={(v) => setWithoutPrejudice(draft.id, v)}
            />
          </div>
          <div className="flex items-center gap-1">
            {globallyStreaming ? (
              <Button variant="ghost" size="sm" onClick={stopStreaming}>
                <StopCircle className="size-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Stop</span>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={runGenerateAll}>
                <Sparkles className="size-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Regenerate all</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={globallyStreaming}>
                  <Download className="size-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => requestExport("pdf")}>Export as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => requestExport("docx")}>Export as DOCX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden size-8"
              onClick={() => setShowRail((s) => !s)}
              aria-label="Toggle compliance rail"
            >
              <PanelRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Editor body — three columns on lg; below lg, sections + rail are drawers */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] min-h-0 relative overflow-hidden">
        <aside
          className={
            "border-r border-letter-rule bg-background min-h-0 " +
            (showSidebar
              ? "absolute inset-y-0 left-0 z-40 w-[260px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:block")
          }
        >
          <SectionsList
            draft={draft}
            activeSectionId={activeSectionId}
            onSelect={(id) => {
              setActiveSectionId(id);
              setShowSidebar(false);
              const el = document.querySelector(`[data-section-id="${id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </aside>

        <main className="overflow-auto bg-muted/30">
          <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6 space-y-3">
            <InlineDisclaimer draft={draft} />
            <DeadlineBanner draft={draft} />
            <RetryBanner event={retryEvent} />

            {draft.sections.map((section) => (
              <SectionEditor
                key={section.id}
                section={section}
                isStreaming={section.status === "streaming"}
                active={activeSectionId === section.id}
                onFocus={() => setActiveSectionId(section.id)}
                onChange={(html) => updateSection(draft.id, section.id, html)}
                onRegenerate={() => onRegenerateSection(section)}
                onClear={() => updateSection(draft.id, section.id, "")}
                onShowHistory={() => setHistorySection(section)}
              />
            ))}

            {globallyStreaming && (
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-4">
                <Loader2 className="size-3 animate-spin" />
                Streaming sections from the model…
              </p>
            )}
          </div>
        </main>

        <aside
          className={
            "border-l border-letter-rule bg-background min-h-0 " +
            (showRail
              ? "absolute inset-y-0 right-0 z-40 w-[300px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:block")
          }
        >
          {draft.mode === "employee" ? (
            <EmployeeRail draft={draft} />
          ) : (
            <CompliancePanel draft={draft} />
          )}
        </aside>

        {/* Mobile scrim */}
        {(showSidebar || showRail) && (
          <button
            type="button"
            className="lg:hidden absolute inset-0 z-20 bg-black/30"
            aria-label="Close panel"
            onClick={() => {
              setShowSidebar(false);
              setShowRail(false);
            }}
          />
        )}
      </div>

      <VersionHistoryDialog
        open={Boolean(historySection)}
        onClose={() => setHistorySection(null)}
        section={historySection}
        onRestore={(html) => {
          if (historySection) {
            updateSection(draft.id, historySection.id, html);
            setHistorySection(null);
          }
        }}
      />

      {isHighRisk && pendingExport && (
        <HighRiskExportGate
          draft={draft}
          open={true}
          onClose={() => setPendingExport(null)}
          onConfirm={async ({ reviewedBy, reviewedOn }) => {
            try {
              const updated = { ...(draft.answers as object), _counselReview: { reviewedBy, reviewedOn } };
              useDraftStore.getState().updateAnswers(draft.id, updated);
            } catch (e) {
              console.warn("Could not record attestation", e);
            }
            void onConfirmHighRiskExport({ reviewedBy, reviewedOn });
          }}
        />
      )}

    </div>
  );
}
