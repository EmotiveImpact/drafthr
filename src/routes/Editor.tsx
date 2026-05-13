import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { WizardSidebar } from "@/components/editor/WizardSidebar";
import { EmployeeRail } from "@/components/editor/EmployeeRail";
import { CompliancePanel } from "@/components/editor/CompliancePanel";
import { EditableTitleBar } from "@/components/editor/EditableTitleBar";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Sparkles,
  ChevronLeft,
  StopCircle,
  PanelLeft,
  PanelRight,
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
  Pencil,
  Clock3,
  MessageSquare,
  Wand2,
  FileDown,
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
import { FloatingCommentPanel, type FloatingAnchor } from "@/components/editor/FloatingCommentPanel";
import { TimelinePanel } from "@/components/editor/TimelinePanel";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useIsLargeViewport } from "@/lib/use-large-viewport";


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
  // Edit-on-page swaps the read-only preview for inline TipTap editors
  // on each section so the user can type / format / paste right on the
  // rendered A4 page. Only meaningful when viewMode === "preview".
  const [editOnPage, setEditOnPage] = useState(false);
  const [rightTab, setRightTab] = useState<RightRailTab>("ai");
  const [pendingComment, setPendingComment] = useState<{
    sectionId: string;
    quote?: string;
    applyMark?: (commentId: string) => void;
  } | null>(null);
  const [refineSectionId, setRefineSectionId] = useState<string | null>(null);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  // Shared open state for the InvitePopover so the mobile overflow menu
  // can open it (its trigger is hidden below md:).
  const [invitePopoverOpen, setInvitePopoverOpen] = useState(false);
  // Change A: Timeline is no longer a right-rail tab; it's a dialog
  // launched from the ⋯ overflow menu.
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);
  // Change A: All-comments index dialog. Floating panel stays the
  // primary read path; this is the "sweep them all" overview surface
  // — symmetric with how Timeline now works.
  const [allCommentsOpen, setAllCommentsOpen] = useState(false);
  // Desktop right-rail collapse — Notion-style 36px vertical strip with
  // "Ask AI" label so AI stays in peripheral vision even when collapsed.
  // lg:+ only; mobile uses showRail + bottom sheet.
  const [railCollapsed, setRailCollapsed] = useState(false);
  // Gate which AI surface mounts — exactly one at a time. Crossing
  // the breakpoint unmounts the previous surface (its useChat persists
  // to draft.aiChat on idle ticks) and mounts the new one (its useChat
  // hydrates from draft.aiChat via initialMessages). Conversation
  // survives the viewport change.
  const isLargeViewport = useIsLargeViewport();

  // Change A: comments no longer open the right rail. They pop up as a
  // floating panel anchored to the inline highlight (existing thread)
  // or the selection rect at click time (new thread).
  const [floatingComment, setFloatingComment] = useState<
    | {
        anchor: FloatingAnchor;
        mode:
          | { kind: "new"; sectionId: string; quote?: string; applyMark?: (commentId: string) => void }
          | { kind: "existing"; commentId: string };
      }
    | null
  >(null);

  const commentCount = (sectionId: string) =>
    (draft?.comments ?? []).filter((c) => c.sectionId === sectionId && !c.resolved).length;

  const onSectionAddComment = (
    sectionId: string,
    opts?: { quote?: string; applyMark?: (commentId: string) => void }
  ) => {
    // Capture the selection rect at the moment of click — it'll get cleared
    // when focus moves, so we snapshot once and keep using it.
    const sel = window.getSelection();
    let rect: DOMRect | null = null;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const r = range.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) rect = r;
    }
    setFloatingComment({
      anchor: { getRect: () => rect },
      mode: { kind: "new", sectionId, ...opts },
    });
  };

  const onFocusComment = (commentId: string) => {
    // Find the inline mark in the canvas and open the floating thread
    // panel anchored to it. No rail open, no scroll-jump — the user
    // already tapped the mark so it's already in view.
    const markEl = document.querySelector<HTMLElement>(
      `mark[data-comment-id="${commentId}"]`
    );
    if (!markEl) return;
    setFloatingComment({
      anchor: {
        getRect: () => markEl.getBoundingClientRect(),
        containerEl: markEl,
      },
      mode: { kind: "existing", commentId },
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

  // Edit-on-page is only meaningful in Preview. Leaving Preview while
  // it's active would strand the user in an invisible state, so we
  // auto-exit it whenever the view switches away.
  useEffect(() => {
    if (editOnPage && viewMode !== "preview") setEditOnPage(false);
  }, [viewMode, editOnPage]);

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
        {/* Topbar grid mirrors the body grid below it on lg+:
         *   [260px left rail]  [1fr canvas]  [360px right rail]
         * So the migrated secondary-toolbar items (Tone, Edit/Preview,
         * pending/drafting/regen) sit DIRECTLY ABOVE their old positions
         * over the canvas column, not jammed into the viewport-wide
         * left/right clusters. Below lg the rails are drawers and the
         * grid collapses to a single flex row. */}
        <div className="relative h-full flex items-center gap-2 sm:gap-3 px-2 sm:px-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_360px] lg:gap-0 lg:px-0">
          {/* Column 1 — over the left rail / viewport-left on mobile.
           * Brand mark + back-to-letters + counsel pill. */}
          <div className="flex items-center gap-1 min-w-0 lg:px-4">
            {/* Brand mark — single back/home affordance. Clicking the D
             * returns to the letters list for the current mode (employer
             * /hr or employee /me), so we don't need a separate ←
             * Letters button next to it. */}
            <Link
              to={backTo}
              aria-label="Back to letters"
              title="Back to letters"
              className="shrink-0 rounded-md hover:opacity-80 transition px-1 grid place-items-center h-8"
            >
              <BrandMark size={32} />
            </Link>

            {/* Change C: top menubar — File / Tools / View. Conventional
             * desktop position: far-left, right after the brand mark.
             * Mobile keeps the existing icon toolbar + ⋯ overflow. */}
            <div className="hidden md:flex items-center gap-0.5 ml-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md text-[12px] font-medium text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
                  >
                    File
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  <DropdownMenuItem onClick={() => setEditDetailsOpen(true)}>
                    <Settings2 className="size-4 mr-2" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => nav(`/editor/${draft.id}/review`)}
                  >
                    <FileDown className="size-4 mr-2" /> Export…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => nav("/settings")}>
                    <Settings2 className="size-4 mr-2" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav("/privacy")}>
                    <ShieldCheck className="size-4 mr-2" /> Privacy &amp; data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md text-[12px] font-medium text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
                  >
                    Tools
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[240px]">
                  {globallyStreaming ? (
                    <DropdownMenuItem onClick={stopStreaming}>
                      <StopCircle className="size-4 mr-2" /> Stop generation
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={runGenerateAll}>
                      <Sparkles className="size-4 mr-2" /> Regenerate all sections
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={!activeSectionId}
                    onClick={() => {
                      if (activeSectionId) setRefineSectionId(activeSectionId);
                    }}
                  >
                    <Wand2 className="size-4 mr-2" /> Refine current section…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setAllCommentsOpen(true)}>
                    <MessageSquare className="size-4 mr-2" /> Comments
                    {(() => {
                      const n = (draft.comments ?? []).filter(
                        (c) => !c.resolved && !c.parentId
                      ).length;
                      return n > 0 ? (
                        <span className="ml-auto text-[10px] font-mono text-[var(--ds-muted)]">
                          {n}
                        </span>
                      ) : null;
                    })()}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimelineDialogOpen(true)}>
                    <Clock3 className="size-4 mr-2" /> Timeline
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md text-[12px] font-medium text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
                  >
                    View
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  <DropdownMenuItem onClick={() => setViewMode("edit")}>
                    <FileEdit className="size-4 mr-2" />
                    Edit
                    {viewMode === "edit" && (
                      <span className="ml-auto text-[10px]">✓</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewMode("preview")}>
                    <Eye className="size-4 mr-2" />
                    Preview
                    {viewMode === "preview" && (
                      <span className="ml-auto text-[10px]">✓</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={viewMode !== "preview"}
                    onClick={() => setEditOnPage((v) => !v)}
                  >
                    <Pencil className="size-4 mr-2" />
                    {editOnPage ? "Stop editing on page" : "Edit on page"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFocusMode((f) => !f)}>
                    {focusMode ? (
                      <Minimize2 className="size-4 mr-2" />
                    ) : (
                      <Maximize2 className="size-4 mr-2" />
                    )}
                    {focusMode ? "Exit focus mode" : "Enter focus mode"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="lg:hidden" />
                  <DropdownMenuItem
                    className="lg:hidden"
                    onClick={() => setShowSidebar((s) => !s)}
                  >
                    <PanelLeft className="size-4 mr-2" /> Sections rail
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="lg:hidden"
                    onClick={() => setShowRail((s) => !s)}
                  >
                    <PanelRight className="size-4 mr-2" /> AI rail
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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

          {/* Column 2 — over the canvas. Tone (left), Edit/Preview
           * (centred), pending/drafting/regenerate (right). On lg+ this
           * sits directly above the canvas column so the items appear
           * where they used to on the secondary toolbar. Below lg this
           * inline-flows after the left cluster. */}
          <div className="relative flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 min-w-0 lg:px-3">
            {/* Mobile-only icon toolbar — Tone, Regenerate. On md:+ these
             * actions live inside the File/Tools menubar above. */}
            <div className="md:hidden flex items-center gap-2">
              <DocumentPopover draft={draft} />
            {globallyStreaming ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={stopStreaming}
                title="Stop the running generation"
                aria-label="Stop generation"
              >
                <StopCircle className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={runGenerateAll}
                title="Regenerate all sections"
                aria-label="Regenerate all sections"
              >
                <Sparkles className="size-3.5" />
              </Button>
            )}
            </div>

            {/* Edit / Preview — centred over the canvas. On lg+ the
             * grid cell IS the canvas column so a plain centre works.
             * Below lg, absolute-position against the topbar so it
             * sits in the viewport centre. */}
            <div
              className="inline-flex lg:absolute lg:left-1/2 lg:-translate-x-1/2 items-center rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden h-7 mx-auto"
              role="tablist"
              aria-label="View mode"
            >
              <ViewModeButton mode="edit" current={viewMode} setMode={setViewMode} icon={<FileEdit className="size-3.5" />} label="Edit" />
              <ViewModeButton mode="preview" current={viewMode} setMode={setViewMode} icon={<Eye className="size-3.5" />} label="Preview" />
            </div>

            {/* Right-of-canvas: Edit-on-page + Focus + pending pill +
             * Drafting indicator. ml-auto pushes them to the right edge
             * of the canvas column. */}
            <div className="ml-auto flex items-center gap-2">
              {/* Edit-on-page — swaps the rendered preview for inline
               * TipTap section editors. Only meaningful while Preview is
               * active; disabled (but visible) in Edit so the affordance
               * stays discoverable. Used to live as a floating button
               * above the page card; promoted here so it sits with the
               * other view-state controls. */}
              <Button
                variant={editOnPage ? "default" : "outline"}
                size="sm"
                className="md:hidden h-7 w-7 p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={viewMode !== "preview"}
                onClick={() => setEditOnPage((v) => !v)}
                aria-pressed={editOnPage}
                title={
                  viewMode !== "preview"
                    ? "Switch to Preview to edit directly on the page"
                    : editOnPage
                      ? "Stop editing on page"
                      : "Edit directly on the rendered page"
                }
              >
                <Pencil className="size-3.5" />
              </Button>

              {/* Focus mode — hides both rails for distraction-free
               * working. Available in both Edit and Preview. Esc exits. */}
              <Button
                variant={focusMode ? "default" : "outline"}
                size="sm"
                className="hidden h-7 w-7 p-0"
                onClick={() => setFocusMode((f) => !f)}
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                title={
                  focusMode
                    ? "Exit focus mode (Esc)"
                    : "Focus mode — hide rails for distraction-free work"
                }
              >
                {focusMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
              {(() => {
                const pendingCount = draft.sections.filter((s) => s.pendingChange).length;
                if (pendingCount === 0) return null;

                const onRejectAll = () => {
                  const snap = draft.sections
                    .filter((s) => s.pendingChange)
                    .map((s) => ({ sectionId: s.id, pending: s.pendingChange! }));
                  useDraftStore.getState().rejectAllPending(draft.id);
                  toast(`${snap.length} pending ${snap.length === 1 ? "change" : "changes"} rejected`, {
                    action: {
                      label: "Undo",
                      onClick: () => {
                        const store = useDraftStore.getState();
                        snap.forEach(({ sectionId, pending }) =>
                          store.proposeSectionChange(draft.id, sectionId, pending)
                        );
                      },
                    },
                  });
                };

                const onAcceptAll = () => {
                  // Snapshot current html so undo can restore.
                  const snap = draft.sections
                    .filter((s) => s.pendingChange)
                    .map((s) => ({ sectionId: s.id, html: s.html, pending: s.pendingChange! }));
                  useDraftStore.getState().acceptAllPending(draft.id);
                  toast.success(`${snap.length} pending ${snap.length === 1 ? "change" : "changes"} accepted`, {
                    action: {
                      label: "Undo",
                      onClick: () => {
                        const store = useDraftStore.getState();
                        snap.forEach(({ sectionId, html, pending }) => {
                          store.updateSection(draft.id, sectionId, html);
                          store.proposeSectionChange(draft.id, sectionId, pending);
                        });
                      },
                    },
                  });
                };

                return (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)] text-[11px] text-[var(--ds-amber-fg)] font-medium">
                    <span>{pendingCount} pending</span>
                    <button
                      type="button"
                      onClick={onRejectAll}
                      className="hover:underline"
                      title="Reject every pending AI proposal"
                    >
                      Reject all
                    </button>
                    <span className="text-[var(--ds-amber-fg)]/50">·</span>
                    <button
                      type="button"
                      onClick={onAcceptAll}
                      className="hover:underline font-semibold"
                      title="Accept every pending AI proposal"
                    >
                      Accept all
                    </button>
                  </div>
                );
              })()}
              {globallyStreaming && (
                <span className="flex text-[12px] text-[var(--ds-muted)] items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Drafting…
                </span>
              )}
            </div>
          </div>

          {/* Column 3 — over the right rail / viewport-right on mobile.
           * People → ⋯ → primary CTA. (Pending/Drafting/Regenerate moved
           * into column 2 — the canvas column — so they sit above their
           * old secondary-toolbar positions.) */}
          <div className="ml-auto lg:ml-0 flex items-center gap-2 justify-end min-w-0 lg:px-4">
            <InvitePopover
              draft={draft}
              open={invitePopoverOpen}
              onOpenChange={setInvitePopoverOpen}
              trigger={
                identities.length > 0 ? (
                  <button
                    type="button"
                    className="hidden md:flex items-center gap-1 rounded-full pl-0.5 pr-1.5 py-0.5 -my-0.5 hover:bg-[var(--ds-line-2)] transition"
                    aria-label="People on this letter — click to manage or invite"
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
                    <span
                      className="grid place-items-center size-5 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)]"
                      aria-hidden
                    >
                      <UserPlus className="size-3" />
                    </span>
                  </button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:inline-flex px-2 sm:px-3"
                    aria-label="Invite"
                  >
                    <UserPlus className="size-3.5" />
                    <span className="hidden md:inline">Invite</span>
                  </Button>
                )
              }
            />
            {/* Mobile-only ⋯ overflow — on md:+ all these actions live in
             * the File/Tools/View menubar at the start of column 2. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden size-8" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                {/* Mobile-only: Invite people. On md:+ the trigger lives in
                 * the topbar so we hide this item to avoid duplication. */}
                <DropdownMenuItem
                  className="md:hidden"
                  onClick={() => setInvitePopoverOpen(true)}
                >
                  <UserPlus className="size-4 mr-2" /> Invite people…
                </DropdownMenuItem>
                <DropdownMenuSeparator className="md:hidden" />
                <DropdownMenuItem onClick={() => setEditDetailsOpen(true)}>
                  <Settings2 className="size-4 mr-2" /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAllCommentsOpen(true)}>
                  <MessageSquare className="size-4 mr-2" /> Comments
                  {(() => {
                    const n = (draft.comments ?? []).filter((c) => !c.resolved && !c.parentId).length;
                    return n > 0 ? (
                      <span className="ml-auto text-[10px] font-mono text-[var(--ds-muted)]">
                        {n}
                      </span>
                    ) : null;
                  })()}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimelineDialogOpen(true)}>
                  <Clock3 className="size-4 mr-2" /> Timeline
                </DropdownMenuItem>
                {/* Mobile-only: Focus toggle. On md:+ Focus has its own
                 * topbar button so we hide this item to avoid duplication. */}
                <DropdownMenuItem
                  className="md:hidden"
                  onClick={() => setFocusMode((f) => !f)}
                >
                  {focusMode ? (
                    <Minimize2 className="size-4 mr-2" />
                  ) : (
                    <Maximize2 className="size-4 mr-2" />
                  )}
                  {focusMode ? "Exit focus mode" : "Enter focus mode"}
                </DropdownMenuItem>
                {/* Regenerate all / Stop moved out of this menu — they live
                 * as a visible button in the topbar right cluster now. */}
                {/* Rail toggles — only meaningful at < lg where the rails
                 * are drawers. At lg+ both rails are persistent so these
                 * items would be no-ops; we hide them via Tailwind. */}
                <DropdownMenuSeparator className="lg:hidden" />
                <DropdownMenuItem
                  className="lg:hidden"
                  onClick={() => setShowSidebar((s) => !s)}
                >
                  <PanelLeft className="size-4 mr-2" /> Toggle sections rail
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="lg:hidden"
                  onClick={() => setShowRail((s) => !s)}
                >
                  <PanelRight className="size-4 mr-2" /> Toggle details rail
                </DropdownMenuItem>
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
            {/* Next step button — icon-only on mobile (just arrow) so the
             * other topbar items have room. Expands to "Next: Evidence"
             * / "Next: Review" at sm:+. */}
            {draft.mode === "employee" ? (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={() => nav(`/editor/${draft.id}/evidence${activeSectionId ? `?section=${activeSectionId}` : ""}`)}
                aria-label="Next: Evidence"
                title="Next: Evidence"
                className="px-2 sm:px-3"
              >
                <span className="hidden sm:inline">Evidence</span>
                <ArrowRight className="size-4 sm:ml-1.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={() => nav(`/editor/${draft.id}/review`)}
                aria-label="Next: Review"
                title="Next: Review"
                className="px-2 sm:px-3"
              >
                <span className="hidden sm:inline">Review</span>
                <ArrowRight className="size-4 sm:ml-1.5" />
              </Button>
            )}
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
          // Keep three tracks at lg:+ even when the rail is collapsed —
          // shrink the last track to 0px instead of removing it. Browsers
          // can interpolate grid-template-columns when track counts match,
          // so the column smoothly animates from 360px to 0px and the
          // canvas grows in lockstep. iOS-style easing matches the rest
          // of the editor's motion vocabulary.
          "lg:transition-[grid-template-columns] lg:duration-[280ms] lg:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:lg:transition-none " +
          (focusMode
            ? "lg:grid-cols-1"
            : railCollapsed
            ? "lg:grid-cols-[260px_minmax(0,1fr)_0px]"
            : "lg:grid-cols-[260px_minmax(0,1fr)_360px]")
        }
      >
        <aside
          className={
            "border-r border-[var(--ds-line)] bg-[var(--ds-surface)] min-h-0 flex flex-col overflow-hidden " +
            (focusMode
              ? "hidden"
              : showSidebar
              ? "absolute inset-y-0 left-0 z-40 w-[280px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:flex")
          }
        >
          <WizardSidebar
            draft={draft}
            current="edit"
            activeSectionId={activeSectionId}
            onSelectSection={(id) => {
              setActiveSectionId(id);
              setShowSidebar(false);
              const el = document.querySelector(`[data-section-id="${id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            disabled={globallyStreaming}
            secondaryTabLabel={
              draft.mode === "employee" ? "Rights" : "Compliance"
            }
            secondaryTab={
              draft.mode === "employee" ? (
                <EmployeeRail draft={draft} />
              ) : (
                <CompliancePanel draft={draft} />
              )
            }
          />
        </aside>

        <main className="flex flex-col bg-[var(--ds-canvas)] min-w-0 min-h-0 relative">
          {/* Secondary toolbar removed — its contents (DocumentPopover,
           * Edit/Preview toggle, pending pill, streaming indicator)
           * now live in the main topbar above. Regenerate-all is in
           * the ⋯ overflow menu. Canvas gets +36px of vertical space. */}

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
                editable={editOnPage}
                onEditableDone={() => setEditOnPage(false)}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6 space-y-3">
              {/* Editable title sits at the very top of the canvas, above
               * the disclaimer + sections. Click to rename — Google
               * Docs / Notion pattern. */}
              <EditableTitleBar draft={draft} />
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
                  onOpenCommentsThread={() => {
                    // Without an inline anchor, pop the floating panel
                    // at the section header's rect — a sensible default.
                    const sectionEl = document.querySelector<HTMLElement>(
                      `[data-section-id="${section.id}"]`
                    );
                    if (!sectionEl) return;
                    setFloatingComment({
                      anchor: {
                        getRect: () => sectionEl.getBoundingClientRect(),
                        containerEl: sectionEl,
                      },
                      // Open as new-thread mode for this section (most
                      // common reason to click the section's Comments
                      // button is to start one).
                      mode: { kind: "new", sectionId: section.id },
                    });
                  }}
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

        {/* Desktop right rail — inline, persistent. Hidden below lg: where
         * the bottom sheet handles things. Collapsible: when railCollapsed
         * is true the rail is removed from the grid entirely (canvas takes
         * full width) and a floating "Ask AI" pill in the bottom-right
         * brings it back — mobile-mirror pattern. */}
        {/* Desktop AI rail — rendered ONLY at lg:+. The mobile bottom
         * sheet below is hidden in this branch so there's exactly one
         * AIPanel (and one useChat instance) in the tree at any time.
         * Resizing across the breakpoint unmounts one and mounts the
         * other; conversation persists via draft.aiChat. */}
        {isLargeViewport && (
          <aside
            aria-hidden={railCollapsed || undefined}
            className={
              "flex flex-col min-h-0 overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)] " +
              "transition-opacity duration-200 ease-out motion-reduce:transition-none " +
              (focusMode ? "hidden" : "") +
              (railCollapsed ? " opacity-0 pointer-events-none" : " opacity-100")
            }
          >
            <RightRail
              draft={draft}
              tab={rightTab}
              onTabChange={setRightTab}
              pendingComment={pendingComment}
              onPendingCommentConsumed={() => setPendingComment(null)}
              activeSectionId={activeSectionId}
              onCollapse={() => setRailCollapsed(true)}
            />
          </aside>
        )}

        {/* Mobile AI overlay — slides in from the right edge of the
         * viewport, mirroring the desktop rail's location (just as a
         * full-screen overlay instead of an inline column). Replaces
         * the previous bottom-sheet pattern. Tap-scrim or chevron
         * closes. AnimatePresence + spring keeps motion consistent
         * with the rest of the app. */}
        <AnimatePresence>
          {!isLargeViewport && showRail && !focusMode && (
            <motion.aside
              key="mobile-ai-overlay"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 38,
                mass: 0.85,
              }}
              className="fixed inset-y-0 right-0 z-40 w-[min(420px,90vw)] bg-[var(--ds-surface)] border-l border-[var(--ds-line)] shadow-[-12px_0_32px_rgba(0,0,0,0.18)] flex flex-col"
            >
              <RightRail
                draft={draft}
                tab={rightTab}
                onTabChange={setRightTab}
                pendingComment={pendingComment}
                onPendingCommentConsumed={() => setPendingComment(null)}
                activeSectionId={activeSectionId}
                onCollapse={() => setShowRail(false)}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile scrim — always mounted, fades in/out with showSidebar
         * or showRail. pointer-events-none when invisible so taps fall
         * through to the canvas. */}
        <button
          type="button"
          className={
            "lg:hidden fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none " +
            (showSidebar || showRail
              ? "opacity-100"
              : "opacity-0 pointer-events-none")
          }
          aria-label="Close panel"
          aria-hidden={!(showSidebar || showRail) || undefined}
          tabIndex={!(showSidebar || showRail) ? -1 : undefined}
          onClick={() => {
            setShowSidebar(false);
            setShowRail(false);
          }}
        />

        {/* Floating "Ask AI" pill — MOBILE.
         * lg:hidden so it only shows below the bottom-sheet breakpoint.
         * Visible whenever the sheet is closed; fades + scales away
         * while it's open. */}
        {!focusMode && (
          <button
            type="button"
            onClick={() => {
              setRightTab("ai");
              setShowRail(true);
            }}
            className={
              "lg:hidden fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:opacity-90 active:scale-[0.98] " +
              "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none " +
              (showRail
                ? "opacity-0 scale-90 pointer-events-none"
                : "opacity-100 scale-100")
            }
            aria-label="Open AI agent"
            aria-hidden={showRail || undefined}
            tabIndex={showRail ? -1 : undefined}
          >
            <span className="grid place-items-center size-7 rounded-full bg-white/15">
              <Sparkles className="size-4" />
            </span>
            <span className="text-[13px] font-medium">Ask AI</span>
          </button>
        )}

        {/* Floating "Ask AI" pill — DESKTOP.
         * Framer Motion spring entry from the bottom-right corner when
         * railCollapsed flips true; reverse on expand. AnimatePresence
         * keeps the pill mounted for the exit transition. lg:+ only. */}
        <AnimatePresence>
          {!focusMode && railCollapsed && (
            <motion.button
              key="desktop-ask-ai"
              type="button"
              onClick={() => setRailCollapsed(false)}
              initial={{ opacity: 0, y: 24, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 28,
                mass: 0.7,
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="hidden lg:inline-flex fixed bottom-5 right-5 z-30 items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:opacity-95"
              aria-label="Open AI agent"
            >
              <span className="grid place-items-center size-7 rounded-full bg-white/15">
                <Sparkles className="size-4" />
              </span>
              <span className="text-[13px] font-medium">Ask AI</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Change A: floating comment panel — anchored to text marks
       * (existing thread) or selection rects (new thread). */}
      {floatingComment && (
        <FloatingCommentPanel
          draft={draft}
          anchor={floatingComment.anchor}
          mode={floatingComment.mode}
          onClose={() => setFloatingComment(null)}
        />
      )}

      {/* Change A: All-comments index dialog. Click a row to close the
       * dialog, scroll the canvas to the highlighted text, and open
       * the FloatingCommentPanel anchored to that mark. */}
      <Dialog.Root open={allCommentsOpen} onOpenChange={setAllCommentsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] flex flex-col">
            <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--ds-line-2)] shrink-0">
              <Dialog.Title className="m-0 text-[14px] font-semibold inline-flex items-center gap-2">
                <MessageSquare className="size-4 text-[var(--ds-muted)]" /> Comments
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Every unresolved comment thread in this draft. Click one to jump to it.
              </Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="size-7 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                  aria-label="Close comments"
                >
                  <ChevronLeft className="size-4 rotate-45" />
                </button>
              </Dialog.Close>
            </header>
            <div className="flex-1 min-h-0 overflow-auto">
              {(() => {
                const all = draft.comments ?? [];
                const roots = all.filter((c) => !c.parentId);
                const unresolved = roots.filter((c) => !c.resolved);
                const resolved = roots.filter((c) => c.resolved);
                if (roots.length === 0) {
                  return (
                    <div className="px-6 py-12 text-center text-[var(--ds-muted)] text-[13px]">
                      No comments yet. Highlight any text in the document and click <em>+ Comment</em> to start a thread.
                    </div>
                  );
                }
                const jumpTo = (commentId: string) => {
                  setAllCommentsOpen(false);
                  // Wait a frame so the dialog has unmounted before we
                  // open the floating panel — otherwise the dialog's
                  // overlay swallows the panel's outside-click guard.
                  requestAnimationFrame(() => onFocusComment(commentId));
                };
                return (
                  <div className="py-1">
                    {unresolved.length > 0 && (
                      <CommentGroup
                        label="Unresolved"
                        comments={unresolved}
                        draft={draft}
                        replyCounts={all}
                        onJump={jumpTo}
                      />
                    )}
                    {resolved.length > 0 && (
                      <CommentGroup
                        label="Resolved"
                        comments={resolved}
                        draft={draft}
                        replyCounts={all}
                        onJump={jumpTo}
                        muted
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Change A: Timeline dialog — moved out of the right rail into
       * an overflow-menu launched modal. */}
      <Dialog.Root open={timelineDialogOpen} onOpenChange={setTimelineDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[calc(100vw-2rem)] max-h-[80vh] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] flex flex-col">
            <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--ds-line-2)] shrink-0">
              <Dialog.Title className="m-0 text-[14px] font-semibold inline-flex items-center gap-2">
                <Clock3 className="size-4 text-[var(--ds-muted)]" /> Timeline
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Audit timeline of regenerations, exports, comments, and attestations on this draft.
              </Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="size-7 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                  aria-label="Close timeline"
                >
                  <ChevronLeft className="size-4 rotate-45" />
                </button>
              </Dialog.Close>
            </header>
            <div className="flex-1 min-h-0 overflow-auto">
              <TimelinePanel draft={draft} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
      {/* Show the label only on the active tab — the inactive one
       * collapses to icon-only so the pill stays compact, and the
       * selected mode reads clearly. */}
      {active && <span>{label}</span>}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * Index row for the All Comments dialog. Shows: section title (subtle),
 * the quoted span (italic, truncated), author + relative time, body
 * preview. Clicking the row dismisses the dialog and re-opens the
 * floating panel anchored to the thread's mark.
 */
function CommentGroup({
  label,
  comments,
  draft,
  replyCounts,
  onJump,
  muted,
}: {
  label: string;
  comments: Array<{
    id: string;
    sectionId: string;
    authorName: string;
    body: string;
    quote?: string;
    createdAt: number;
    resolved?: boolean;
  }>;
  draft: { sections: { id: string; title: string }[]; comments?: { parentId?: string }[] };
  replyCounts: Array<{ id: string; parentId?: string }>;
  onJump: (commentId: string) => void;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "opacity-60" : undefined}>
      <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-[var(--ds-muted)]">
        {label} · {comments.length}
      </div>
      {comments.map((c) => {
        const section = draft.sections.find((s) => s.id === c.sectionId);
        const replyN = replyCounts.filter((r) => r.parentId === c.id).length;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onJump(c.id)}
            className="w-full text-left px-4 py-3 border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-line-2)] transition group"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] text-[var(--ds-muted)] truncate">
                {section?.title ?? "Section"}
              </span>
              <span className="text-[10px] text-[var(--ds-subtle)] tabular-nums shrink-0">
                {commentRelTime(c.createdAt)}
              </span>
            </div>
            {c.quote && (
              <p className="text-[11.5px] italic text-[var(--ds-muted)] m-0 mb-1 truncate">
                "{c.quote}"
              </p>
            )}
            <p className="text-[12.5px] text-[var(--ds-ink)] m-0 line-clamp-2">
              <span className="font-medium">{c.authorName}:</span> {c.body}
            </p>
            {replyN > 0 && (
              <p className="text-[10.5px] text-[var(--ds-muted)] mt-1 m-0">
                {replyN} {replyN === 1 ? "reply" : "replies"}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function commentRelTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
