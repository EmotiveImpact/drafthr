import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { PagedlyDocEditor } from "@/components/editor/paged-edit/PagedlyDocEditor";
import type { PagedEditorActions } from "@/components/editor/paged-edit/types";
import { RetryBanner, type RetryEvent } from "@/components/editor/RetryBanner";
import { InlineSuggestionBanner } from "@/components/editor/InlineSuggestionBanner";
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
  Clock3,
  MessageSquare,
  Wand2,
  FileDown,
  Search,
  TextSelect,
  Undo2,
  Redo2,
  Paperclip,
  BookmarkPlus,
  Send,
  CheckCircle2,
  MessageSquareWarning,
  Smartphone,
  Undo,
  Lightbulb,
} from "lucide-react";
import { generateAllSections, regenerateSection } from "@/lib/llm/draft";
import type { Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { BrandMark, AvatarStack } from "@/components/ds";
import { Wordmark } from "@/components/ds/Wordmark";
import { useProfileStore } from "@/lib/profile";
import { listIdentities, meIdentity } from "@/lib/comments/identity";
import { SuggestEditDialog } from "@/components/editor/SuggestEditDialog";
import { uid } from "@/lib/utils";
import { InvitePopover } from "@/components/editor/InvitePopover";
import { RefineDialog } from "@/components/editor/RefineDialog";
import { EditDetailsSheet } from "@/components/editor/EditDetailsSheet";
import { FloatingCommentPanel, type FloatingAnchor } from "@/components/editor/FloatingCommentPanel";
import { TimelinePanel } from "@/components/editor/TimelinePanel";
import { EvidenceDrawer } from "@/components/editor/EvidenceDrawer";
import { SaveAsTemplateModal } from "@/components/templates/SaveAsTemplateModal";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { canApprove, canSubmitForReview, canEditDraft } from "@/lib/permissions";
import { MatterEmployeeChips } from "@/components/editor/MatterEmployeeChips";
import { MobileShareDialog } from "@/components/editor/MobileShareDialog";
import { TemplateSourceBanner } from "@/components/editor/TemplateSourceBanner";
import {
  EvidenceHandoff,
  evaluateEvidenceHandoff,
  type EvidenceHandoffReason,
} from "@/components/editor/EvidenceHandoff";
import { deriveEvidenceTier } from "@/lib/letters/templates";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { todayDateOnly } from "@/lib/date-only";
import { useIsLargeViewport } from "@/lib/use-large-viewport";


/* ---------------------------------------------------------------------------
 * Unified dock persistence — per-draft, localStorage-backed.
 *
 * We store the full `pinnedDock` value ("evidence" | "ai") under the key
 * `drafthr.pinnedDock:{draftId}`. Absence means null (neither dock pinned).
 * Heavy-tier drafts default to "evidence" on first open when no stored pref
 * exists (same auto-pin behaviour as before).
 *
 * The old `scribehr-evidence-pinned:{draftId}` boolean key is no longer
 * written. Existing entries in localStorage are harmless orphans.
 * ------------------------------------------------------------------------ */
const DOCK_KEY = (draftId: string) => `drafthr.pinnedDock:${draftId}`;

export function Editor() {
  const { draftId } = useParams<{ draftId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const profile = useProfileStore((s) => s.profile);
  const updateSection = useDraftStore((s) => s.updateSection);
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [globallyStreaming, setGloballyStreaming] = useState(false);
  const [historySection, setHistorySection] = useState<Section | null>(null);
  const [suggestSection, setSuggestSection] = useState<Section | null>(null);
  const [retryEvent, setRetryEvent] = useState<RetryEvent | null>(null);
  // Export was moved to the Review step — no pending-export state lives in
  // the editor anymore. Kept the type alias below for any future surface
  // that needs to type a format string.
  const [showSidebar, setShowSidebar] = useState(false);
  // Controls the AI drawer (Sheet overlay) — independent of pin state.
  // When `pinnedDock === "ai"`, the AI rail mounts inline in the grid and
  // this state is irrelevant. When `pinnedDock !== "ai"`, this controls
  // whether the AI slides in as a Sheet overlay (scrim, full-height) on
  // top of the content.
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
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
  const [counselDialogOpen, setCounselDialogOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  // "Open on mobile" share dialog — shows the `/m/:draftId` link with
  // copy / open affordances. Surfaced from the File menu.
  const [mobileShareOpen, setMobileShareOpen] = useState(false);
  // Approval-workflow modal — null when closed, otherwise drives the
  // submit / approve / request-changes dialog. Same shell, three kinds.
  const [reviewDialogKind, setReviewDialogKind] = useState<ReviewDialogKind | null>(null);
  // Read-only "Review feedback" panel toggled by the changes_requested pill.
  const [reviewFeedbackOpen, setReviewFeedbackOpen] = useState(false);
  // Unified dock state. `pinnedDock` is the single source of truth for which
  // dock (if any) is mounted as the full-height right rail. Mutually exclusive.
  // Lazy initialiser reads from localStorage on first mount so the correct
  // dock is shown immediately — no flash of the unpinned state.
  const [pinnedDock, setPinnedDock] = useState<"evidence" | "ai" | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(`drafthr.pinnedDock:${draft?.id ?? draftId}`);
      return raw === "evidence" || raw === "ai" ? raw : null;
    } catch {
      return null;
    }
  });

  // Imperative helper: collapse/expand the AI surface. Used by auto-collapse
  // effects (preview, edit-on-page) and the focus-mode AI bar.
  const setRailCollapsed = (next: boolean) => {
    if (next) {
      // collapse: close drawer + unpin
      setAiDrawerOpen(false);
      setPinnedDock((prev) => (prev === "ai" ? null : prev));
    } else {
      // expand: open as drawer (NOT pin)
      setAiDrawerOpen(true);
    }
  };

  const pinEvidence = () => setPinnedDock("evidence");
  const pinAI = () => setPinnedDock("ai");
  const unpinAll = () => setPinnedDock(null);

  // Derived: evidence is pinned when pinnedDock === "evidence".
  const evidencePinned = pinnedDock === "evidence";

  /* ----------------------- Evidence drawer + pinned state -----------------
   * Two modes:
   *   - Floating drawer (Sheet overlay) — default for routine letters.
   *   - Pinned rail — replaces the AI agent rail. Auto-enabled for "heavy"
   *     evidence-tier templates (grievance, harassment, tribunal) on first
   *     visit, persisted per draft thereafter.
   * Pin state is localStorage-backed via DOCK_KEY(draftId).
   * --------------------------------------------------------------------- */
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);

  // Keep localStorage in sync whenever pinnedDock changes — regardless of
  // which helper changed it (pinEvidence, pinAI, unpinAll).
  useEffect(() => {
    if (!draftId) return;
    if (typeof window === "undefined") return;
    const key = DOCK_KEY(draftId);
    try {
      if (pinnedDock) {
        window.localStorage.setItem(key, pinnedDock);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // localStorage may be unavailable (private mode, quota) — non-fatal.
    }
  }, [draftId, pinnedDock]);

  const handlePinnedChange = (next: boolean) => {
    if (next) {
      pinEvidence();
      // Pinning also implicitly closes the floating drawer since the same
      // surface is now permanent.
      setEvidenceDrawerOpen(false);
    } else {
      unpinAll();
    }
  };

  // Handoff modal state — shown when the user clicks Review and a soft
  // evidence check trips. Lives at the editor level so we can swap the
  // CTA's onClick handler.
  const [handoffReason, setHandoffReason] = useState<EvidenceHandoffReason | null>(
    null
  );
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

  // Abort any in-flight AI stream when the editor unmounts (e.g. the user
  // navigates to another draft or leaves the editor). Without this, an
  // orphaned stream keeps calling appendToSection against the store after the
  // component is gone, and — because the auto-generate gate uses local
  // `globallyStreaming` which resets on remount — a remount could start a
  // SECOND generation loop that interleaves with the orphan and corrupts
  // section HTML. (Partial fix for E1: the remaining half is to gate
  // auto-generate on store-derived streaming state — tracked in BUGS_AND_FIXES.)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const meta = useMemo(
    () => (draft ? getLetterMeta(draft.letterType) : null),
    [draft]
  );

  // Auto-generate on first visit if all sections are empty.
  useEffect(() => {
    if (!draft) return;
    const allEmpty = draft.sections.every((s) => s.status === "empty" && !s.html);
    // Re-entry guard (E1b): also gate on STORE-derived streaming state, not
    // just the local `globallyStreaming` flag. Local state resets to false on
    // every mount, so navigating A→B→A while A's first generation is still in
    // flight would otherwise re-enter runGenerateAll and start a second loop.
    // The store survives remounts, so a section already "streaming" blocks the
    // re-entry. (Strictly additive — a genuinely fresh draft has no streaming
    // section, so first-generation is never blocked.)
    const alreadyStreaming = draft.sections.some((s) => s.status === "streaming");
    if (allEmpty && !globallyStreaming && !alreadyStreaming) {
      void runGenerateAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // On draft change, restore pinnedDock from the unified localStorage key.
  // Falls back to tier-based default when no stored pref exists (heavy drafts
  // auto-pin Evidence on first open). The lazy useState initialiser handles
  // first mount; this effect handles subsequent draft changes in the same session.
  //
  // We compute the next value once and issue a single setPinnedDock call to
  // avoid the double-render flicker that occurred when the previous version
  // could queue two separate setState calls (one for the localStorage read,
  // one for the tier fallback).
  useEffect(() => {
    if (!draftId) return;
    if (typeof window === "undefined") return;
    let next: "evidence" | "ai" | null = null;
    try {
      const raw = window.localStorage.getItem(DOCK_KEY(draftId));
      if (raw === "evidence" || raw === "ai") {
        next = raw;
      } else if (draft?.evidenceTier === "heavy") {
        next = "evidence";
      }
    } catch {
      // Fallback to tier-based default if localStorage unavailable
      if (draft?.evidenceTier === "heavy") next = "evidence";
    }
    setPinnedDock(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Reset ALL draft-scoped UI state when navigating to a different draft — the
  // Editor instance persists across drafts (key="editor"), so anything carrying
  // the previous draft's ids would target the wrong draft: a stale history/refine
  // section, a floating comment that would save against draft A's section id in
  // draft B, or a leftover "preview" viewMode driving a blank-page auto-generate
  // on a fresh draft. (Drains the R16 stale-state class rather than per-symptom.)
  useEffect(() => {
    setHistorySection(null);
    setActiveSectionId(null);
    setFloatingComment(null);
    setPendingComment(null);
    setRefineSectionId(null);
    setReviewFeedbackOpen(false);
    setViewMode("edit");
  }, [draftId]);

  // Auto-open the floating evidence drawer when arriving with ?openEvidence=1
  // (used by the legacy /editor/:draftId/evidence redirect so old bookmarks
  // land on something useful). Clears the query param after consumption so a
  // refresh doesn't re-open the drawer indefinitely.
  useEffect(() => {
    if (searchParams.get("openEvidence") !== "1") return;
    if (evidencePinned) {
      // Pinned rail is already showing — nothing to "open". Just clear the param.
    } else {
      setEvidenceDrawerOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("openEvidence");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, evidencePinned]);

  // Jump to a specific section when arriving with ?section=<id> — the Review
  // step's "Fix this first" CTA links here (/editor/:id?section=<id>). Focus +
  // scroll to it in the Sections view, then clear the param so a refresh doesn't
  // re-jump. Without this the CTA silently landed at the top of the letter.
  useEffect(() => {
    const sectionId = searchParams.get("section");
    if (!sectionId) return;
    if (!draft?.sections.some((s) => s.id === sectionId)) return; // not this draft (yet)
    setViewMode("edit"); // scrolling targets the Sections canvas
    setActiveSectionId(sectionId);
    const t = setTimeout(() => {
      document
        .querySelector(`[data-section-id="${sectionId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    const next = new URLSearchParams(searchParams);
    next.delete("section");
    setSearchParams(next, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, draft]);

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
        // Only open the drawer when AI is not already pinned as the inline
        // rail. Setting aiDrawerOpen while pinnedDock==="ai" would leave a
        // ghost true value that causes the scrim + drawer overlay to appear
        // the moment the user later unpins — without any deliberate action.
        if (pinnedDock !== "ai") {
          setAiDrawerOpen(true);
        }
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
  }, [focusMode, pinnedDock]);

  // Auto-collapse the AI rail when the user switches into the Page view —
  // the full-width "see the actual letter" mode where the AI rail just steals
  // page width. Doesn't auto-expand on exit — if the user later wants AI back,
  // they tap the Ask AI pill, and that intent should stick.
  useEffect(() => {
    if (viewMode === "preview") setRailCollapsed(true);
  }, [viewMode]);

  // Imperative handle into the PagedEditor for the top File / Edit /
  // Tools menubar. PagedEditor populates this on mount, nulls it on
  // unmount. Read every menu click — never cache.
  const pagedEditorActionsRef = useRef<PagedEditorActions | null>(null);

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
    // Store-derived re-entry guard (E1b): a section left "streaming" by an
    // in-flight generation (e.g. from another mount of this draft) blocks a
    // duplicate run that would interleave appendToSection writes.
    if (draft.sections.some((s) => s.status === "streaming")) return;
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
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : "Unknown error. Please try again.",
        action: { label: "Retry", onClick: () => void runGenerateAll() },
      });
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
      toast.error("Regeneration failed", {
        description: err instanceof Error ? err.message : "Unknown error. Please try again.",
      });
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

  // Template-source save: when isTemplateSource, the primary CTA writes
  // the current draft's section html + answers into a CustomTemplate.
  // First save creates the row; subsequent saves update in place via
  // templateSourceId so we never duplicate.
  const saveTemplateSource = () => {
    if (!draft.isTemplateSource) return;
    const answersRec = draft.answers as Record<string, unknown>;
    const templateName =
      (answersRec._templateName as string | undefined)?.trim() ||
      draft.title?.trim() ||
      meta?.shortTitle ||
      "Untitled template";
    const templateDescription = answersRec._templateDescription as string | undefined;
    const sectionHtml: Partial<Record<import("@/lib/letters/types").SectionId, string>> = {};
    for (const sec of draft.sections) {
      if (sec.html.trim().length === 0) continue;
      sectionHtml[sec.sectionId] = sec.html;
    }
    const store = useDraftStore.getState();
    const myTemplatesUrl =
      (draft.mode === "employer" ? "/hr/new" : "/me/new") + "?tab=mine";
    if (draft.templateSourceId && store.customTemplates[draft.templateSourceId]) {
      store.updateCustomTemplate(draft.templateSourceId, {
        name: templateName,
        description: templateDescription,
        baseLetterType: draft.letterType,
        mode: draft.mode,
        jurisdiction: draft.context.jurisdiction,
        sectionHtml,
        answers: draft.answers,
      });
    } else {
      const newId = store.createCustomTemplate({
        name: templateName,
        description: templateDescription,
        baseLetterType: draft.letterType,
        mode: draft.mode,
        jurisdiction: draft.context.jurisdiction,
        sectionHtml,
        answers: draft.answers,
      });
      const next = { ...store.drafts[draft.id], templateSourceId: newId, updatedAt: Date.now() };
      useDraftStore.setState({ drafts: { ...store.drafts, [draft.id]: next } });
    }
    toast.success("Template saved", {
      action: { label: "Open My Templates", onClick: () => nav(myTemplatesUrl) },
    });
  };

  const discardTemplateSource = () => {
    if (!draft.isTemplateSource) return;
    const ok = window.confirm(
      "Discard this template and any saved version? This can't be undone."
    );
    if (!ok) return;
    const store = useDraftStore.getState();
    if (draft.templateSourceId) store.deleteCustomTemplate(draft.templateSourceId);
    const targetUrl =
      (draft.mode === "employer" ? "/hr/new" : "/me/new") + "?tab=mine";
    store.deleteDraft(draft.id);
    nav(targetUrl);
  };

  const backTo = draft.mode === "employer" ? "/hr" : draft.mode === "employee" ? "/me" : "/";
  const identities = listIdentities(draft, profile);

  // Approval workflow — status pill + dialog gating off the workspace role.
  const reviewStatus = draft.reviewStatus ?? "draft";
  const role = profile.workspaceRole;
  const canvasEditable = canEditDraft(role, reviewStatus);
  const latestChangesRequest = (draft.approvals ?? [])
    .slice()
    .reverse()
    .find((a) => a.decision === "changes_requested");

  const onReviewSubmit = (input: { reviewerName: string; body: string; reviewerUserId?: string }) => {
    if (!reviewDialogKind) return;
    const store = useDraftStore.getState();
    if (reviewDialogKind === "submit") {
      store.submitForReview(draft.id, input.reviewerName, input.body);
      // Best-effort email to the picked workspace reviewer (fire-and-forget;
      // the server validates membership + soft-fails without Resend).
      if (input.reviewerUserId) {
        notifyReviewRequested(draft.id, input.reviewerUserId, input.body || undefined);
      }
      toast.success("Submitted for approval");
    } else if (reviewDialogKind === "approve") {
      store.approveDraft(draft.id, input.reviewerName, input.body);
      toast.success("Draft approved");
    } else if (reviewDialogKind === "request_changes") {
      store.requestChanges(draft.id, input.reviewerName, input.body);
      toast("Changes requested");
    }
  };

  const onWithdrawForReview = () => {
    useDraftStore.getState().withdrawForReview(draft.id);
    toast("Withdrawn from review");
  };

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
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30">
        {/* Topbar grid mirrors the body grid below it on lg+:
         *   [300px left rail]  [1fr canvas]  [360px right rail]
         * So the migrated secondary-toolbar items (Tone, Edit/Preview,
         * pending/drafting/regen) sit DIRECTLY ABOVE their old positions
         * over the canvas column, not jammed into the viewport-wide
         * left/right clusters. Below lg the rails are drawers and the
         * grid collapses to a single flex row. */}
        <div className="relative h-full flex items-center gap-2 sm:gap-3 px-2 sm:px-4 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:gap-0 lg:px-0">
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
              className="shrink-0 flex items-center gap-2 rounded-md hover:bg-[var(--ds-line-2)] transition px-1.5 py-1 -mx-1.5 h-10"
            >
              <BrandMark size={36} />
              <Wordmark size={16} className="hidden sm:inline" />
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
                  {/* Approval-workflow actions — items vary by status + role.
                   * Hidden for template-source drafts (no review needed). */}
                  {!draft.isTemplateSource && (
                    <>
                      <DropdownMenuSeparator />
                      {reviewStatus === "draft" && canSubmitForReview(role) && (
                        <DropdownMenuItem onClick={() => setReviewDialogKind("submit")}>
                          <Send className="size-4 mr-2" /> Submit for approval…
                        </DropdownMenuItem>
                      )}
                      {reviewStatus === "changes_requested" && canSubmitForReview(role) && (
                        <DropdownMenuItem onClick={() => setReviewDialogKind("submit")}>
                          <Send className="size-4 mr-2" /> Re-submit for approval…
                        </DropdownMenuItem>
                      )}
                      {reviewStatus === "in_review" && (
                        <>
                          <DropdownMenuItem onClick={onWithdrawForReview}>
                            <Undo className="size-4 mr-2" /> Withdraw from review
                          </DropdownMenuItem>
                          {canApprove(role) && (
                            <>
                              <DropdownMenuItem onClick={() => setReviewDialogKind("approve")}>
                                <CheckCircle2 className="size-4 mr-2" /> Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setReviewDialogKind("request_changes")}>
                                <MessageSquareWarning className="size-4 mr-2" /> Request changes…
                              </DropdownMenuItem>
                            </>
                          )}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => nav(`/editor/${draft.id}/review`)}
                      >
                        <FileDown className="size-4 mr-2" /> Export…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSaveAsTemplateOpen(true)}>
                        <BookmarkPlus className="size-4 mr-2" /> Save as template…
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setMobileShareOpen(true)}
                    data-testid="open-on-mobile-menu-item"
                  >
                    <Smartphone className="size-4 mr-2" /> Open on mobile…
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

              {/* Edit menu — only meaningful in edit-on-page mode. Items
               * dispatch through the PagedEditor's actionsRef so the
               * menubar drives whatever editor is mounted. Greyed out
               * when not in edit-on-page since the actions wouldn't
               * have anything to act on. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md text-[12px] font-medium text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
                  >
                    Edit
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  <DropdownMenuItem
                    disabled={viewMode !== "preview"}
                    onClick={() => pagedEditorActionsRef.current?.undo()}
                  >
                    <Undo2 className="size-4 mr-2" /> Undo
                    <span className="ml-auto text-[10px] text-[var(--ds-muted)]">⌘Z</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={viewMode !== "preview"}
                    onClick={() => pagedEditorActionsRef.current?.redo()}
                  >
                    <Redo2 className="size-4 mr-2" /> Redo
                    <span className="ml-auto text-[10px] text-[var(--ds-muted)]">⌘⇧Z</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={viewMode !== "preview"}
                    onClick={() => pagedEditorActionsRef.current?.selectAll()}
                  >
                    <TextSelect className="size-4 mr-2" /> Select all
                    <span className="ml-auto text-[10px] text-[var(--ds-muted)]">⌘A</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={viewMode !== "preview"}
                    onClick={() => pagedEditorActionsRef.current?.openFind()}
                  >
                    <Search className="size-4 mr-2" /> Find in letter…
                    <span className="ml-auto text-[10px] text-[var(--ds-muted)]">⌘F</span>
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
                    Sections
                    {viewMode === "edit" && (
                      <span className="ml-auto text-[10px]">✓</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewMode("preview")}>
                    <Eye className="size-4 mr-2" />
                    Page
                    {viewMode === "preview" && (
                      <span className="ml-auto text-[10px]">✓</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
                    onClick={() => setAiDrawerOpen((s) => !s)}
                  >
                    <PanelRight className="size-4 mr-2" /> AI rail
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* Approval-workflow pill — visible when the draft is in any
             * non-draft state, OR when a reviewer is acting. Click on
             * "changes_requested" pops the feedback panel. */}
            {reviewStatus !== "draft" && (
              <button
                type="button"
                onClick={() => {
                  if (reviewStatus === "changes_requested") setReviewFeedbackOpen(true);
                }}
                disabled={reviewStatus !== "changes_requested"}
                className={
                  "inline-flex items-center gap-1 ml-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 transition " +
                  (reviewStatus === "approved"
                    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] border-[var(--ds-green-bg)]"
                    : reviewStatus === "in_review"
                      ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border-[var(--ds-amber-bg)]"
                      : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)] border-[var(--ds-red-bg)] hover:brightness-95 cursor-pointer")
                }
                title={
                  reviewStatus === "approved"
                    ? "Draft approved — ready to send"
                    : reviewStatus === "in_review"
                      ? "Awaiting reviewer sign-off"
                      : "Reviewer requested changes — click to read feedback"
                }
              >
                {reviewStatus === "approved" ? (
                  <CheckCircle2 className="size-3" />
                ) : reviewStatus === "in_review" ? (
                  <Send className="size-3" />
                ) : (
                  <MessageSquareWarning className="size-3" />
                )}
                <span className="hidden md:inline">
                  {reviewStatus === "approved"
                    ? "Approved"
                    : reviewStatus === "in_review"
                      ? "In review"
                      : "Changes requested"}
                </span>
              </button>
            )}
            {/* Counsel-review pill — only on high-risk letters or where the
             * letter type's metadata flags counsel review as required. */}
            {(meta.legalReviewRequired || meta.riskClass === "high") && (
              <button
                type="button"
                onClick={() => setCounselDialogOpen(true)}
                className={
                  "inline-flex items-center gap-1 ml-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 transition hover:brightness-95 cursor-pointer " +
                  (counselReview
                    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] border-[var(--ds-green-bg)]"
                    : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border-[var(--ds-amber-bg)]")
                }
                title={
                  counselReview
                    ? `Counsel-reviewed by ${counselReview.reviewedBy} on ${counselReview.reviewedOn}. Click to update.`
                    : "Counsel review required before export. Click to mark reviewed."
                }
              >
                <ShieldCheck className="size-3" />
                <span className="hidden md:inline">{counselReview ? "Reviewed" : "Needs review"}</span>
              </button>
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
              <ViewModeButton mode="edit" current={viewMode} setMode={setViewMode} icon={<FileEdit className="size-3.5" />} label="Sections" />
              <ViewModeButton mode="preview" current={viewMode} setMode={setViewMode} icon={<Eye className="size-3.5" />} label="Page" />
            </div>

            {/* Right-of-canvas: Edit-on-page + Focus + pending pill +
             * Drafting indicator. ml-auto pushes them to the right edge
             * of the canvas column. */}
            <div className="ml-auto flex items-center gap-2">
              {/* Focus mode lives in the View menu (+ Esc to exit); the old
               * always-hidden header button here was dead and was removed. */}
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
                  // Snapshot the CANONICAL pre-diff html so undo can restore.
                  // In inline diff mode s.html already carries the staged
                  // <ins>/<del> marks — restoring that and re-diffing it would
                  // garble the marks. pendingChange.prevHtml is the clean text
                  // captured before the diff was staged; prefer it.
                  const snap = draft.sections
                    .filter((s) => s.pendingChange)
                    .map((s) => ({
                      sectionId: s.id,
                      html: s.pendingChange!.prevHtml ?? s.html,
                      pending: s.pendingChange!,
                    }));
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
           * People/Invite → Evidence → ⋯ → primary CTA.
           * (Pending/Drafting/Regenerate moved into column 2.) */}
          <div className="ml-auto lg:ml-0 flex items-center gap-2 justify-end min-w-0 lg:px-4">
            {/* People / Invite — AvatarStack is the trigger when
             * collaborators exist; otherwise a plain Invite button. */}
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
            {/* Evidence button — primary discoverability path for the
             * hybrid drawer. Tap to toggle the floating drawer; when
             * pinned, this tap focuses the rail (which is always visible).
             * Amber-tinted when there's evidence, muted when zero. Filled
             * dark when the drawer is open OR pinned. */}
            {(() => {
              const evidenceCount = draft.evidence?.length ?? 0;
              const hasEvidence = evidenceCount > 0;
              const active = evidenceDrawerOpen || evidencePinned;
              const onClick = () => {
                if (evidencePinned) {
                  // Focus the pinned rail — scroll-into-view + focus the
                  // search input so keyboard users land somewhere useful.
                  const search = document.querySelector<HTMLInputElement>(
                    '[data-evidence-rail] input[type="search"]'
                  );
                  search?.focus();
                  return;
                }
                setEvidenceDrawerOpen((v) => !v);
              };
              return (
                <button
                  type="button"
                  onClick={onClick}
                  aria-pressed={active}
                  aria-label={
                    evidencePinned
                      ? "Focus pinned evidence rail"
                      : evidenceDrawerOpen
                      ? "Close evidence drawer"
                      : "Open evidence drawer"
                  }
                  title={
                    evidencePinned
                      ? "Evidence is pinned — focus the rail"
                      : "Open evidence drawer (Pin → for a permanent rail)"
                  }
                  className={
                    "inline-flex items-center gap-1.5 h-7 transition shrink-0 rounded-md border " +
                    (hasEvidence ? "px-2" : "w-7 justify-center") +
                    " " +
                    (active
                      ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
                      : hasEvidence
                      ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border-[var(--ds-amber-fg)]/25 hover:border-[var(--ds-amber-fg)]/50"
                      : "bg-transparent text-[var(--ds-muted)] border-[var(--ds-line)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]")
                  }
                >
                  <Paperclip className="size-3.5" />
                  {hasEvidence && (
                    <span
                      className={
                        "tabular-nums text-[10px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center " +
                        (active
                          ? "bg-white/20 text-white"
                          : "bg-white/70 text-[var(--ds-amber-fg)]")
                      }
                    >
                      {evidenceCount}
                    </span>
                  )}
                </button>
              );
            })()}
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
                  onClick={() => setAiDrawerOpen((s) => !s)}
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
             * Hybrid evidence: the dedicated Evidence step is gone; both
             * modes go Edit → Review. The handoff card below the CTA gates
             * the transition when evidence is missing / unused.
             *
             * Template-source drafts replace this with Save template — the
             * editor IS the template authoring surface for these. */}
            {draft.isTemplateSource ? (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={saveTemplateSource}
                aria-label="Save template"
                title="Save template"
                className="px-2 sm:px-3"
              >
                <BookmarkPlus className="size-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Save template</span>
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={globallyStreaming}
                onClick={() => {
                  // Soft check — opens the handoff card only when the
                  // soft-rule trips. Light tier always proceeds; if the user
                  // hit "Don't ask for this draft", proceed silently too.
                  const tier = draft.evidenceTier ?? deriveEvidenceTier(draft.letterType);
                  const reason = evaluateEvidenceHandoff(draft, tier);
                  if (reason) {
                    setHandoffReason(reason);
                    return;
                  }
                  nav(`/editor/${draft.id}/review`);
                }}
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
          // The 3rd grid column is only non-zero when AI is pinned inline.
          // In drawer mode the AI overlay is fixed-position (doesn't take
          // grid space), so the canvas always gets the full remaining width
          // until the user pins. Evidence pinned uses the same 360px slot.
          "lg:transition-[grid-template-columns] lg:duration-[360ms] lg:ease-out motion-reduce:lg:transition-none " +
          (focusMode
            ? "lg:grid-cols-1"
            : pinnedDock !== null
            ? "lg:grid-cols-[300px_minmax(0,1fr)_360px]"
            : "lg:grid-cols-[300px_minmax(0,1fr)_0px]")
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
                  setAiDrawerOpen(true);
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
            // The Page view IS the pagedly editor (editable) — you land here
            // directly, no read-only intermediate. Read-only when the draft
            // can't be edited (review lock) OR while any AI generation is
            // streaming — pagedly holds a mount-time snapshot, so editing on
            // the page mid-stream would fight the still-updating store.
            <PagedlyDocEditor
              draft={draft}
              readOnly={
                !canvasEditable ||
                globallyStreaming ||
                draft.sections.some((s) => s.status === "streaming")
              }
              actionsRef={pagedEditorActionsRef}
            />
          ) : (
            <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6 space-y-3">
              {/* Matter breadcrumb + linked-employee chip — render above
               * the title when the draft is linked to either. Both are
               * subtle pill chips that link out to their respective pages. */}
              {!draft.isTemplateSource && <MatterEmployeeChips draft={draft} />}
              {draft.isTemplateSource && (
                <TemplateSourceBanner draft={draft} onDiscard={discardTemplateSource} />
              )}
              {/* Editable title sits at the very top of the canvas, above
               * the disclaimer + sections. Click to rename — Google
               * Docs / Notion pattern. */}
              <EditableTitleBar draft={draft} />
              <InlineDisclaimer draft={draft} />
              {/* Read-only-during-review banner. Surfaces when the viewer is
               * acting as a reviewer on a draft they cannot edit. Keeps the
               * lock state discoverable rather than mysterious. */}
              {!canvasEditable && reviewStatus === "in_review" && (
                <div className="rounded-md border border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] text-[12.5px] px-3 py-2 flex items-center gap-2">
                  <Send className="size-3.5 shrink-0" />
                  <span className="leading-snug">
                    Read-only during review. Comment or decide on the Review step; the drafter edits once a decision is made.
                  </span>
                </div>
              )}
              {!canvasEditable && reviewStatus === "approved" && (
                <div className="rounded-md border border-[var(--ds-green-fg)]/30 bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] text-[12.5px] px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span className="leading-snug">Approved — canvas locked. Clear to export.</span>
                </div>
              )}
              <DeadlineBanner draft={draft} />
              <RetryBanner event={retryEvent} />
              {/* Inline-diff banner — shows N pending track-changes marks
               * with Accept all / Reject all + a one-click toggle between
               * inline diff (default) and the legacy card view. Returns
               * null when no section has pending suggestions. */}
              <InlineSuggestionBanner draft={draft} />
              {draft.sections.map((section) => (
                <div key={section.id}>
                <SectionEditor
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
                  editable={canvasEditable}
                />
                {/* Reviewer "Suggest an edit" — only when the canvas is locked
                 * for this reviewer during review, and the section isn't
                 * already carrying a pending suggestion. Opens a separate
                 * composer; the proposal comes back as an attributed diff. */}
                {!canvasEditable && reviewStatus === "in_review" && !section.pendingChange && section.status !== "streaming" && (
                  <div className="mt-1 mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSuggestSection(section)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 h-7 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                    >
                      <Lightbulb className="size-3" />
                      Suggest an edit
                    </button>
                  </div>
                )}
                </div>
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

        {/* Desktop right rail — rendered ONLY at lg:+ when AI is pinned.
         * Two surfaces share the slot:
         *   - Evidence rail (pinned mode, evidence-heavy work)
         *   - AI agent rail (pinned mode only; unpinned → drawer overlay)
         * Exactly one mounts at a time. The AI drawer overlay below handles
         * the unpinned case at all viewports. Resizing
         * across the breakpoint unmounts one and mounts the other;
         * conversation persists via draft.aiChat. */}
        {isLargeViewport && evidencePinned && (
          <aside
            data-evidence-rail
            className={
              "flex flex-col min-h-0 overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)] " +
              (focusMode ? "hidden" : "")
            }
          >
            <EvidenceDrawer
              draft={draft}
              editor={null}
              open
              onOpenChange={() => { /* pinned mode ignores Sheet open state */ }}
              pinned
              onPinnedChange={handlePinnedChange}
            />
          </aside>
        )}
        {/* Desktop pinned AI rail — inline in the grid, no animation.
         * Only mounts when AI is explicitly pinned. When unpinned the
         * grid 3rd column collapses to 0px so the canvas reclaims space. */}
        {isLargeViewport && !evidencePinned && pinnedDock === "ai" && !focusMode && (
          <aside
            className="flex flex-col min-h-0 overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)]"
          >
            <RightRail
              draft={draft}
              tab={rightTab}
              onTabChange={setRightTab}
              pendingComment={pendingComment}
              onPendingCommentConsumed={() => setPendingComment(null)}
              activeSectionId={activeSectionId}
              onCollapse={unpinAll}
              onPin={pinAI}
              onUnpin={unpinAll}
              isPinned
            />
          </aside>
        )}

        {/* AI drawer overlay — slides in from the right as a Sheet overlay
         * at ALL viewports. Scrim behind. Tap scrim or chevron to close.
         * Pin button converts to inline pinned rail (closes this overlay). */}
        <button
          type="button"
          className={
            "fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none " +
            (aiDrawerOpen && pinnedDock !== "ai"
              ? "opacity-100"
              : "opacity-0 pointer-events-none")
          }
          aria-label="Close AI drawer"
          aria-hidden={(!aiDrawerOpen || pinnedDock === "ai") || undefined}
          onClick={() => setAiDrawerOpen(false)}
        />
        <AnimatePresence>
          {aiDrawerOpen && pinnedDock !== "ai" && !focusMode && (
            <motion.aside
              key="ai-drawer-overlay"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                stiffness: 340,
                damping: 42,
                mass: 0.9,
              }}
              className="fixed inset-y-0 right-0 z-40 w-full max-w-[420px] bg-[var(--ds-surface)] border-l border-[var(--ds-line)] shadow-2xl flex flex-col min-h-0 overflow-hidden"
            >
              <RightRail
                draft={draft}
                tab={rightTab}
                onTabChange={setRightTab}
                pendingComment={pendingComment}
                onPendingCommentConsumed={() => setPendingComment(null)}
                activeSectionId={activeSectionId}
                onCollapse={() => setAiDrawerOpen(false)}
                onPin={() => { pinAI(); setAiDrawerOpen(false); }}
                onUnpin={unpinAll}
                isPinned={false}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile scrim — only covers showSidebar (sections rail overlay).
         * The AI drawer has its own all-viewport scrim above. */}
        <button
          type="button"
          className={
            "lg:hidden fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none " +
            (showSidebar
              ? "opacity-100"
              : "opacity-0 pointer-events-none")
          }
          aria-label="Close panel"
          aria-hidden={!showSidebar || undefined}
          tabIndex={!showSidebar ? -1 : undefined}
          onClick={() => {
            setShowSidebar(false);
          }}
        />

        {/* Floating "Ask AI" pill — MOBILE.
         * lg:hidden so it only shows below the desktop breakpoint.
         * Visible whenever the AI drawer is closed; fades + scales away
         * while it's open. Now mirrors desktop: opens drawer overlay. */}
        {!focusMode && (
          <button
            type="button"
            onClick={() => {
              setRightTab("ai");
              setAiDrawerOpen(true);
            }}
            className={
              "lg:hidden fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.16)] hover:opacity-90 active:scale-[0.98] " +
              "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none " +
              (aiDrawerOpen
                ? "opacity-0 scale-90 pointer-events-none"
                : "opacity-100 scale-100")
            }
            aria-label="Open AI agent"
            aria-hidden={aiDrawerOpen || undefined}
            tabIndex={aiDrawerOpen ? -1 : undefined}
          >
            <span className="grid place-items-center size-5 rounded-full bg-white/15">
              <Sparkles className="size-3" />
            </span>
            <span className="drafthr-text-shimmer text-[12px] font-medium">Ask AI</span>
          </button>
        )}

        {/* Desktop dock tray — Evidence + Ask AI pills at bottom-right.
         * Visibility rules:
         *   pinnedDock === null      → both pills shown
         *   pinnedDock === "evidence"→ only Ask AI pill (Evidence is the rail)
         *   pinnedDock === "ai"      → neither pill (AI is the rail)
         * AnimatePresence keeps the tray mounted for the exit transition. lg:+ only. */}
        <AnimatePresence>
          {!focusMode && pinnedDock !== "ai" && (
            <motion.div
              key="desktop-dock-tray"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 28,
                mass: 0.7,
                delay: 0.08,
              }}
              className="hidden lg:flex fixed bottom-4 right-4 z-30 items-end gap-2"
            >
              {pinnedDock !== "evidence" && (
                <button
                  type="button"
                  onClick={() => setEvidenceDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border border-amber-200 shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:opacity-95"
                  aria-label="Open evidence drawer"
                >
                  <span className="grid place-items-center size-5 rounded-full bg-white/40">
                    <Paperclip className="size-3" />
                  </span>
                  <span className="text-[12px] font-semibold">Evidence</span>
                  {(draft.evidence?.length ?? 0) > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--ds-amber-fg)] text-white text-[10px] font-bold">
                      {draft.evidence?.length}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setAiDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.16)] hover:opacity-95"
                aria-label="Open AI agent"
              >
                <span className="grid place-items-center size-5 rounded-full bg-white/15">
                  <Sparkles className="size-3" />
                </span>
                <span className="drafthr-text-shimmer text-[12px] font-medium">Ask AI</span>
              </button>
            </motion.div>
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

      {/* Floating evidence drawer — only rendered when NOT pinned. When the
       * user pins it, the same component is mounted inside the right-rail
       * slot above (with `pinned` set). editor=null because the section-
       * level editors each own their own Tiptap instance; the top-level
       * drawer surfaces evidence for browsing/management, and the section
       * pickers handle in-cursor insertion. */}
      {!evidencePinned && (
        <EvidenceDrawer
          draft={draft}
          editor={null}
          open={evidenceDrawerOpen}
          onOpenChange={setEvidenceDrawerOpen}
          pinned={false}
          onPinnedChange={handlePinnedChange}
        />
      )}

      {/* Handoff card — opens when the Review CTA detects a soft evidence
       * issue (unused items, or heavy-tier with too few items). */}
      <EvidenceHandoff
        open={handoffReason !== null}
        reason={handoffReason}
        draftId={draft.id}
        onOpenChange={(next) => {
          if (!next) setHandoffReason(null);
        }}
        onOpenDrawer={() => {
          setHandoffReason(null);
          if (!evidencePinned) setEvidenceDrawerOpen(true);
          // When pinned, the rail is already visible — nothing to "open".
        }}
        onContinue={() => {
          setHandoffReason(null);
          nav(`/editor/${draft.id}/review`);
        }}
      />

      <CounselReviewDialog
        open={counselDialogOpen}
        onOpenChange={setCounselDialogOpen}
        existing={counselReview}
        onAttest={(reviewedBy, reviewedOn) => {
          updateAnswers(draft.id, {
            ...draft.answers,
            _counselReview: { reviewedBy, reviewedOn, attestedAt: Date.now() },
          });
          setCounselDialogOpen(false);
          toast.success("Marked reviewed", { id: "counsel-reviewed", duration: 1400 });
        }}
        onClear={() => {
          const next = { ...draft.answers } as Record<string, unknown>;
          delete next._counselReview;
          updateAnswers(draft.id, next as typeof draft.answers);
          setCounselDialogOpen(false);
          toast.success("Cleared review attestation", { id: "counsel-cleared", duration: 1400 });
        }}
      />

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
            // Version the CURRENT html before overwriting it — otherwise a
            // restore silently drops the current content if it was never
            // versioned (e.g. hand-edits, which only go through updateSection).
            // Read the live section from the store, not the dialog snapshot.
            const current = useDraftStore
              .getState()
              .drafts[draft.id]?.sections.find((s) => s.id === historySection.id);
            if (current && current.html && current.html !== html) {
              pushSectionVersion(draft.id, historySection.id, {
                id: `ver_${Date.now()}`,
                createdAt: Date.now(),
                html: current.html,
              });
            }
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

      <SaveAsTemplateModal
        draft={draft}
        open={saveAsTemplateOpen}
        onOpenChange={setSaveAsTemplateOpen}
      />

      {/* "Open on mobile" — surfaces the /m/:draftId link so the HR
       * director can pick up reading on a phone. Pure link UX (no QR). */}
      <MobileShareDialog
        open={mobileShareOpen}
        onOpenChange={setMobileShareOpen}
        draftId={draft.id}
      />

      {/* Approval-workflow dialog — three kinds (submit / approve / request
       * changes) share one modal. Closed when reviewDialogKind is null. */}
      {reviewDialogKind && (
        <ReviewDialog
          open
          onOpenChange={(next) => !next && setReviewDialogKind(null)}
          kind={reviewDialogKind}
          defaultReviewerName={profile.personal.preferredName || profile.personal.legalName}
          onSubmit={onReviewSubmit}
        />
      )}

      {/* Reviewer "Suggest an edit" composer — stages the reviewer's proposal
       * as an attributed pendingChange (author = the current user). Reuses the
       * AI suggestion machinery so the author Accepts/Rejects exactly as they
       * would an AI proposal. */}
      {suggestSection && (
        <SuggestEditDialog
          open
          onOpenChange={(next) => !next && setSuggestSection(null)}
          section={suggestSection}
          onSubmit={(proposedHtml) => {
            const me = meIdentity(profile);
            useDraftStore.getState().proposeSectionChange(draft.id, suggestSection.id, {
              id: uid("sug"),
              createdAt: Date.now(),
              proposedHtml,
              instruction: "Suggested edit",
              source: "review",
              // Stable, cross-user attribution: email seeds the reviewer's
              // colour (matches how avatars/comments seed), name is displayed.
              authorId: me.email || me.name,
              authorName: me.name,
              diffViewMode: "card",
            });
            toast.success("Suggestion sent to the author");
          }}
        />
      )}

      {/* Review-feedback panel — opens when the user clicks the
       * changes_requested pill. Shows the most recent reviewer pushback. */}
      <Dialog.Root open={reviewFeedbackOpen} onOpenChange={setReviewFeedbackOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-4 text-[13px]">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquareWarning className="size-4 text-[var(--ds-red-fg)]" />
              <Dialog.Title className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
                Review feedback
              </Dialog.Title>
            </div>
            {latestChangesRequest ? (
              <>
                <Dialog.Description className="text-[12px] text-[var(--ds-muted)] mb-2">
                  From {latestChangesRequest.reviewerName} ·{" "}
                  {new Date(latestChangesRequest.createdAt).toLocaleString()}
                </Dialog.Description>
                <p className="m-0 text-[13px] text-[var(--ds-ink)] whitespace-pre-wrap leading-relaxed">
                  {latestChangesRequest.body}
                </p>
              </>
            ) : (
              <p className="m-0 text-[13px] text-[var(--ds-muted)]">No feedback recorded yet.</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              {reviewStatus === "changes_requested" && canSubmitForReview(role) && (
                <Button
                  size="sm"
                  onClick={() => {
                    setReviewFeedbackOpen(false);
                    setReviewDialogKind("submit");
                  }}
                >
                  <Send className="size-3.5 mr-1.5" />
                  Re-submit for approval
                </Button>
              )}
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">
                  Close
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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

/* ----------------------------------------------------------------------------
 * CounselReviewDialog — quick attestation surface for the topbar pill.
 * Lets a reviewer mark a letter as counsel-reviewed without going through
 * the Export → Review flow first. Updates draft.answers._counselReview so
 * the existing derivation in Editor picks it up immediately.
 * --------------------------------------------------------------------------*/
function CounselReviewDialog({
  open,
  onOpenChange,
  existing,
  onAttest,
  onClear,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  existing: { reviewedBy: string; reviewedOn: string } | null;
  onAttest: (reviewedBy: string, reviewedOn: string) => void;
  onClear: () => void;
}) {
  const [reviewedBy, setReviewedBy] = useState(existing?.reviewedBy ?? "");
  const [reviewedOn, setReviewedOn] = useState(
    existing?.reviewedOn ?? todayDateOnly()
  );

  // Reset to existing values whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setReviewedBy(existing?.reviewedBy ?? "");
      setReviewedOn(existing?.reviewedOn ?? todayDateOnly());
    }
  }, [open, existing?.reviewedBy, existing?.reviewedOn]);

  const canSubmit = reviewedBy.trim().length > 0 && reviewedOn.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-5">
          <Dialog.Title className="m-0 text-[15px] font-semibold inline-flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--ds-muted)]" />
            {existing ? "Update counsel review" : "Mark counsel-reviewed"}
          </Dialog.Title>
          <Dialog.Description className="text-[12px] text-[var(--ds-muted)] mt-1 mb-4">
            High-risk letters require sign-off before export. Recording the
            attestation here unlocks export and stamps the audit trail.
          </Dialog.Description>

          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--ds-ink)] mb-1">
                Reviewer name *
              </label>
              <input
                type="text"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                placeholder="Counsel name, role"
                className="w-full h-9 rounded-md border border-[var(--ds-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--ds-ink)]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--ds-ink)] mb-1">
                Reviewed on *
              </label>
              <input
                type="date"
                value={reviewedOn}
                onChange={(e) => setReviewedOn(e.target.value)}
                className="w-full h-9 rounded-md border border-[var(--ds-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--ds-ink)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-5">
            <div>
              {existing && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-[12px] text-[var(--ds-muted)] hover:text-destructive transition"
                >
                  Clear attestation
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-8 px-3 rounded-md border border-[var(--ds-line)] text-[12px] hover:bg-[var(--ds-line-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => onAttest(reviewedBy.trim(), reviewedOn)}
                className="h-8 px-3 rounded-md bg-[var(--ds-ink)] text-white text-[12px] font-medium disabled:opacity-40 hover:opacity-90"
              >
                {existing ? "Update" : "Mark reviewed"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
