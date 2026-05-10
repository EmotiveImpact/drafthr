import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { SectionsList } from "@/components/editor/SectionsList";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { RightRail, type RightRailTab } from "@/components/editor/RightRail";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { WithoutPrejudiceToggle } from "@/components/editor/WithoutPrejudiceToggle";
import { ToneOverride } from "@/components/editor/ToneOverride";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import { InlineDisclaimer } from "@/components/editor/InlineDisclaimer";
import { HighRiskExportGate } from "@/components/editor/HighRiskExportGate";
import { LetterPreview } from "@/components/editor/LetterPreview";
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
  ChevronRight,
  StopCircle,
  PanelLeft,
  PanelRight,
  FileEdit,
  Eye,
  MoreHorizontal,
  UserPlus,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { generateAllSections, regenerateSection } from "@/lib/llm/draft";
import type { Section } from "@/lib/letters/types";
import { exportLetterToPdf } from "@/lib/export/pdf";
import { exportLetterToDocx } from "@/lib/export/docx";
import { getLetterMeta } from "@/lib/letters/catalog";
import { BrandMark, AvatarStack } from "@/components/ds";
import { useProfileStore } from "@/lib/profile";
import { listIdentities } from "@/lib/comments/identity";
import { InvitePopover } from "@/components/editor/InvitePopover";
import { RefineDialog } from "@/components/editor/RefineDialog";
import { EditDetailsSheet } from "@/components/editor/EditDetailsSheet";

type ExportFormat = "pdf" | "docx";

export function Editor() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const profile = useProfileStore((s) => s.profile);
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
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [rightTab, setRightTab] = useState<RightRailTab>("ai");
  const [pendingComment, setPendingComment] = useState<{
    sectionId: string;
    quote?: string;
    applyMark?: (commentId: string) => void;
  } | null>(null);
  const [refineSectionId, setRefineSectionId] = useState<string | null>(null);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);

  const openComments = (sectionId: string) => {
    setRightTab("comments");
    setShowRail(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-comments-anchor="${sectionId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const commentCount = (sectionId: string) =>
    (draft?.comments ?? []).filter((c) => c.sectionId === sectionId && !c.resolved).length;

  const onSectionAddComment = (
    sectionId: string,
    opts?: { quote?: string; applyMark?: (commentId: string) => void }
  ) => {
    setPendingComment({ sectionId, ...opts });
    openComments(sectionId);
  };

  const onFocusComment = (commentId: string) => {
    setRightTab("comments");
    setShowRail(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-comment-id="${commentId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-[var(--accent-9)]");
      setTimeout(() => el?.classList.remove("ring-2", "ring-[var(--accent-9)]"), 1600);
    });
  };
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

  const onRegenerateSection = async (section: Section, refineInstruction?: string) => {
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
        { onRetry },
        refineInstruction
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

  const backTo = draft.mode === "employer" ? "/hr" : draft.mode === "employee" ? "/me" : "/";
  const identities = listIdentities(draft, profile);
  const recipientLabel =
    draft.mode === "employer"
      ? draft.employee.legalName || "(no recipient)"
      : `to ${draft.employer.legalName || "(employer)"}`;

  // Counsel-review status — derived from the most recent export attestation
  // OR from a manual attestation in answers._counselReview. High-risk
  // letters that haven't been reviewed show an amber "needs review" pill.
  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const lastExport = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (lastExport?.reviewedBy && lastExport.reviewedOn) {
      return { reviewedBy: lastExport.reviewedBy, reviewedOn: lastExport.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy?: string; reviewedOn?: string }
      | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) {
      return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    }
    return null;
  })();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Single canonical header — replaces the old EditorTopbar + action row.
       * Layout: [brand · breadcrumb · meta] [centred view-mode] [avatars · actions]
       */}
      <header className="h-12 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30">
        <div className="h-full px-2 sm:px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          {/* Left: brand + breadcrumb + sections-toggle + meta */}
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden size-8"
              onClick={() => setShowSidebar((s) => !s)}
              aria-label="Toggle sections"
            >
              <PanelLeft className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => nav(backTo)}
              aria-label="Back to letters"
              className="flex items-center gap-2 min-w-0 group rounded-md hover:bg-[var(--ds-line-2)] px-1 py-0.5 transition"
            >
              <BrandMark size={26} />
              <span className="hidden md:flex items-center gap-2 text-[12px] text-[var(--ds-muted)]">
                <ChevronLeft className="size-3 group-hover:-translate-x-0.5 transition" />
                Letters
              </span>
            </button>
            <ChevronRight className="size-3 text-[var(--ds-subtle)] hidden sm:inline" />
            <span className="text-[14px] font-medium text-[var(--ds-ink)] truncate">
              {meta.title}
            </span>
            <span className="hidden lg:inline text-[12px] text-[var(--ds-muted)] truncate">
              · {recipientLabel} · {draft.context.jurisdiction}
            </span>
            {/* Counsel-review pill — only on high-risk letters or where the
             * letter type's metadata flags counsel review as required. */}
            {(meta.legalReviewRequired || meta.riskClass === "high") && (
              <span
                className={
                  "inline-flex items-center gap-1 ml-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 " +
                  (counselReview
                    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] border-[var(--ds-green-bg)]"
                    : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border-[var(--ds-amber-bg)]")
                }
                title={
                  counselReview
                    ? `Counsel-reviewed by ${counselReview.reviewedBy} on ${counselReview.reviewedOn}`
                    : "Counsel review required before export"
                }
              >
                <ShieldCheck className="size-3" />
                <span className="hidden md:inline">{counselReview ? "Reviewed" : "Needs review"}</span>
              </span>
            )}
          </div>

          {/* Centre: view-mode toggle */}
          <div
            className="inline-flex items-center rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden"
            role="tablist"
            aria-label="View mode"
          >
            <ViewModeButton mode="edit" current={viewMode} setMode={setViewMode} icon={<FileEdit className="size-3.5" />} label="Edit" />
            <ViewModeButton mode="preview" current={viewMode} setMode={setViewMode} icon={<Eye className="size-3.5" />} label="Preview" />
          </div>

          {/* Right: avatars + Invite + actions */}
          <div className="flex items-center gap-2 justify-end min-w-0">
            {identities.length > 0 && (
              <InvitePopover
                draft={draft}
                trigger={
                  <button
                    type="button"
                    className="rounded-full hover:opacity-90 transition"
                    aria-label="Manage people"
                    title="Manage people"
                  >
                    <AvatarStack
                      size="md"
                      max={2}
                      people={identities.map((i) => ({
                        seed: i.email ?? i.id,
                        email: i.email,
                        name: i.name,
                        initials: i.initials,
                        title: i.name + (i.email ? ` <${i.email}>` : ""),
                      }))}
                    />
                  </button>
                }
              />
            )}
            <InvitePopover
              draft={draft}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2 sm:px-3"
                  aria-label="Invite"
                >
                  <UserPlus className="size-3.5" />
                  <span className="hidden md:inline">Invite</span>
                </Button>
              }
            />
            {/* Surfaced primary actions — Regenerate all + Stop. Always
             * visible at md+. On mobile they fold into the More menu. */}
            {globallyStreaming ? (
              <Button
                variant="outline"
                size="sm"
                onClick={stopStreaming}
                className="hidden md:inline-flex"
              >
                <StopCircle className="size-3.5" />
                <span className="hidden lg:inline">Stop</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={runGenerateAll}
                className="hidden md:inline-flex"
                title="Regenerate every section (uses current wizard answers and tone)"
              >
                <Sparkles className="size-3.5" />
                <span className="hidden lg:inline">Regenerate all</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem onClick={() => setEditDetailsOpen(true)}>
                  <Settings2 className="size-4 mr-2" /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={runGenerateAll} disabled={globallyStreaming}>
                  <Sparkles className="size-4 mr-2" /> Regenerate all
                </DropdownMenuItem>
                {globallyStreaming && (
                  <DropdownMenuItem onClick={stopStreaming}>
                    <StopCircle className="size-4 mr-2" /> Stop
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
              aria-label="Toggle right rail"
            >
              <PanelRight className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Editor body — three columns on lg; below lg, sections + rail are drawers */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_380px] min-h-0 relative overflow-hidden">
        <aside
          className={
            "border-r border-[var(--ds-line)] bg-[var(--ds-surface-2)] min-h-0 flex flex-col overflow-hidden " +
            (showSidebar
              ? "absolute inset-y-0 left-0 z-40 w-[260px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:flex")
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

        <main className="flex flex-col bg-[var(--ds-canvas)] min-w-0 min-h-0">
          {/* Secondary toolbar — sits ABOVE the canvas only, so the right
           * rail tabs remain flush with the main editor topbar. */}
          <div className="h-9 shrink-0 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] flex items-center px-3 sm:px-4 gap-2">
            <ToneOverride draft={draft} />
            <WithoutPrejudiceToggle
              draft={draft}
              onChange={(v) => setWithoutPrejudice(draft.id, v)}
            />
            {globallyStreaming && (
              <span className="ml-auto text-[12px] text-[var(--ds-muted)] flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" /> Drafting…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-0">
          {viewMode === "preview" ? (
            <div className="py-6 sm:py-8 px-3 sm:px-6">
              <LetterPreview
                draft={draft}
                activeSectionId={activeSectionId}
                onFocusSection={(sectionId) => setActiveSectionId(sectionId)}
                onRefineSection={(sectionId) => setRefineSectionId(sectionId)}
                onShowSectionHistory={(sectionId) => {
                  const sec = draft.sections.find((s) => s.id === sectionId);
                  if (sec) setHistorySection(sec);
                }}
                onAddComment={(sectionId, opts) => onSectionAddComment(sectionId, opts)}
                onFocusComment={onFocusComment}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6 space-y-3">
              <InlineDisclaimer draft={draft} />
              <DeadlineBanner draft={draft} />
              <RetryBanner event={retryEvent} />
              {draft.sections.map((section) => (
                <SectionEditor
                  key={section.id}
                  draft={draft}
                  section={section}
                  isStreaming={section.status === "streaming"}
                  active={activeSectionId === section.id}
                  onFocus={() => setActiveSectionId(section.id)}
                  onChange={(html) => updateSection(draft.id, section.id, html)}
                  onRegenerate={(instr) => onRegenerateSection(section, instr)}
                  onClear={() => updateSection(draft.id, section.id, "")}
                  onShowHistory={() => setHistorySection(section)}
                  onOpenCommentsThread={() => openComments(section.id)}
                  onFocusComment={onFocusComment}
                  commentCount={commentCount(section.id)}
                />
              ))}
              {globallyStreaming && (
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-4">
                  <Loader2 className="size-3 animate-spin" />
                  Streaming sections from the model…
                </p>
              )}
            </div>
          )}
          </div>
        </main>

        <aside
          className={
            "border-l border-[var(--ds-line)] bg-[var(--ds-surface)] min-h-0 " +
            (showRail
              ? "absolute inset-y-0 right-0 z-40 w-[300px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:block")
          }
        >
          <RightRail
            draft={draft}
            tab={rightTab}
            onTabChange={setRightTab}
            pendingComment={pendingComment}
            onPendingCommentConsumed={() => setPendingComment(null)}
            activeSectionId={activeSectionId}
          />
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

      <EditDetailsSheet
        open={editDetailsOpen}
        onOpenChange={setEditDetailsOpen}
        draft={draft}
      />

      {/* Refine dialog — Preview's entry point into the per-section refine
       * flow. Edit/Split surfaces use the inline RefinePopover. */}
      <RefineDialog
        open={Boolean(refineSectionId)}
        onOpenChange={(next) => !next && setRefineSectionId(null)}
        sectionTitle={
          refineSectionId
            ? draft.sections.find((s) => s.id === refineSectionId)?.title
            : undefined
        }
        onRefineRegenerate={(instruction) => {
          const sec = draft.sections.find((s) => s.id === refineSectionId);
          if (sec) void onRegenerateSection(sec, instruction);
          setRefineSectionId(null);
        }}
        onPlainRegenerate={() => {
          const sec = draft.sections.find((s) => s.id === refineSectionId);
          if (sec) void onRegenerateSection(sec);
          setRefineSectionId(null);
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

function ViewModeButton({
  mode,
  current,
  setMode,
  icon,
  label,
}: {
  mode: "edit" | "preview";
  current: "edit" | "preview";
  setMode: (m: "edit" | "preview") => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === mode;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => setMode(mode)}
      className={
        "inline-flex items-center gap-1.5 px-3 h-7 text-xs font-medium transition-colors " +
        (active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60")
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

