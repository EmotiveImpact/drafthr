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
  X,
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
import { toast } from "sonner";


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
    // First: scroll the highlighted text in the canvas into the top
    // portion of the viewport SO the comment anchor stays visible
    // ABOVE where the mobile bottom sheet will cover (sheet = 72vh
    // from bottom, so we target the top ~25% of the canvas).
    const anchor = document.querySelector<HTMLElement>(
      `mark[data-comment-id="${commentId}"]`
    );
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      // Briefly flash the anchor so the user catches where it lives.
      anchor.classList.add("ring-2", "ring-[var(--accent-9)]");
      setTimeout(
        () => anchor.classList.remove("ring-2", "ring-[var(--accent-9)]"),
        1600
      );
    }
    // Then open the sheet on the comments tab, with a small delay so
    // the canvas scroll has a head-start and the user perceives the
    // context BEFORE the sheet covers the lower half.
    setTimeout(() => {
      setRightTab("comments");
      setShowRail(true);
      requestAnimationFrame(() => {
        const threadEl = document.querySelector(`[data-comment-id="${commentId}"]:not(mark)`);
        threadEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }, 120);
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
            {/* Brand mark — links to /. Compact at this size so it reads as
             * "home" rather than a decorative logo. */}
            <Link
              to="/"
              aria-label="DRAFTHR home"
              className="shrink-0 rounded-md hover:opacity-80 transition px-1 grid place-items-center h-8"
            >
              <BrandMark size={32} />
            </Link>
            {/* Back-to-letters affordance — separate from the brand mark
             * so each has a single clear destination (D → home, ← Letters
             * → letters list). Shows arrow only < md, full "Letters" from md+. */}
            <button
              type="button"
              onClick={() => nav(backTo)}
              aria-label="Back to letters"
              className="flex items-center gap-1.5 min-w-0 group rounded-md hover:bg-[var(--ds-line-2)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] px-2 h-8 transition"
            >
              <ChevronLeft className="size-4 group-hover:-translate-x-0.5 transition" />
              <span className="hidden md:inline text-[13px] font-medium">
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

          {/* Column 2 — over the canvas. Tone (left), Edit/Preview
           * (centred), pending/drafting/regenerate (right). On lg+ this
           * sits directly above the canvas column so the items appear
           * where they used to on the secondary toolbar. Below lg this
           * inline-flows after the left cluster. */}
          <div className="relative flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 min-w-0 lg:px-3">
            {/* Left-of-canvas: writing controls grouped — Tone + Regenerate all.
             * Both are "shape the AI output" affordances, so they sit
             * together to the left of the Edit/Preview toggle. */}
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
                className="h-7 w-7 p-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="h-7 w-7 p-0"
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
            {/* Focus toggle moved into column 2 next to Edit/Preview —
             * it's a view-state affordance, not a per-user action, so it
             * belongs with the view toggle. Disabled outside Preview. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="More">
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
          (focusMode
            ? "lg:grid-cols-1"
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
            "min-h-0 lg:border-l lg:border-[var(--ds-line)] lg:bg-[var(--ds-surface)] " +
            (focusMode
              ? "hidden"
              : showRail
              ? // Mobile: bottom sheet (covers ~72vh, rounded top, soft shadow,
                //   swipe handle + tap-scrim dismiss). lg:+ stays inline.
                "fixed left-0 right-0 bottom-0 z-40 h-[72vh] bg-[var(--ds-surface)] " +
                "rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.18)] " +
                "lg:static lg:shadow-none lg:rounded-none lg:h-auto lg:w-auto " +
                "lg:bottom-auto lg:left-auto lg:right-auto " +
                "flex flex-col"
              : "hidden lg:block")
          }
        >
          {/* Mobile-only grab handle + close — affordances for the bottom
           * sheet. On lg:+ the rail is inline so we hide these. */}
          {showRail && (
            <div className="lg:hidden flex items-center justify-between pt-2 pb-1 px-3 border-b border-[var(--ds-line-2)] shrink-0">
              <span className="block h-1 w-10 rounded-full bg-[var(--ds-line)] mx-auto" />
              <button
                type="button"
                onClick={() => setShowRail(false)}
                className="absolute right-3 top-2 size-7 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)]"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <RightRail
              draft={draft}
              tab={rightTab}
              onTabChange={setRightTab}
              pendingComment={pendingComment}
              onPendingCommentConsumed={() => setPendingComment(null)}
              activeSectionId={activeSectionId}
            />
          </div>
        </aside>

        {/* Mobile scrim — left sidebar still slides from the side; right
         * rail is a bottom sheet now, but scrim still tap-dismisses both. */}
        {(showSidebar || showRail) && (
          <button
            type="button"
            className="lg:hidden fixed inset-0 z-30 bg-black/30"
            aria-label="Close panel"
            onClick={() => {
              setShowSidebar(false);
              setShowRail(false);
            }}
          />
        )}

        {/* Floating AI button — mobile-only, visible when the bottom sheet
         * is closed and we're not in focus mode. Tap opens the sheet on
         * the AI tab. Sits above the scrim z-index but below the sheet. */}
        {!focusMode && !showRail && (
          <button
            type="button"
            onClick={() => {
              setRightTab("ai");
              setShowRail(true);
            }}
            className="lg:hidden fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:opacity-90 active:scale-[0.98] transition"
            aria-label="Open AI agent"
          >
            <span className="grid place-items-center size-7 rounded-full bg-white/15">
              <Sparkles className="size-4" />
            </span>
            <span className="text-[13px] font-medium">Ask AI</span>
          </button>
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
      <span>{label}</span>
    </button>
  );
}
