import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { SectionsList } from "@/components/editor/SectionsList";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { RightRail, type RightRailTab } from "@/components/editor/RightRail";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { DocumentPopover } from "@/components/editor/DocumentPopover";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import { InlineDisclaimer } from "@/components/editor/InlineDisclaimer";
import { LetterPreview } from "@/components/editor/LetterPreview";
import { RetryBanner, type RetryEvent } from "@/components/editor/RetryBanner";
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
  ChevronLeft,
  StopCircle,
  PanelLeft,
  PanelRight,
  Menu,
  FileEdit,
  Eye,
  MoreHorizontal,
  UserPlus,
  Settings2,
  ShieldCheck,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowRight,
} from "lucide-react";
import { generateAllSections, regenerateSection } from "@/lib/llm/draft";
import type { Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { BrandMark, AvatarStack } from "@/components/ds";
import { useProfileStore } from "@/lib/profile";
import { listIdentities } from "@/lib/comments/identity";
import { InvitePopover } from "@/components/editor/InvitePopover";
import { RefineDialog } from "@/components/editor/RefineDialog";
import { EditDetailsSheet } from "@/components/editor/EditDetailsSheet";

/**
 * Feature flag for the Focus-mode toggle. Disabled for now per user
 * request; flip back to true to restore the button without touching the
 * underlying state / Esc / floating-overlay code paths.
 */
const FOCUS_ENABLED = false;

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
  // Export was moved to the Review step — no pending-export state lives in
  // the editor anymore. Kept the type alias below for any future surface
  // that needs to type a format string.
  const [showSidebar, setShowSidebar] = useState(false);
  const [showRail, setShowRail] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  /**
   * Focus mode — collapses both rails + the secondary toolbar so the writer
   * sees only the canvas. A floating outline pill (top-left) and a floating
   * AI composer (bottom) preserve navigation and AI access. Press Esc to
   * exit. See public/editor-designs.html#v6 for the proposal this implements.
   */
  const [focusMode, setFocusMode] = useState(false);
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

  // Esc exits Focus mode. Bound at the route level so it works from any
  // child surface (canvas, floating composer, etc.). We listen on keydown
  // capture so Radix popovers/dialogs that swallow Escape don't beat us.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc exits focus mode.
      if (e.key === "Escape" && focusMode) {
        setFocusMode(false);
        return;
      }
      // ⌘L / Ctrl+L jumps to the AI agent rail (and exits focus if on).
      // Matches the affordance shown in the focus-mode floating composer.
      if ((e.metaKey || e.ctrlKey) && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setFocusMode(false);
        setRightTab("ai");
        setShowRail(true);
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>(
            'textarea[placeholder*="Rewrite a section"]'
          );
          el?.focus();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

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

  // Export logic moved to ReviewStep — that page handles format choice,
  // counsel-review attestation, and recording the export. The editor no
  // longer owns any export state.

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
       * Layout: [brand · ← Letters · counsel pill] [TITLE centred + submeta]
       * [avatars · actions]. Edit/Preview moved to the secondary toolbar so
       * the title can claim centre stage. */}
      <header className="h-12 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30">
        {/* Layout: relative row with left + right flex groups; the centred
         * title is absolute-positioned so it anchors to the viewport midpoint
         * regardless of how heavy the left/right groups become. This is what
         * lets the title above and Edit/Preview below share a vertical axis. */}
        <div className="relative h-full px-2 sm:px-4 flex items-center gap-2 sm:gap-3">
          {/* Left: brand + back-to-letters + counsel pill.
           * Mobile hamburger moved out of here — see right-side cluster
           * below. Keeping the brand as the first element matches the
           * "logo always top-left" convention. */}
          <div className="flex items-center gap-2 min-w-0">
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

          {/* Centre: document title — absolute, but offset so it sits over the
           * canvas centre (not the viewport centre). The main topbar spans the
           * full viewport, while the secondary toolbar (where Edit/Preview
           * lives) is nested inside <main>, which is sandwiched between the
           * 232px sections rail and the 380px right rail. To make the title
           * stack vertically with Edit/Preview we shift it by
           * (leftRail - rightRail) / 2 = (232 - 380) / 2 = -74px on lg+.
           * Focus mode collapses both rails so the canvas fills the viewport,
           * which means the title should fall back to true centre. On smaller
           * screens the rails are drawers and canvas is full-width, so the
           * title centres on the viewport as normal. */}
          <div
            className={
              "absolute -translate-x-1/2 flex items-center justify-center min-w-0 max-w-[44vw] px-2 pointer-events-none " +
              (focusMode ? "left-1/2" : "left-1/2 lg:left-[calc(50%-74px)]")
            }
          >
            <span className="text-[14px] font-medium text-[var(--ds-ink)] truncate pointer-events-auto">
              {meta.title}
              <span className="hidden lg:inline text-[12px] text-[var(--ds-muted)] font-normal ml-2">
                · {recipientLabel} · {draft.context.jurisdiction}
              </span>
            </span>
          </div>

          {/* Right: avatars + Invite + actions */}
          <div className="ml-auto flex items-center gap-2 justify-end min-w-0">
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
            {/* Focus toggle — temporarily disabled per user request.
             * Code path below (state + Esc handler + floating overlays) is
             * kept intact so we can flip FOCUS_ENABLED back to true without
             * a code change. See public/editor-designs.html#v6.
             * Flag: FOCUS_ENABLED at top of file. */}
            {FOCUS_ENABLED && (
              <Button
                variant={focusMode ? "default" : "outline"}
                size="sm"
                className="px-2 sm:px-3"
                onClick={() => setFocusMode((f) => !f)}
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                title={focusMode ? "Exit focus mode (Esc)" : "Focus mode — hide rails"}
              >
                {focusMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                <span className="hidden md:inline">{focusMode ? "Exit focus" : "Focus"}</span>
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
            {/* Export removed from the editor topbar — the only export
             * entry is now the Review step, which is the natural place to
             * choose format after the final checklist. Editor stays focused
             * on writing.
             *
             * Employee drafts go Edit → Evidence → Review → Export.
             * Employer drafts skip Evidence (rare to need a bundle) and
             * go Edit → Review → Export. Both end at the same place. */}
            {draft.mode === "employee" ? (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={() => nav(`/editor/${draft.id}/evidence${activeSectionId ? `?section=${activeSectionId}` : ""}`)}
              >
                <span className="hidden sm:inline">Next: Evidence</span>
                <span className="sm:hidden">Evidence</span>
                <ArrowRight className="size-4 sm:ml-1.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={() => nav(`/editor/${draft.id}/review`)}
              >
                <span className="hidden sm:inline">Next: Review</span>
                <span className="sm:hidden">Review</span>
                <ArrowRight className="size-4 sm:ml-1.5" />
              </Button>
            )}
            {/* Mobile menu — single hamburger on the right (replaces the
             * left-side section toggle + right-rail toggle). Opens a small
             * dropdown with both panel toggles so mobile users have a
             * consistent affordance instead of two separate icons. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden size-8"
                  aria-label="Open menu"
                >
                  <Menu className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowSidebar((s) => !s)}>
                  <PanelLeft className="size-4 mr-2" />
                  {showSidebar ? "Hide sections" : "Show sections"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRail((s) => !s)}>
                  <PanelRight className="size-4 mr-2" />
                  {showRail ? "Hide right rail" : "Show right rail"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Editor body — three columns on lg; below lg, sections + rail are drawers.
       * Apple-minimal: left rail has enough room for the outline labels while
       * keeping the writing canvas dominant. In focus mode both rails
       * collapse and the canvas takes the full width. */}
      <div
        className={
          "flex-1 grid grid-cols-1 min-h-0 relative overflow-hidden " +
          (focusMode
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[232px_minmax(0,1fr)_380px]")
        }
      >
        <aside
          className={
            "border-r border-[var(--ds-line)] bg-[var(--ds-surface-2)] min-h-0 flex flex-col overflow-hidden " +
            (focusMode
              ? "hidden"
              : showSidebar
              ? "absolute inset-y-0 left-0 z-40 w-[280px] shadow-xl lg:static lg:shadow-none lg:w-auto"
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

        <main className="flex flex-col bg-[var(--ds-canvas)] min-w-0 min-h-0 relative">
          {/* Secondary toolbar — Apple-minimal: Tone + WP collapsed behind a
           * single "Document" popover. Regenerate-all stays visible on the
           * right (most-used section action). Hidden in focus mode. */}
          {!focusMode && (
            <div className="relative h-9 shrink-0 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] flex items-center px-3 sm:px-4 gap-2">
              {/* Left: document settings */}
              <div className="flex items-center gap-2 min-w-0">
                <DocumentPopover draft={draft} />
              </div>

              {/* Centre: Edit / Preview — absolute-positioned so it shares the
               * exact vertical axis as the document title in the row above,
               * independent of left/right column content widths. */}
              <div
                className="absolute left-1/2 -translate-x-1/2 inline-flex items-center rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden h-7"
                role="tablist"
                aria-label="View mode"
              >
                <ViewModeButton mode="edit" current={viewMode} setMode={setViewMode} icon={<FileEdit className="size-3.5" />} label="Edit" />
                <ViewModeButton mode="preview" current={viewMode} setMode={setViewMode} icon={<Eye className="size-3.5" />} label="Preview" />
              </div>

              {/* Right: pending-changes count, streaming status, Regenerate all */}
              <div className="ml-auto flex items-center gap-2 justify-end min-w-0">
                {(() => {
                  const pendingCount = draft.sections.filter((s) => s.pendingChange).length;
                  if (pendingCount === 0) return null;
                  return (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)] text-[11px] text-[var(--ds-amber-fg)] font-medium">
                      <span>{pendingCount} pending</span>
                      <button
                        type="button"
                        onClick={() => useDraftStore.getState().rejectAllPending(draft.id)}
                        className="hover:underline"
                        title="Reject every pending AI proposal"
                      >
                        Reject all
                      </button>
                      <span className="text-[var(--ds-amber-fg)]/50">·</span>
                      <button
                        type="button"
                        onClick={() => useDraftStore.getState().acceptAllPending(draft.id)}
                        className="hover:underline font-semibold"
                        title="Accept every pending AI proposal"
                      >
                        Accept all
                      </button>
                    </div>
                  );
                })()}
                {globallyStreaming && (
                  <span className="text-[12px] text-[var(--ds-muted)] flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" /> Drafting…
                  </span>
                )}
                {globallyStreaming ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={stopStreaming}
                  >
                    <StopCircle className="size-3.5" />
                    <span className="hidden md:inline">Stop</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={runGenerateAll}
                    title="Regenerate every section (uses current wizard answers and tone)"
                  >
                    <Sparkles className="size-3.5" />
                    <span className="hidden md:inline">Regenerate all</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Focus-mode overlays. Anchored to <main> (which is `relative`).
           * Outline pill (top-left) shows progress + the active section so the
           * writer stays oriented; click to exit. AI bar (bottom-center) is a
           * one-click jumper back to the agent rail — full composer is in the
           * rail, this is just the affordance. Esc also exits. */}
          {focusMode && (
            <>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="absolute top-3 left-3 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[11px] text-[var(--ds-muted)] shadow-sm hover:bg-[var(--ds-line-2)] transition"
                title="Exit focus mode (Esc)"
                aria-label="Exit focus mode"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Minimize2 className="size-3" />
                  <span className="tabular-nums text-[var(--ds-body)] font-medium">
                    {(() => {
                      const idx = activeSectionId
                        ? draft.sections.findIndex((s) => s.id === activeSectionId)
                        : -1;
                      const n = idx >= 0 ? idx + 1 : 1;
                      return `${n} / ${draft.sections.length}`;
                    })()}
                  </span>
                </span>
                <span className="truncate max-w-[180px]">
                  {(() => {
                    const sec = activeSectionId
                      ? draft.sections.find((s) => s.id === activeSectionId)
                      : draft.sections[0];
                    return sec?.title ?? "Letter";
                  })()}
                </span>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--ds-line-2)] text-[10px] font-mono text-[var(--ds-muted)]">
                  Esc
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocusMode(false);
                  setRightTab("ai");
                  setShowRail(true);
                  requestAnimationFrame(() => {
                    const el = document.querySelector<HTMLTextAreaElement>(
                      'textarea[placeholder*="Rewrite a section"]'
                    );
                    el?.focus();
                  });
                }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-2.5 text-[12px] text-[var(--ds-muted)] shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.10)] hover:bg-[var(--ds-surface)] transition min-w-[420px] max-w-[640px]"
                title="Open AI agent (⌘L)"
                aria-label="Open AI agent"
              >
                <Sparkles className="size-3.5 text-[var(--ds-muted)]" />
                <span className="flex-1 text-left text-[var(--ds-muted)]">
                  Ask the AI to rewrite, tighten, or add a clause…
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--ds-line-2)] text-[10px] font-mono text-[var(--ds-muted)]">
                  ⌘L
                </span>
                <span className="inline-grid place-items-center size-7 rounded-full bg-[var(--ds-ink)] text-white">
                  <ArrowUp className="size-3.5" />
                </span>
              </button>
            </>
          )}

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
                  onOpenEvidenceBinder={() => {
                    setActiveSectionId(section.id);
                    nav(`/editor/${draft.id}/evidence?section=${section.id}`);
                  }}
                  onFocusComment={onFocusComment}
                  commentCount={commentCount(section.id)}
                  onAcceptPending={() =>
                    useDraftStore.getState().acceptSectionPending(draft.id, section.id)
                  }
                  onRejectPending={() =>
                    useDraftStore.getState().rejectSectionPending(draft.id, section.id)
                  }
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
            (focusMode
              ? "hidden"
              : showRail
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

      {/* High-risk export gate moved to the Review step — it lives at the
       * point of attestation, not in the editor. */}

    </div>
  );
}

type ViewMode = "edit" | "preview";

function ViewModeButton({
  mode,
  current,
  setMode,
  icon,
  label,
}: {
  mode: ViewMode;
  current: ViewMode;
  setMode: (m: ViewMode) => void;
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
