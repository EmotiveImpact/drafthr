import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { WizardSidebar } from "@/components/editor/WizardSidebar";
import { EmployeeRail } from "@/components/editor/EmployeeRail";
import { CompliancePanel } from "@/components/editor/CompliancePanel";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import { InlineDisclaimer } from "@/components/editor/InlineDisclaimer";
import { PagedlyDocEditor } from "@/components/editor/paged-edit/PagedlyDocEditor";
import type { PagedEditorActions } from "@/components/editor/paged-edit/types";
import { RetryBanner, type RetryEvent } from "@/components/editor/RetryBanner";
import { InlineSuggestionBanner } from "@/components/editor/InlineSuggestionBanner";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  ChevronLeft,
  ShieldCheck,
  Minimize2,
  ArrowUp,
  Clock3,
  MessageSquare,
  Send,
  CheckCircle2,
  MessageSquareWarning,
  Lightbulb,
} from "lucide-react";
import { generateAllSections, regenerateSection } from "@/lib/llm/draft";
import type { Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import { meIdentity } from "@/lib/comments/identity";
import { SuggestEditDialog } from "@/components/editor/SuggestEditDialog";
import { uid } from "@/lib/utils";
import { RefineDialog } from "@/components/editor/RefineDialog";
import { EditDetailsSheet } from "@/components/editor/EditDetailsSheet";
import { FloatingCommentPanel, type FloatingAnchor } from "@/components/editor/FloatingCommentPanel";
import { TimelinePanel } from "@/components/editor/TimelinePanel";
import { EvidenceDrawer } from "@/components/editor/EvidenceDrawer";
import { SaveAsTemplateModal } from "@/components/templates/SaveAsTemplateModal";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { canSubmitForReview, canEditDraft } from "@/lib/permissions";
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
import { toast } from "sonner";
import { todayDateOnly } from "@/lib/date-only";
import { useIsLargeViewport } from "@/lib/use-large-viewport";
import { hasPendingSuggestions, listSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import type { HealthActionRoute } from "@/lib/finalize/healthChecks";
import { DocumentBar } from "@/components/editor/DocumentBar";
import { PresenceBar } from "@/components/editor/PresenceBar";
import { LetterSidePanel, type SidePanelTab } from "@/components/editor/LetterSidePanel";
import type { EditsFilter } from "@/components/editor/EditsTab";
import { MobileBottomSheet } from "@/components/editor/MobileBottomSheet";
import { CitationLayer } from "@/components/editor/Citations";
import { useLetterExport } from "@/components/editor/useLetterExport";
import "@/components/editor/letter-workspace.css";


/* ---------------------------------------------------------------------------
 * Side panel persistence: per-draft, localStorage-backed.
 *
 * `pinnedDock` drives the 14B side panel at lg+: "ai" shows the Edits /
 * Progress / Chat tabs, "evidence" shows the pinned evidence rail, null hides
 * the panel. It is stored under `drafthr.pinnedDock:{draftId}`, with "none"
 * recording a deliberately closed panel. With no stored value the panel opens
 * on its tabs; heavy-tier drafts open on evidence (the same auto-pin as
 * before).
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
    const fallback = draft?.evidenceTier === "heavy" ? "evidence" : "ai";
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(`drafthr.pinnedDock:${draft?.id ?? draftId}`);
      if (raw === "none") return null;
      return raw === "evidence" || raw === "ai" ? raw : fallback;
    } catch {
      return fallback;
    }
  });
  // Side panel tab, the Edits tab filter and the mobile sheet's height.
  const [panelTab, setPanelTab] = useState<SidePanelTab>(() =>
    draft?.sections.some((s) => s.pendingChange || hasPendingSuggestions(s.html)) ? "edits" : "progress"
  );
  const [editsFilter, setEditsFilter] = useState<EditsFilter>("edits");
  const [sheetSnap, setSheetSnap] = useState<"closed" | "half" | "full">("full");
  // The Tiptap editor of the section being edited: the document bar's
  // format row drives it.
  const [activeEditor, setActiveEditor] = useState<TiptapEditor | null>(null);
  // The letter page, for the 8A citation markers.
  const paperRef = useRef<HTMLElement>(null);
  const letterExport = useLetterExport(draft);

  const pinEvidence = () => setPinnedDock("evidence");
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
      window.localStorage.setItem(key, pinnedDock ?? "none");
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
      // Unpinning evidence returns the side panel to its tabs.
      setPinnedDock("ai");
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
    const fallback = draft?.evidenceTier === "heavy" ? "evidence" : "ai";
    let next: "evidence" | "ai" | null = fallback;
    try {
      const raw = window.localStorage.getItem(DOCK_KEY(draftId));
      if (raw === "none") next = null;
      else if (raw === "evidence" || raw === "ai") next = raw;
    } catch {
      // Fallback to the tier-based default if localStorage is unavailable.
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
    setRefineSectionId(null);
    setReviewFeedbackOpen(false);
    setViewMode("edit");
    setActiveEditor(null);
    setEditsFilter("edits");
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
      // ⌘L / Ctrl+L jumps to the side panel's Chat tab and its composer
      // (and exits focus mode). At lg+ the panel opens in the frame; below
      // lg the bottom sheet opens.
      if ((e.metaKey || e.ctrlKey) && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setFocusMode(false);
        setPanelTab("chat");
        if (isLargeViewport) setPinnedDock("ai");
        else setAiDrawerOpen(true);
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>("textarea[data-ai-composer]");
          el?.focus();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, isLargeViewport]);

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

  const counselNeeded = Boolean(meta.legalReviewRequired || meta.riskClass === "high");
  const activeSection = draft.sections.find((s) => s.id === activeSectionId) ?? null;
  const unresolvedComments = (draft.comments ?? []).filter((c) => !c.resolved && !c.parentId).length;

  // Everything waiting for a decision: section proposals plus single tracked
  // changes in sections without a proposal (the same set the Edits tab lists).
  const pendingSectionCount = draft.sections.filter((s) => s.pendingChange).length;
  const pendingMarkCount = draft.sections
    .filter((s) => !s.pendingChange && hasPendingSuggestions(s.html))
    .reduce((n, s) => n + listSuggestionsHtml(s.html).filter((x) => x.status === "pending").length, 0);
  const pendingEdits = pendingSectionCount + pendingMarkCount;

  const rejectAllEdits = () => {
    if (pendingSectionCount > 0) {
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
    }
    if (pendingMarkCount > 0) useDraftStore.getState().rejectAllSuggestions(draft.id);
  };

  const acceptAllEdits = () => {
    if (pendingSectionCount > 0) {
      // Snapshot the CANONICAL pre-diff html so undo can restore. In inline
      // diff mode s.html already carries the staged <ins>/<del> marks;
      // restoring that and re-diffing it would garble the marks.
      // pendingChange.prevHtml is the clean text captured before the diff
      // was staged; prefer it.
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
    }
    if (pendingMarkCount > 0) useDraftStore.getState().acceptAllSuggestions(draft.id);
  };

  // Side panel: pinned in the frame at lg+, a bottom sheet below lg.
  const panelOpen = isLargeViewport ? pinnedDock !== null : aiDrawerOpen;
  const togglePanel = () => {
    if (isLargeViewport) setPinnedDock((d) => (d ? null : "ai"));
    else setAiDrawerOpen((v) => !v);
  };
  const openPanelTab = (t: SidePanelTab) => {
    setFocusMode(false);
    setPanelTab(t);
    if (isLargeViewport) setPinnedDock("ai");
    else setAiDrawerOpen(true);
  };
  const focusComposer = () =>
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>("textarea[data-ai-composer]")?.focus();
    });

  const openEvidence = () => {
    if (evidencePinned) {
      const search = document.querySelector<HTMLInputElement>('[data-evidence-rail] input[type="search"]');
      search?.focus();
      return;
    }
    setEvidenceDrawerOpen(true);
  };
  const onEvidenceButton = () => {
    if (evidencePinned) {
      // Focus the pinned rail: the search input, so keyboard users land
      // somewhere useful.
      const search = document.querySelector<HTMLInputElement>('[data-evidence-rail] input[type="search"]');
      search?.focus();
      return;
    }
    setEvidenceDrawerOpen((v) => !v);
  };

  const goReview = () => {
    // Soft check: opens the handoff card only when the soft rule trips.
    // Light tier always proceeds; if the user hit "Don't ask for this
    // draft", proceed silently too.
    const tier = draft.evidenceTier ?? deriveEvidenceTier(draft.letterType);
    const reason = evaluateEvidenceHandoff(draft, tier);
    if (reason) {
      setHandoffReason(reason);
      return;
    }
    nav(`/editor/${draft.id}/review`);
  };
  const goFinalise = () => nav(`/editor/${draft.id}/finalize`);

  const jumpToSection = (sectionId: string) => {
    setViewMode("edit");
    setActiveSectionId(sectionId);
    if (!isLargeViewport) setAiDrawerOpen(false);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-section-id="${sectionId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Insert > Comment: a new thread on the selected text of the section
  // being edited (or on the section itself when nothing is selected).
  const commentOnSelection = () => {
    const sid = activeSectionId;
    if (!sid) return;
    const sectionEl = document.querySelector<HTMLElement>(`[data-section-id="${sid}"]`);
    if (!sectionEl) return;
    let quote: string | undefined;
    let applyMark: ((commentId: string) => void) | undefined;
    const ed = activeEditor && !activeEditor.isDestroyed ? activeEditor : null;
    if (ed) {
      const { from, to, empty } = ed.state.selection;
      if (!empty) {
        quote = ed.state.doc.textBetween(from, to, " ").trim() || undefined;
        applyMark = (commentId: string) => {
          ed.chain().focus().setTextSelection({ from, to }).setCommentMark(commentId).run();
        };
      }
    }
    setFloatingComment({
      anchor: { getRect: () => sectionEl.getBoundingClientRect(), containerEl: sectionEl },
      mode: { kind: "new", sectionId: sid, quote, applyMark },
    });
  };

  const progressProps = {
    streaming: globallyStreaming,
    role,
    counselNeeded,
    counselReview,
    onRegenerateAll: () => void runGenerateAll(),
    onStop: stopStreaming,
    onOpenEvidence: openEvidence,
    onFixRoute: (route: HealthActionRoute | undefined) => {
      if (route === "evidence") openEvidence();
      else if (route === "settings") nav("/settings");
      else if (!isLargeViewport) setAiDrawerOpen(false);
    },
    onGoReview: goReview,
    onFinalise: goFinalise,
    onReviewAction: (kind: ReviewDialogKind) => setReviewDialogKind(kind),
    onWithdraw: onWithdrawForReview,
    onOpenFeedback: () => setReviewFeedbackOpen(true),
    onOpenCounsel: () => setCounselDialogOpen(true),
  };

  const sidePanel = (onClose: () => void, closeLabel: string) => (
    <LetterSidePanel
      draft={draft}
      tab={panelTab}
      onTabChange={setPanelTab}
      activeSectionId={activeSectionId}
      editsFilter={editsFilter}
      onEditsFilterChange={setEditsFilter}
      canResolve={canvasEditable}
      pendingEdits={pendingEdits}
      onAcceptAll={acceptAllEdits}
      onRejectAll={rejectAllEdits}
      onJumpToSection={jumpToSection}
      progress={progressProps}
      onOpenEvidence={openEvidence}
      onClose={onClose}
      closeLabel={closeLabel}
    />
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--ds-canvas)] lg:p-2">
      {/* 14B letter workspace: one framed surface holding the 11A document
       * bar, the letter on its page and (lg+) the side panel. Below lg the
       * side panel is a bottom sheet opened from the floating pills. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--ds-surface)] lg:rounded-[var(--ds-r-l)] lg:border lg:border-[var(--ds-line)] lg:shadow-[var(--ds-shadow-s)]">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!focusMode && (
            <DocumentBar
              draft={draft}
              editor={activeEditor}
              viewMode={viewMode}
              onViewMode={setViewMode}
              pagedActions={pagedEditorActionsRef}
              backTo={backTo}
              streaming={globallyStreaming}
              canEdit={canvasEditable}
              role={role}
              counselNeeded={counselNeeded}
              counselReview={counselReview}
              pendingEdits={pendingEdits}
              commentCount={unresolvedComments}
              activeSection={activeSection}
              panelOpen={panelOpen}
              onTogglePanel={togglePanel}
              outlineOpen={showSidebar}
              onToggleOutline={() => setShowSidebar((s) => !s)}
              focusMode={focusMode}
              onToggleFocus={() => setFocusMode((f) => !f)}
              evidenceActive={evidenceDrawerOpen || evidencePinned}
              evidencePinned={evidencePinned}
              onEvidenceButton={onEvidenceButton}
              onOpenEvidence={openEvidence}
              inviteOpen={invitePopoverOpen}
              onInviteOpenChange={setInvitePopoverOpen}
              onOpenOnMobile={() => setMobileShareOpen(true)}
              onExport={letterExport.requestExport}
              exportBusy={letterExport.busy}
              onFinalise={goFinalise}
              onGoReview={goReview}
              onSaveTemplate={saveTemplateSource}
              onSaveAsTemplate={() => setSaveAsTemplateOpen(true)}
              onOpenEdits={() => {
                setEditsFilter("edits");
                openPanelTab("edits");
              }}
              onAcceptAll={acceptAllEdits}
              onRejectAll={rejectAllEdits}
              onOpenComments={() => setAllCommentsOpen(true)}
              onComment={commentOnSelection}
              onOpenTimeline={() => setTimelineDialogOpen(true)}
              onShowSectionHistory={(s) => setHistorySection(s)}
              onRegenerateAll={() => void runGenerateAll()}
              onStop={stopStreaming}
              onRefineSection={() => {
                if (activeSectionId) setRefineSectionId(activeSectionId);
              }}
              onEditDetails={() => setEditDetailsOpen(true)}
              onReviewAction={(kind) => setReviewDialogKind(kind)}
              onWithdraw={onWithdrawForReview}
              onOpenFeedback={() => setReviewFeedbackOpen(true)}
              onOpenCounsel={() => setCounselDialogOpen(true)}
              onNavigate={(to) => nav(to)}
            />
          )}

          {/* Focus-mode overlays. The outline pill (top-left) keeps the writer
           * oriented and exits focus mode; the AI bar (bottom) jumps back to
           * the Chat tab and its composer. Esc also exits. */}
          {focusMode && (
            <>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="absolute left-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[12px] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] transition hover:bg-[var(--ds-surface-2)]"
                title="Exit focus mode (Esc)"
                aria-label="Exit focus mode"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Minimize2 className="size-3" />
                  <span className="ds-mono font-medium text-[var(--ds-body)]">
                    {(() => {
                      const idx = activeSectionId
                        ? draft.sections.findIndex((s) => s.id === activeSectionId)
                        : -1;
                      const n = idx >= 0 ? idx + 1 : 1;
                      return `${n} / ${draft.sections.length}`;
                    })()}
                  </span>
                </span>
                <span className="max-w-[180px] truncate">{(activeSection ?? draft.sections[0])?.title ?? "Letter"}</span>
                <span className="ds-mono ml-1 rounded bg-[var(--ds-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--ds-muted)]">
                  Esc
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  openPanelTab("chat");
                  focusComposer();
                }}
                className="absolute bottom-6 left-1/2 z-30 inline-flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-2.5 text-[13px] text-[var(--ds-muted)] shadow-[var(--ds-shadow-m)] transition hover:border-[var(--ds-line-strong)]"
                title="Open AI agent (⌘L)"
                aria-label="Open AI agent"
              >
                <Sparkles className="size-3.5 shrink-0" />
                <span className="flex-1 truncate text-left">Ask DraftHR to rewrite, tighten or add a clause…</span>
                <span className="ds-mono hidden rounded bg-[var(--ds-surface-2)] px-1.5 py-0.5 text-[10.5px] sm:inline">⌘L</span>
                <span className="grid size-7 shrink-0 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)]">
                  <ArrowUp className="size-3.5" />
                </span>
              </button>
            </>
          )}

          <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--ds-canvas)]">
            {viewMode === "preview" ? (
              // The Page view IS the pagedly editor (editable). Read-only when
              // the draft can't be edited (review lock) OR while any AI
              // generation is streaming: pagedly holds a mount-time snapshot,
              // so editing on the page mid-stream would fight the store.
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
              <div className="mx-auto w-full max-w-[816px] pb-28 sm:px-6 sm:pt-3 lg:pb-16">
                {/* 12B presence: who has access, floating over the page. */}
                {!focusMode && (
                  <div className="pointer-events-none sticky top-3 z-20 flex justify-center px-3 sm:justify-end sm:px-0">
                    <div className="pointer-events-auto min-w-0 max-w-full">
                      <PresenceBar draft={draft} profile={profile} onManage={() => setInvitePopoverOpen(true)} />
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2 px-3 empty:hidden sm:px-0">
                  {/* Matter breadcrumb + linked-employee chip. */}
                  {!draft.isTemplateSource && <MatterEmployeeChips draft={draft} />}
                  {draft.isTemplateSource && (
                    <TemplateSourceBanner draft={draft} onDiscard={discardTemplateSource} />
                  )}
                  <InlineDisclaimer draft={draft} />
                  {/* Read-only-during-review banner: keeps the lock state
                   * discoverable rather than mysterious. */}
                  {!canvasEditable && reviewStatus === "in_review" && (
                    <div className="flex items-center gap-2 rounded-[var(--ds-r-m)] bg-[var(--ds-amber-bg)] px-3 py-2 text-[12.5px] text-[var(--ds-ink)]">
                      <Send className="size-3.5 shrink-0 text-[var(--ds-amber-fg)]" />
                      <span className="leading-snug">
                        Read-only during review. Comment or decide on the Review step; the drafter edits once a decision is made.
                      </span>
                    </div>
                  )}
                  {!canvasEditable && reviewStatus === "approved" && (
                    <div className="flex items-center gap-2 rounded-[var(--ds-r-m)] bg-[var(--ds-green-bg)] px-3 py-2 text-[12.5px] text-[var(--ds-ink)]">
                      <CheckCircle2 className="size-3.5 shrink-0 text-[var(--ds-green-fg)]" />
                      <span className="leading-snug">Approved. The letter is locked and clear to export.</span>
                    </div>
                  )}
                  <DeadlineBanner draft={draft} />
                  <RetryBanner event={retryEvent} />
                  {/* Inline-diff banner: N pending tracked changes with Accept
                   * all / Reject all and the inline / card toggle. Returns
                   * null when no section has pending suggestions. */}
                  <InlineSuggestionBanner draft={draft} />
                </div>

                {/* The letter, on one white page. */}
                <article
                  ref={paperRef}
                  aria-label="Letter"
                  className="lw-paper mt-3 bg-[var(--ds-surface)] px-4 py-6 sm:rounded-[var(--ds-r-s)] sm:border sm:border-[var(--ds-line)] sm:px-12 sm:py-12 sm:shadow-[var(--ds-shadow-s)] lg:px-16"
                >
                  {draft.sections.map((section) => (
                    <div key={section.id}>
                      <SectionEditor
                        draft={draft}
                        section={section}
                        variant="paper"
                        hideToolbar
                        onEditorFocus={setActiveEditor}
                        isStreaming={section.status === "streaming"}
                        active={activeSectionId === section.id}
                        onFocus={() => setActiveSectionId(section.id)}
                        onChange={(html) => updateSection(draft.id, section.id, html)}
                        onRegenerate={(instr) => onRegenerateSection(section, instr)}
                        onClear={() => updateSection(draft.id, section.id, "")}
                        onShowHistory={() => setHistorySection(section)}
                        onOpenCommentsThread={() => {
                          // Without an inline anchor, pop the floating panel at
                          // the section's rect, as a new thread for this section.
                          const sectionEl = document.querySelector<HTMLElement>(
                            `[data-section-id="${section.id}"]`
                          );
                          if (!sectionEl) return;
                          setFloatingComment({
                            anchor: {
                              getRect: () => sectionEl.getBoundingClientRect(),
                              containerEl: sectionEl,
                            },
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
                      {/* Reviewer "Suggest an edit": only when the canvas is
                       * locked for this reviewer during review and the section
                       * isn't already carrying a pending suggestion. */}
                      {!canvasEditable && reviewStatus === "in_review" && !section.pendingChange && section.status !== "streaming" && (
                        <div className="-mt-1 mb-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setSuggestSection(section)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2.5 font-sans text-[12px] font-medium text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                          >
                            <Lightbulb className="size-3" />
                            Suggest an edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {globallyStreaming && (
                    <p className="mt-4 flex items-center gap-2 font-sans text-[12.5px] text-[var(--ds-muted)]">
                      <Loader2 className="size-3 animate-spin" />
                      Streaming sections from the model…
                    </p>
                  )}
                </article>
                <CitationLayer draft={draft} containerRef={paperRef} onViewSource={openEvidence} />
              </div>
            )}
          </div>
        </main>

        {/* Side panel (lg+). The Edits / Progress / Chat tabs, or the
         * pinned evidence rail when evidence is pinned. One AIPanel mounts
         * at a time: here at lg+, in the bottom sheet below. */}
        {isLargeViewport && pinnedDock !== null && !focusMode && (
          evidencePinned ? (
            <aside
              data-evidence-rail
              className="flex w-[400px] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)] xl:w-[420px]"
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
          ) : (
            <aside
              aria-label="Letter side panel"
              className="flex w-[400px] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--ds-line)] xl:w-[420px]"
            >
              {sidePanel(unpinAll, "Hide side panel")}
            </aside>
          )
        )}

        {/* Outline (sections and the compliance or rights checklist): an
         * overlay at every width, toggled from the document bar. */}
        {showSidebar && !focusMode && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-30 bg-black/20"
              aria-label="Close panel"
              onClick={() => setShowSidebar(false)}
            />
            <aside
              aria-label="Outline"
              className="absolute inset-y-0 left-0 z-40 flex w-[300px] max-w-[85vw] min-h-0 flex-col overflow-hidden border-r border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)]"
            >
              <WizardSidebar
                draft={draft}
                current="edit"
                activeSectionId={activeSectionId}
                onSelectSection={(id) => {
                  setShowSidebar(false);
                  jumpToSection(id);
                }}
                disabled={globallyStreaming}
                secondaryTabLabel={draft.mode === "employee" ? "Rights" : "Compliance"}
                secondaryTab={
                  draft.mode === "employee" ? <EmployeeRail draft={draft} /> : <CompliancePanel draft={draft} />
                }
              />
            </aside>
          </>
        )}
      </div>

      {/* Desktop, panel closed: a quiet way back to the assistant. */}
      {isLargeViewport && pinnedDock === null && !focusMode && (
        <button
          type="button"
          onClick={() => openPanelTab("chat")}
          className="fixed bottom-5 right-5 z-30 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--ds-accent)] pl-2.5 pr-3.5 text-[13px] font-medium text-[var(--ds-on-accent)] shadow-[var(--ds-shadow-m)] transition hover:bg-[var(--ds-accent-hover)]"
          aria-label="Open AI agent"
        >
          <Sparkles className="size-3.5" />
          Ask DraftHR
        </button>
      )}

      {/* Below lg: the side panel lives in a bottom sheet. Pills open it on
       * the right tab; the scrim or the handle closes it. */}
      {!isLargeViewport && (
        <>
          {!focusMode && (
            <div
              className={
                "fixed bottom-4 right-4 z-30 flex items-center gap-2 transition-[opacity,transform] duration-200 motion-reduce:transition-none " +
                (aiDrawerOpen ? "pointer-events-none scale-95 opacity-0" : "opacity-100")
              }
              aria-hidden={aiDrawerOpen || undefined}
            >
              {pendingEdits > 0 && (
                <button
                  type="button"
                  tabIndex={aiDrawerOpen ? -1 : undefined}
                  onClick={() => {
                    setEditsFilter("edits");
                    openPanelTab("edits");
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-m)]"
                  aria-label={`Open ${pendingEdits} edits to review`}
                >
                  Edits
                  <span className="ds-mono text-[11.5px] text-[var(--ds-muted)]">{pendingEdits}</span>
                </button>
              )}
              <button
                type="button"
                tabIndex={aiDrawerOpen ? -1 : undefined}
                onClick={() => openPanelTab("chat")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--ds-accent)] pl-2.5 pr-3.5 text-[13px] font-medium text-[var(--ds-on-accent)] shadow-[var(--ds-shadow-m)] active:scale-[0.98]"
                aria-label="Open AI agent"
              >
                <Sparkles className="size-3.5" />
                Ask AI
              </button>
            </div>
          )}
          <button
            type="button"
            className={
              "fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none " +
              (aiDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0")
            }
            aria-label="Close AI drawer"
            aria-hidden={!aiDrawerOpen || undefined}
            tabIndex={aiDrawerOpen ? undefined : -1}
            onClick={() => setAiDrawerOpen(false)}
          />
          <MobileBottomSheet
            open={aiDrawerOpen}
            snap={sheetSnap}
            onSnapChange={setSheetSnap}
            onDismiss={() => setAiDrawerOpen(false)}
          >
            {sidePanel(() => setAiDrawerOpen(false), "Close panel")}
          </MobileBottomSheet>
        </>
      )}

      {letterExport.gate}

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
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)] flex flex-col">
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
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[calc(100vw-2rem)] max-h-[80vh] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)] flex flex-col">
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
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[calc(100vw-2rem)] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)] p-4 text-[13px]">
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

    </div>
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
      <div className="px-4 pt-3 pb-1 text-[12px] text-[var(--ds-muted)]">
        {label} <span className="ds-mono">{comments.length}</span>
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
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-w-[calc(100vw-2rem)] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)] p-5">
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
                className="w-full h-9 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] outline-none focus:border-[var(--ds-line-strong)]"
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
                className="w-full h-9 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] outline-none focus:border-[var(--ds-line-strong)]"
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
                className="h-8 px-3 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] text-[12px] font-medium disabled:opacity-40 hover:bg-[var(--ds-accent-hover)]"
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
