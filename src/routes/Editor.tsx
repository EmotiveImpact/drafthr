import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { ChevronLeft, Clock3, Lightbulb, Loader2, MessageSquare, MessageSquareWarning, Minimize2, Send, ShieldCheck, Sparkles, ArrowUp, X } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { meIdentity } from "@/lib/comments/identity";
import { generateAllSections, regenerateSectionAsPending } from "@/lib/llm/draft";
import { PlanRequiredError } from "@/lib/llm/client";
import type { Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { canSubmitForReview, canEditDraft } from "@/lib/permissions";
import { todayDateOnly } from "@/lib/date-only";
import { useIsLargeViewport } from "@/lib/use-large-viewport";
import { toServerUuid } from "@/lib/remote-ids";
import { runHealthChecks, type HealthCheck } from "@/lib/finalize/healthChecks";
import { markOwnLetterReady, useJourney } from "@/lib/journey/stage";
import { currentRound, firstName, useLatestReview, useNewestReview, useReviewStore } from "@/lib/journey/reviews";
import { useJourneyUI } from "@/components/journey/ui-store";
import { ReviewDialogsHost } from "@/components/journey/ReviewDialogsHost";
import {
  focusReviewReply,
  openRoundsHistory,
  openTeammateComposer,
  requestFinishReview,
  requestRecall,
  useReviewerMode,
} from "@/components/journey/review/review-ui";
import { CommentQuoteMarks, TeammatePointCard, TeammateSelection, editTeammatePoint, removeTeammatePoint, suggestionNumbers, useTeammatePoints } from "@/components/journey/review/teammate";
import { isAskerOf, isReviewerOf, useMe } from "@/components/journey/review/actions";
import { evidenceSharedWith } from "@/components/journey/review/model";
import { undoMarkedSent, undoToastText } from "@/components/journey/send/actions";
import { Seal } from "@/components/journey/ui";
import { uid, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WizardSidebar } from "@/components/editor/WizardSidebar";
import { EmployeeRail } from "@/components/editor/EmployeeRail";
import { CompliancePanel } from "@/components/editor/CompliancePanel";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import { PagedlyDocEditor } from "@/components/editor/paged-edit/PagedlyDocEditor";
import type { PagedEditorActions } from "@/components/editor/paged-edit/types";
import { RetryBanner, type RetryEvent } from "@/components/editor/RetryBanner";
import { SuggestEditDialog } from "@/components/editor/SuggestEditDialog";
import { RefineDialog } from "@/components/editor/RefineDialog";
import { EditDetailsSheet } from "@/components/editor/EditDetailsSheet";
import { FloatingCommentPanel, type FloatingAnchor } from "@/components/editor/FloatingCommentPanel";
import { TimelinePanel } from "@/components/editor/TimelinePanel";
import { EvidenceDrawer } from "@/components/editor/EvidenceDrawer";
import { SaveAsTemplateModal } from "@/components/templates/SaveAsTemplateModal";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { MobileShareDialog } from "@/components/editor/MobileShareDialog";
import { TemplateSourceBanner } from "@/components/editor/TemplateSourceBanner";
import { EvidenceHandoff, evaluateEvidenceHandoff, type EvidenceHandoffReason } from "@/components/editor/EvidenceHandoff";
import { hasPendingSuggestions } from "@/lib/tiptap/suggestion-merge";
import { DocumentBar, type DocumentBarProps, type SavedState } from "@/components/editor/DocumentBar";
import { LetterSidePanel, editsShowsReview } from "@/components/editor/LetterSidePanel";
import type { EditsFilter } from "@/components/editor/EditsTab";
import { MobileBottomSheet } from "@/components/editor/MobileBottomSheet";
import { CitationLayer } from "@/components/editor/Citations";
import { useLetterExport } from "@/components/editor/useLetterExport";
import { LetterNotices } from "@/components/editor/LetterNotices";
import { ConfidentialLine, IssueDate, Letterhead } from "@/components/editor/Letterhead";
import { MarginLayer } from "@/components/editor/MarginLayer";
import { FindBar } from "@/components/editor/FindBar";
import { ActivityDialog, type ActivityTab } from "@/components/editor/ActivityDialog";
import { ChecksDialog } from "@/components/editor/LetterHealthCard";
import { PhoneBottomBar, PhoneDisclaimer, PhoneFlagHint, PhoneStrip, PhoneTopBar, usePhoneFlag } from "@/components/editor/PhoneChrome";
import { useLetterWorkspace, type WorkspaceHandlers } from "@/components/editor/workspace-store";
import { planFix } from "@/components/editor/health-fix";
import { letterEvidenceTier } from "@/components/editor/evidence-tier";
import { blockWithText, openAnchoredComments, recordDecision, suggestedEdits } from "@/components/editor/suggestion-groups";
import { draftErrorCopy } from "@/components/editor/draft-error";
import { ConfirmDialog } from "@/components/letters/dialogs";
import {
  APPROVER_ROLE_KEY,
  APPROVER_USER_KEY,
  activityEvents,
  employeeFor,
  myName,
  peopleOnLetter,
  submittedEntry,
  viewerIsApproverFor,
} from "@/components/editor/letter-facts";
import "@/components/editor/letter-workspace.css";

/* ---------------------------------------------------------------------------
 * Side panel persistence: per-draft, localStorage-backed.
 *
 * `pinnedDock` drives the side panel at lg+: "ai" shows the Edits /
 * Progress / Chat tabs, "evidence" shows the pinned evidence rail, null hides
 * the panel. It is stored under `drafthr.pinnedDock:{draftId}`, with "none"
 * recording a deliberately closed panel. With no stored value the panel opens
 * on its tabs.
 * ------------------------------------------------------------------------ */
const DOCK_KEY = (draftId: string) => `drafthr.pinnedDock:${draftId}`;

/** The view picked last on the Sections / Page switch, for every letter. Only a
 *  click on the switch saves it; jumps back to Sections (find, a section link)
 *  leave it alone. */
const VIEW_KEY = "drafthr.letter.view";

function preferredView(): "edit" | "preview" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "preview" ? "preview" : "edit";
  } catch {
    return "edit";
  }
}

/** The page is 640px wide; the margin column (256px) sits 20px to its right. */
const PAGE_W = 640;
const MARGIN_GAP = 20;
const MARGIN_W = 256;
const CANVAS_PAD_L = 48;
/** The page's zoom when 100% leaves no room for the margin (a toolbar step). */
const AUTO_ZOOM = 90;

/**
 * Where the side panel opens on a first visit: always the Edits / Progress
 * / Chat tabs (mocks f1 to f8), so the tracker, the stage's main action and
 * Ask DraftHR are there on every letter and for every mode. An
 * evidence-led letter short of evidence says so in the Draft step ("0 of 2
 * evidence items linked", with Add) instead of opening on the evidence and
 * hiding the journey (LETTER-X3, X45). Pinning evidence is the person's
 * choice and is remembered per letter.
 */
function defaultDock(): "evidence" | "ai" {
  return "ai";
}

function useIsPhone(): boolean {
  const query = "(max-width: 767px)";
  const [m, setM] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setM(e.matches);
    mql.addEventListener("change", on);
    setM(mql.matches);
    return () => mql.removeEventListener("change", on);
  }, []);
  return m;
}

export function Editor() {
  const { draftId } = useParams<{ draftId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const employees = useDraftStore((s) => s.employees);
  const matters = useDraftStore((s) => s.matters);
  const profile = useProfileStore((s) => s.profile);
  const updateSection = useDraftStore((s) => s.updateSection);
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);

  // The journey: the stage, its main action, the lock. The approver is
  // named when the letter is sent for approval.
  const review = useLatestReview(draftId);
  const approverNameEarly = draft ? submittedEntry(draft)?.reviewerName : undefined;
  const viewerIsApprover = draft ? viewerIsApproverFor(draft, profile, approverNameEarly) : false;
  // The named teammate reviewer sees their own review (mock f4 in the app):
  // the Read / Suggest / Comment switch and "Send back to <asker>".
  const reviewMe = useMe();
  // Out, sent back (a calm read-only confirmation) or recalled (it says so):
  // the named teammate never gets the author's controls (REVIEW-69, 94).
  const newestReview = useNewestReview(draftId);
  const reviewerOf = newestReview?.status === "recalled" ? newestReview : review;
  const viewerIsReviewer =
    reviewerOf?.kind === "team" &&
    (reviewerOf.status === "out" || reviewerOf.status === "back" || reviewerOf.status === "recalled") &&
    isReviewerOf(reviewerOf, reviewMe) &&
    !isAskerOf(reviewerOf, reviewMe);
  // Someone else's review (not the asker, not the named reviewer): read only.
  const viewerIsAsker =
    review && (review.status === "out" || review.status === "back") && !viewerIsReviewer ? isAskerOf(review, reviewMe) : undefined;
  const journey = useJourney(draftId, { viewerIsApprover, viewerIsReviewer, viewerIsAsker });
  const isLargeViewport = useIsLargeViewport();
  const isPhone = useIsPhone();
  const panelTab = useJourneyUI((s) => s.panelTab);
  const setPanelTab = useJourneyUI((s) => s.setPanelTab);
  const justSent = useJourneyUI((s) => s.justSent);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [globallyStreaming, setGloballyStreaming] = useState(false);
  const [historySection, setHistorySection] = useState<Section | null>(null);
  const [suggestSection, setSuggestSection] = useState<Section | null>(null);
  const [retryEvent, setRetryEvent] = useState<RetryEvent | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  // Below lg the side panel is a bottom sheet; this opens it.
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  /** Focus mode: only the page. Esc leaves it. */
  const [focusMode, setFocusMode] = useState(false);
  const [refineSectionId, setRefineSectionId] = useState<string | null>(null);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [invitePopoverOpen, setInvitePopoverOpen] = useState(false);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);
  const [allCommentsOpen, setAllCommentsOpen] = useState(false);
  const [counselDialogOpen, setCounselDialogOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [mobileShareOpen, setMobileShareOpen] = useState(false);
  const [reviewDialogKind, setReviewDialogKind] = useState<ReviewDialogKind | null>(null);
  const [reviewFeedbackOpen, setReviewFeedbackOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>("history");
  const [checksOpen, setChecksOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [confirmDiscardTemplate, setConfirmDiscardTemplate] = useState(false);
  // The zoom the person picked; until they pick one it follows the room.
  const [zoomChoice, setZoomChoice] = useState<number | null>(null);
  const [tickStep, setTickStep] = useState<string | null>(null);
  const [pinnedDock, setPinnedDock] = useState<"evidence" | "ai" | null>(() => {
    const fallback = defaultDock();
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(DOCK_KEY(draft?.id ?? draftId ?? ""));
      if (raw === "none") return null;
      return raw === "evidence" || raw === "ai" ? raw : fallback;
    } catch {
      return fallback;
    }
  });
  const [editsFilter, setEditsFilter] = useState<EditsFilter>("edits");
  const [sheetSnap, setSheetSnap] = useState<"closed" | "half" | "full">("full");
  // The Tiptap editor of the section being edited: the ribbon drives it.
  const [activeEditor, setActiveEditor] = useState<TiptapEditor | null>(null);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [handoffReason, setHandoffReason] = useState<EvidenceHandoffReason | null>(null);
  const handoffReturnFocus = useRef<HTMLElement | null>(null);
  const handoffFrom = useRef<"bar" | "panel">("bar");
  const [floatingComment, setFloatingComment] = useState<
    | {
        anchor: FloatingAnchor;
        mode:
          | { kind: "new"; sectionId: string; quote?: string; applyMark?: (commentId: string) => void }
          | { kind: "existing"; commentId: string };
        /** Put the cursor in the reply box (opened from a card's Reply). */
        focusReply?: boolean;
        /** Where focus goes back to when the thread closes. */
        returnFocus?: HTMLElement | null;
      }
    | null
  >(null);

  // The page, the box holding the page and its margin, and the canvas.
  const paperRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pagedEditorActionsRef = useRef<PagedEditorActions | null>(null);
  const letterExport = useLetterExport(draft);

  const evidencePinned = pinnedDock === "evidence";

  useEffect(() => {
    if (!draftId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DOCK_KEY(draftId), pinnedDock ?? "none");
    } catch {
      // localStorage may be unavailable (private mode, quota): non-fatal.
    }
  }, [draftId, pinnedDock]);

  // Abort any in-flight stream when the editor unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const meta = useMemo(() => (draft ? getLetterMeta(draft.letterType) : null), [draft]);

  // Auto-generate on first visit if all sections are empty. Also gated on
  // the store's streaming state so a remount never starts a second run.
  useEffect(() => {
    if (!draft) return;
    const allEmpty = draft.sections.every((s) => s.status === "empty" && !s.html);
    const alreadyStreaming = draft.sections.some((s) => s.status === "streaming");
    if (allEmpty && !globallyStreaming && !alreadyStreaming) {
      void runGenerateAllRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // A different letter: restore its dock and reset everything that carried
  // the previous letter's ids.
  const shownBack = useRef<string | null>(null);
  useEffect(() => {
    if (!draftId || typeof window === "undefined") return;
    const fallback = defaultDock();
    let next: "evidence" | "ai" | null = fallback;
    try {
      const raw = window.localStorage.getItem(DOCK_KEY(draftId));
      if (raw === "none") next = null;
      else if (raw === "evidence" || raw === "ai") next = raw;
    } catch {
      // Fall back to the tier default.
    }
    setPinnedDock(next);
    setHistorySection(null);
    setActiveSectionId(null);
    setFloatingComment(null);
    setRefineSectionId(null);
    setReviewFeedbackOpen(false);
    // Page view shows the letter as it was when opened, so a letter with no
    // text yet (or a phone) always starts on Sections, where drafting shows.
    const hasText = draft?.sections.some((s) => s.status === "ready" || s.status === "edited") ?? false;
    setViewMode(hasText && !isPhone ? preferredView() : "edit");
    setActiveEditor(null);
    setEditsFilter("edits");
    setFindOpen(false);
    setPanelTab("progress");
    shownBack.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Back to you (B1): open on the Edits tab, where the reviewer's points
  // are decided. Once per letter and round, so the person can move away.
  // Runs after the reset above, which clears shownBack for a new letter.
  // A round with nothing to decide stays on Progress, where the Review
  // step's Finish review is.
  const backKey = review?.status === "back" ? `${draftId}:${review.id}:${review.rounds?.length ?? 0}` : null;
  useEffect(() => {
    if (!backKey || shownBack.current === backKey || viewerIsReviewer) return;
    shownBack.current = backKey;
    const live = draftId ? useDraftStore.getState().drafts[draftId] : undefined;
    if (!live) return;
    const round = review?.rounds?.[review.rounds.length - 1];
    const theirComments = new Set(round?.commentIds ?? []);
    const toDecide =
      suggestedEdits(live).some((e) => !e.ai) ||
      (live.comments ?? []).some((c) => !c.resolved && theirComments.has(c.id));
    if (!toDecide) return;
    setPanelTab("edits");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backKey]);

  // Leaving Back to you (finished, sent back with a question, recalled):
  // the Edits tab stops being the Review step, so the panel moves to
  // Progress, where what comes next is (the approver card, the timeline and
  // the review summary; or the reviewer's card again) (LETTER-X53).
  const latestReviewStatus = review?.status;
  const wasBack = useRef<string | null>(null);
  useEffect(() => {
    const key = review && latestReviewStatus === "back" ? `${draftId}:${review.id}` : null;
    if (key) {
      wasBack.current = key;
      return;
    }
    const was = wasBack.current;
    wasBack.current = null;
    if (!was || !was.startsWith(`${draftId}:`) || viewerIsReviewer) return;
    if (useJourneyUI.getState().panelTab === "edits") setPanelTab("progress");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, review?.id, latestReviewStatus]);

  // ?openEvidence=1 opens the evidence drawer (old /evidence bookmarks).
  useEffect(() => {
    if (searchParams.get("openEvidence") !== "1") return;
    if (!evidencePinned) setEvidenceDrawerOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("openEvidence");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, evidencePinned]);

  // ?section=<id> scrolls to and focuses that section.
  useEffect(() => {
    const sectionId = searchParams.get("section");
    if (!sectionId) return;
    if (!draft?.sections.some((s) => s.id === sectionId)) return;
    setViewMode("edit");
    setActiveSectionId(sectionId);
    const t = setTimeout(() => {
      document.querySelector(`[data-section-id="${sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    const next = new URLSearchParams(searchParams);
    next.delete("section");
    setSearchParams(next, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, draft]);

  // ?review=expert&expert=<id>: back from the marketplace with an expert
  // chosen. Open the reviewer picker on the expert pane with them on top.
  useEffect(() => {
    if (!draftId || searchParams.get("review") !== "expert") return;
    const expertId = searchParams.get("expert") ?? undefined;
    const due = searchParams.get("due");
    const dueAt =
      due && !Number.isNaN(Date.parse(due)) && Date.parse(due) > Date.now() ? new Date(due).toISOString() : undefined;
    // A review already out (or back) is left alone, as in ReviewDialogsHost.
    const reviewOpen = Object.values(useReviewStore.getState().requests).some(
      (r) => r.draftId === draftId && (r.status === "out" || r.status === "back")
    );
    setPanelTab("progress");
    if (isLargeViewport) setPinnedDock("ai");
    if (!reviewOpen) {
      useJourneyUI.getState().openReviewPicker(draftId, { kind: "expert", expertId, dueAt, from: "marketplace" });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("review");
    next.delete("expert");
    next.delete("due");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, draftId]);

  // Keyboard: Esc leaves focus mode, Ctrl or Cmd+L opens Chat, Ctrl or
  // Cmd+F opens find in letter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusMode) {
        setFocusMode(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setFocusMode(false);
        setPanelTab("chat");
        if (isLargeViewport) setPinnedDock("ai");
        else setAiDrawerOpen(true);
        requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>("textarea[data-ai-composer]")?.focus();
        });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "f" || e.key === "F") && viewMode === "edit") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, isLargeViewport, viewMode, setPanelTab]);

  // "Saving", then "Saved just now", each time the letter changes.
  // Only a change to the letter itself (its text, title, details) counts:
  // opening a letter, syncing its review or recording a view never shows
  // "Saving", so a locked letter nobody edited reads "Saved".
  const [saved, setSaved] = useState<SavedState>({ kind: "saved", at: draft?.updatedAt ?? Date.now() });
  const contentSig = draft
    ? `${draft.title ?? ""}\u0001${JSON.stringify(draft.context)}\u0001${draft.sections.map((x) => x.html).join("\u0001")}`
    : "";
  const lastContent = useRef<{ id?: string; sig?: string; openedAt: number }>({ openedAt: 0 });
  useEffect(() => {
    if (!draft) return;
    const prev = lastContent.current;
    const opened = prev.id !== draft.id || prev.sig === undefined;
    lastContent.current = { id: draft.id, sig: contentSig, openedAt: opened ? Date.now() : prev.openedAt };
    if (opened) {
      setSaved({ kind: "saved", at: draft.updatedAt ?? Date.now() });
      return;
    }
    if (prev.sig === contentSig) return;
    // The section editors settle the stored html as they mount (no one has
    // typed yet): not a save the person made.
    if (Date.now() - prev.openedAt < 1500) return;
    // DraftHR writing the first draft is not a person's edit either.
    if (draft.sections.some((x) => x.status === "streaming")) return;
    setSaved({ kind: "saving" });
    const t = window.setTimeout(() => setSaved({ kind: "saved", at: Date.now() }), 700);
    return () => window.clearTimeout(t);
  }, [draft?.id, contentSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Does the margin column fit beside the page at this width and zoom?
  const [canvasW, setCanvasW] = useState(0);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvasW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPhone, focusMode, viewMode]);
  // Only the page scales with zoom; the margin cards keep their size. The
  // margin column shows when it fits beside the page at this zoom. When it
  // does not (zoomed in, or a narrow window), the page centres in the
  // canvas, never wider than the canvas, and the cards are in the Edits tab
  // (LETTER-33): nothing is pushed under the side panel or cut off.
  const fitsAt = (z: number) => !isPhone && canvasW >= CANVAS_PAD_L + (PAGE_W * z) / 100 + MARGIN_GAP + MARGIN_W + 16;
  // On a laptop (1366 wide) the page at 100% leaves no room for the margin
  // column, so the margin cards beside their paragraphs would be lost
  // (LETTER-X1): until the person picks a zoom, the page steps down to 90%
  // when that makes room. Narrower than that, the cards are in Edits.
  const zoom = zoomChoice ?? (!fitsAt(100) && fitsAt(AUTO_ZOOM) ? AUTO_ZOOM : 100);
  const pageW = (PAGE_W * zoom) / 100;
  const marginFits = fitsAt(zoom);

  // Approval lands while the sender is looking: the approver's tick, a
  // dark toast, the tracker's Approve step draws its tick.
  const approvingHere = useRef(false);
  const prevStatus = useRef<{ id?: string; status?: string }>({});
  useEffect(() => {
    if (!draft) return;
    const status = draft.reviewStatus ?? "draft";
    const prev = prevStatus.current;
    prevStatus.current = { id: draft.id, status };
    if (prev.id !== draft.id || prev.status !== "in_review" || status !== "approved") return;
    const approved = [...(draft.approvals ?? [])].reverse().find((a) => a.decision === "approved");
    if (approvingHere.current) {
      approvingHere.current = false;
      toast.success("Approved. It can be sent now.");
    } else {
      toast(`${approved?.reviewerName ?? "The approver"} approved this letter`, {
        description: "You can send it now.",
        className: "lw-toast-dark",
        descriptionClassName: "lw-toast-dark-desc",
        position: "bottom-right",
        duration: 6000,
      });
    }
  }, [draft?.id, draft?.reviewStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tracker step completes while the letter is open (Draft on sending for
  // review or approval, Review when it finishes, Approve when approved,
  // Send when sent): its circle fills and its tick draws (letter-live).
  const prevStep = useRef<{ id?: string; idx?: number }>({});
  useEffect(() => {
    if (!draft || !journey) return;
    const prev = prevStep.current;
    prevStep.current = { id: draft.id, idx: journey.stepIndex };
    if (prev.id !== draft.id || prev.idx === undefined || journey.stepIndex <= prev.idx) return;
    const done: number[] = [];
    for (let i = prev.idx; i < Math.min(journey.stepIndex, 4); i++) done.push(i);
    if (!done.length) return;
    setTickStep(done.join(" "));
    const t = window.setTimeout(() => setTickStep(null), 1600);
    return () => window.clearTimeout(t);
  }, [draft?.id, journey?.stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // The workspace's handlers, reachable from the stage components and the
  // health card. Registered as stable wrappers over the latest closures.
  const handlersRef = useRef<Partial<WorkspaceHandlers>>({});
  useEffect(() => {
    if (!draftId) return;
    const call =
      <K extends keyof WorkspaceHandlers>(k: K) =>
      (...args: Parameters<WorkspaceHandlers[K]>) =>
        (handlersRef.current[k] as ((...a: Parameters<WorkspaceHandlers[K]>) => void) | undefined)?.(...args);
    const handlers: WorkspaceHandlers = {
      openEdits: call("openEdits"),
      openEvidence: call("openEvidence"),
      fixCheck: call("fixCheck"),
      regenerateAll: call("regenerateAll"),
      stop: call("stop"),
      openReviewDialog: call("openReviewDialog"),
      withdraw: call("withdraw"),
      openCounsel: call("openCounsel"),
      openFeedback: call("openFeedback"),
      openVersions: call("openVersions"),
      openTimeline: call("openTimeline"),
      openChecks: call("openChecks"),
      ask: call("ask"),
      jumpToSection: call("jumpToSection"),
      finalise: call("finalise"),
      openRounds: call("openRounds"),
      sendForReview: call("sendForReview"),
    };
    useLetterWorkspace.getState().register(draftId, { handlers });
    return () => useLetterWorkspace.getState().reset(draftId);
  }, [draftId]);

  const runGenerateAllRef = useRef<(() => Promise<void>) | null>(null);

  // Facts the stage components read: kept in step after every render.
  const liveRef = useRef<{
    draftId: string;
    streaming: boolean;
    canEdit: boolean;
    counselNeeded: boolean;
    counselReview: { reviewedBy: string; reviewedOn: string } | null;
  } | null>(null);
  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    const ws = useLetterWorkspace.getState();
    if (ws.draftId !== live.draftId) return;
    if (
      ws.streaming !== live.streaming ||
      ws.canEdit !== live.canEdit ||
      ws.counselNeeded !== live.counselNeeded ||
      ws.counselReview?.reviewedBy !== live.counselReview?.reviewedBy ||
      ws.counselReview?.reviewedOn !== live.counselReview?.reviewedOn
    ) {
      ws.register(live.draftId, {
        streaming: live.streaming,
        canEdit: live.canEdit,
        counselNeeded: live.counselNeeded,
        counselReview: live.counselReview,
      });
    }
  });

  // The failing check the phone flags in the letter.
  const phoneFlag = usePhoneFlag(
    draft ?? ({ sections: [] } as unknown as NonNullable<typeof draft>),
    paperRef,
    Boolean(draft) && isPhone && journey?.stage === "draft" && viewMode === "edit"
  );

  const people = useMemo(() => (draft ? peopleOnLetter(draft, profile, review) : []), [draft, profile, review]);
  const me = myName(profile);
  const activity = useMemo(() => {
    if (!draft || !journey) return null;
    if (journey.stage !== "approve" && journey.stage !== "send" && journey.stage !== "sent") return null;
    return activityEvents(draft, review, me);
  }, [draft, journey, review, me]);

  // A teammate reviewer sees only the evidence they were given: files when
  // the asker shared evidence, hearing notes only when those were shared.
  const sharedView = useMemo(
    () =>
      draft && viewerIsReviewer && reviewerOf
        ? { ...draft, evidence: evidenceSharedWith(draft.evidence, reviewerOf.share) }
        : draft,
    [draft, viewerIsReviewer, reviewerOf]
  );

  // The named teammate's own points (V1): margin cards with Edit and Remove
  // while it is out, read only once sent back (REVIEW-90, 138).
  const teammateReview =
    viewerIsReviewer && reviewerOf && (reviewerOf.status === "out" || reviewerOf.status === "back") ? reviewerOf : null;
  const teammatePoints = useTeammatePoints(draft, teammateReview);
  const [reviewerMode] = useReviewerMode(draftId ?? "");
  // The commented words get an amber highlight and bar (REVIEW-89): the
  // teammate's own comments, or the reviewer's open ones once it is back.
  const quotedComments = useMemo(() => {
    if (!draft) return [];
    const open = (draft.comments ?? []).filter((c) => !c.resolved && !c.parentId);
    if (teammateReview) {
      const ids = new Set(teammatePoints.filter((p) => p.kind === "comment").map((p) => p.id));
      return open.filter((c) => ids.has(c.id));
    }
    if (review?.status === "back") {
      const ids = new Set(currentRound(review)?.commentIds ?? []);
      return open.filter((c) => ids.has(c.id));
    }
    return [];
  }, [draft, teammateReview, teammatePoints, review]);

  if (!draft || !draftId || !meta || !journey) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <h1 className="m-0 font-serif text-[28px] font-normal leading-tight text-[var(--ds-ink)]">Draft not found.</h1>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-[var(--ds-muted)]">
          This letter isn't in this workspace, or it was deleted.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => nav("/")}>
          <ChevronLeft className="size-4" /> Back home
        </Button>
      </div>
    );
  }

  // DraftHR is writing: this editor's own run, or a run the store shows (a
  // section streaming, started from the wizard, a stage control or another
  // mount). The bar's "Drafting…", Stop and the page's streaming line follow it.
  const streaming = globallyStreaming || draft.sections.some((s) => s.status === "streaming");
  const storeActions = { appendToSection, setSectionStatus, pushSectionVersion, updateSection };
  const onRetry = (retryCount: number, delayMs: number, reason: string) => {
    setRetryEvent({ retryCount, delayMs, reason, startedAt: Date.now() });
    setTimeout(() => setRetryEvent(null), delayMs);
  };

  const runGenerateAll = async () => {
    if (globallyStreaming) return;
    if (draft.sections.some((s) => s.status === "streaming")) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setGloballyStreaming(true);
    try {
      await generateAllSections(draft, storeActions, abortRef.current.signal, { onRetry });
    } catch (err) {
      console.error(err);
      toast.error("Generation failed", {
        description: draftErrorCopy(err),
        // A plan error is fixed on the plans page; trying again would only fail again.
        action:
          err instanceof PlanRequiredError
            ? { label: "See plans", onClick: () => nav("/pricing") }
            : { label: "Retry", onClick: () => void runGenerateAll() },
      });
    } finally {
      setGloballyStreaming(false);
      setRetryEvent(null);
    }
  };
  runGenerateAllRef.current = runGenerateAll;

  /** Ask DraftHR to rewrite one section; the result arrives as a suggested edit. */
  const proposeSection = async (section: Section, instruction?: string, category?: string): Promise<boolean> => {
    const live = useDraftStore.getState().drafts[draft.id];
    const sec = live?.sections.find((s) => s.id === section.id);
    if (!live || !sec || sec.status === "streaming") return false;
    if (category) useLetterWorkspace.getState().setFixCategory(sec.id, category);
    const ctrl = new AbortController();
    try {
      await regenerateSectionAsPending(
        live,
        sec,
        { ...storeActions, proposeSectionChange: useDraftStore.getState().proposeSectionChange },
        ctrl.signal,
        { onRetry },
        instruction
      );
      return true;
    } catch (err) {
      console.error(err);
      toast.error("DraftHR could not suggest a change", {
        description: draftErrorCopy(err),
        ...(err instanceof PlanRequiredError ? { action: { label: "See plans", onClick: () => nav("/pricing") } } : {}),
      });
      return false;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setGloballyStreaming(false);
    setRetryEvent(null);
    draft.sections.forEach((s) => {
      if (s.status === "streaming") setSectionStatus(draft.id, s.id, s.html ? "edited" : "empty");
    });
  };

  // Template-source save: write the current sections and answers into the
  // custom template (created on first save, updated in place after).
  const saveTemplateSource = () => {
    if (!draft.isTemplateSource) return;
    const answersRec = draft.answers as Record<string, unknown>;
    const templateName =
      (answersRec._templateName as string | undefined)?.trim() || draft.title?.trim() || meta?.shortTitle || "Untitled template";
    const templateDescription = answersRec._templateDescription as string | undefined;
    const sectionHtml: Partial<Record<import("@/lib/letters/types").SectionId, string>> = {};
    for (const sec of draft.sections) {
      if (sec.html.trim().length === 0) continue;
      sectionHtml[sec.sectionId] = sec.html;
    }
    const store = useDraftStore.getState();
    const myTemplatesUrl = (draft.mode === "employer" ? "/hr/new" : "/me/new") + "?tab=mine";
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
      action: { label: "Open your templates", onClick: () => nav(myTemplatesUrl) },
    });
  };

  const discardTemplateSource = () => {
    if (!draft.isTemplateSource) return;
    setConfirmDiscardTemplate(true);
  };

  const doDiscardTemplateSource = () => {
    if (!draft.isTemplateSource) return;
    const store = useDraftStore.getState();
    if (draft.templateSourceId) store.deleteCustomTemplate(draft.templateSourceId);
    const targetUrl = (draft.mode === "employer" ? "/hr/new" : "/me/new") + "?tab=mine";
    store.deleteDraft(draft.id);
    nav(targetUrl);
  };

  const backTo = draft.mode === "employer" ? "/hr" : draft.mode === "employee" ? "/me" : "/";

  const reviewStatus = draft.reviewStatus ?? "draft";
  const role = profile.workspaceRole;
  // The page can be typed into: the role allows it and the journey has not
  // locked it (out for review, with the approver, approved, sent).
  const canvasEditable = canEditDraft(role, reviewStatus) && !journey.locked;
  const latestChangesRequest = (draft.approvals ?? []).slice().reverse().find((a) => a.decision === "changes_requested");
  const matter = draft.matterId ? matters[draft.matterId] : undefined;
  const employee = employeeFor(draft, employees);
  const sentAt = journey.stage === "sent" ? journey.sentAt : undefined;
  const sealAnimates = Boolean(justSent && justSent.draftId === draft.id && Date.now() - justSent.at < 4000);

  // Approve and Request changes belong to the named approver only, from
  // every entry point (Approve step, document bar, More menu).
  const openReviewAction = (kind: ReviewDialogKind) => {
    if ((kind === "approve" || kind === "request_changes") && !viewerIsApprover) return;
    setReviewDialogKind(kind);
  };

  const onReviewSubmit = (input: { reviewerName: string; body: string; reviewerUserId?: string; reviewerRole?: string }) => {
    if (!reviewDialogKind) return;
    const store = useDraftStore.getState();
    if (reviewDialogKind === "submit") {
      store.submitForReview(draft.id, input.reviewerName, input.body);
      try {
        if (input.reviewerUserId) window.localStorage.setItem(APPROVER_USER_KEY(draft.id), input.reviewerUserId);
        else window.localStorage.removeItem(APPROVER_USER_KEY(draft.id));
        if (input.reviewerRole) window.localStorage.setItem(APPROVER_ROLE_KEY(draft.id), input.reviewerRole);
        else window.localStorage.removeItem(APPROVER_ROLE_KEY(draft.id));
      } catch {
        // Remind will say it cannot reach them.
      }
      if (input.reviewerUserId) notifyReviewRequested(draft.id, input.reviewerUserId, input.body || undefined);
      toast.success(`Sent to ${firstName(input.reviewerName) || "the approver"} to approve`);
    } else if (reviewDialogKind === "approve") {
      if (!viewerIsApprover) return;
      approvingHere.current = true;
      store.approveDraft(draft.id, input.reviewerName, input.body);
    } else if (reviewDialogKind === "request_changes") {
      store.requestChanges(draft.id, input.reviewerName, input.body);
      toast("Changes requested");
    }
  };

  const onWithdrawForReview = () => {
    useDraftStore.getState().withdrawForReview(draft.id);
    toast("Withdrawn from review");
  };

  // Counsel review: the latest export attestation, or a manual one.
  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const lastExport = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (lastExport?.reviewedBy && lastExport.reviewedOn) {
      return { reviewedBy: lastExport.reviewedBy, reviewedOn: lastExport.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as { reviewedBy?: string; reviewedOn?: string } | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    return null;
  })();
  const counselNeeded = Boolean(meta.legalReviewRequired || meta.riskClass === "high");
  const activeSection = draft.sections.find((s) => s.id === activeSectionId) ?? null;
  const unresolvedComments = (draft.comments ?? []).filter((c) => !c.resolved && !c.parentId).length;

  // Everything waiting for a decision: section proposals plus each
  // reviewer's loose tracked changes (the set the Edits tab and the margin
  // list, one card each).
  const pendingEdits = suggestedEdits(draft).length;
  // Back to you (B1): the Edits tab counts the reviewer's open points, their
  // comments as well as their suggested edits (REVIEW-70).
  // Comments pinned to words in the letter count too, whoever wrote them
  // (one card each in the margin, LETTER-X36); a reviewer's arrive with
  // their round.
  const reviewerOpenComments = (() => {
    const ids = new Set(review?.status === "back" ? review.rounds[review.rounds.length - 1]?.commentIds ?? [] : []);
    const open = new Set((draft.comments ?? []).filter((c) => ids.has(c.id) && !c.resolved).map((c) => c.id));
    const rName = review?.status === "out" ? review.reviewer.name.trim().toLowerCase() : "";
    for (const c of openAnchoredComments(draft)) {
      if (rName && c.authorName.trim().toLowerCase() === rName) continue;
      open.add(c.id);
    }
    return open.size;
  })();

  const rejectAllEdits = () => {
    const sectionSnap = draft.sections.filter((s) => s.pendingChange).map((s) => ({ sectionId: s.id, pending: s.pendingChange! }));
    const markSnap = draft.sections
      .filter((s) => !s.pendingChange && hasPendingSuggestions(s.html))
      .map((s) => ({ sectionId: s.id, html: s.html }));
    const decided = suggestedEdits(draft);
    const n = decided.length;
    if (sectionSnap.length) useDraftStore.getState().rejectAllPending(draft.id);
    if (markSnap.length) useDraftStore.getState().rejectAllSuggestions(draft.id);
    if (n === 0) return;
    recordDecision(draft.id, decided, false);
    toast(`${n} suggested ${n === 1 ? "edit" : "edits"} rejected`, {
      action: {
        label: "Undo",
        onClick: () => {
          const store = useDraftStore.getState();
          sectionSnap.forEach(({ sectionId, pending }) => store.proposeSectionChange(draft.id, sectionId, pending));
          markSnap.forEach(({ sectionId, html }) => store.updateSection(draft.id, sectionId, html));
        },
      },
    });
  };

  const acceptAllEdits = () => {
    // Snapshot the clean pre-diff html so Undo can restore it.
    const sectionSnap = draft.sections
      .filter((s) => s.pendingChange)
      .map((s) => ({ sectionId: s.id, html: s.pendingChange!.prevHtml ?? s.html, pending: s.pendingChange! }));
    const markSnap = draft.sections
      .filter((s) => !s.pendingChange && hasPendingSuggestions(s.html))
      .map((s) => ({ sectionId: s.id, html: s.html }));
    const decided = suggestedEdits(draft);
    const n = decided.length;
    if (sectionSnap.length) useDraftStore.getState().acceptAllPending(draft.id);
    if (markSnap.length) useDraftStore.getState().acceptAllSuggestions(draft.id);
    if (n === 0) return;
    recordDecision(draft.id, decided, true);
    toast.success(`${n} suggested ${n === 1 ? "edit" : "edits"} accepted`, {
      action: {
        label: "Undo",
        onClick: () => {
          const store = useDraftStore.getState();
          sectionSnap.forEach(({ sectionId, html, pending }) => {
            store.updateSection(draft.id, sectionId, html);
            store.proposeSectionChange(draft.id, sectionId, pending);
          });
          markSnap.forEach(({ sectionId, html }) => store.updateSection(draft.id, sectionId, html));
        },
      },
    });
  };

  // Side panel: in the frame at lg+, a bottom sheet below lg.
  const panelOpen = isLargeViewport ? pinnedDock !== null : aiDrawerOpen;
  const togglePanel = () => {
    if (isLargeViewport) setPinnedDock((d) => (d ? null : "ai"));
    else setAiDrawerOpen((v) => !v);
  };
  const openPanelTab = (t: "edits" | "progress" | "chat") => {
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
      document.querySelector<HTMLInputElement>('[data-evidence-rail] input[type="search"]')?.focus();
      return;
    }
    setEvidenceDrawerOpen(true);
  };
  const onEvidenceButton = () => {
    if (evidencePinned) {
      document.querySelector<HTMLInputElement>('[data-evidence-rail] input[type="search"]')?.focus();
      return;
    }
    setEvidenceDrawerOpen((v) => !v);
  };

  const openReviewPicker = (from: "bar" | "panel" = handoffFrom.current) => {
    // The picker lives with the journey panel: show Progress so it is mounted.
    setPanelTab("progress");
    if (isLargeViewport && pinnedDock === null) setPinnedDock("ai");
    useJourneyUI.getState().openReviewPicker(draft.id, { from });
  };

  /** Send for review: the evidence check first, then the reviewer picker. */
  const sendForReview = (from: "bar" | "panel" = "bar") => {
    handoffFrom.current = from;
    const tier = letterEvidenceTier(draft);
    const reason = evaluateEvidenceHandoff(draft, tier);
    if (reason) {
      // Esc or Cancel on the check puts focus back on the button pressed.
      handoffReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setHandoffReason(reason);
      return;
    }
    openReviewPicker(from);
  };
  const goReviewStep = () => nav(`/editor/${draft.id}/review`);
  const goFinalise = () => nav(`/editor/${draft.id}/finalize`);

  const remindApprover = async () => {
    const approver = journey.approverName && !/^workspace reviewer$/i.test(journey.approverName) ? journey.approverName : "";
    const first = firstName(approver) || "the approver";
    let userId: string | null = null;
    try {
      userId = window.localStorage.getItem(APPROVER_USER_KEY(draft.id));
    } catch {
      userId = null;
    }
    if (!userId) {
      toast(`Couldn't remind ${first} from here`, {
        description: `DraftHR doesn't know which teammate ${first === "the approver" ? "it is" : `${first} is`} on this device. Message them directly.`,
      });
      return;
    }
    try {
      const r = await fetch("/api/store/notify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          draftId: toServerUuid(draft.id),
          kind: "review-requested",
          recipientUserId: userId,
          message: `A reminder: "${draft.title?.trim() || meta.shortTitle}" is waiting for your approval.`,
        }),
      });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; emailed?: boolean } | null;
      if (r.ok && body?.emailed) {
        toast(`Reminder sent to ${first}`);
      } else {
        toast(`Couldn't send a reminder to ${first}`, {
          description: r.ok ? "Email isn't set up for this workspace yet. Message them directly." : "The server didn't accept it. Try again in a moment.",
        });
      }
    } catch {
      toast(`Couldn't send a reminder to ${first}`, { description: "You seem to be offline. Try again in a moment." });
    }
  };

  const onJourneyAction = (id: import("@/lib/journey/stage").JourneyActionId) => {
    switch (id) {
      case "send-for-review":
        sendForReview();
        return;
      case "skip-review":
        // An employee's own letter has no approver (LETTER-X25).
        if (markOwnLetterReady(draft.id)) {
          toast.success("Ready to send");
          return;
        }
        setReviewDialogKind("submit");
        return;
      case "send-for-approval":
        setReviewDialogKind("submit");
        return;
      // Recall and Finish review go through the review loop's dialogs
      // (ReviewDialogsHost): they confirm, revoke a secure link on the
      // server and tell the person what happened.
      case "recall":
        if (review) requestRecall(draft.id);
        return;
      case "finish-review":
        if (review) requestFinishReview(draft.id);
        return;
      case "approve":
        openReviewAction("approve");
        return;
      case "remind":
        void remindApprover();
        return;
      case "send-back":
        sendBackFromBar();
        return;
      case "export":
      case "download":
        return;
    }
  };

  const jumpToSection = (sectionId: string) => {
    setViewMode("edit");
    setActiveSectionId(sectionId);
    if (!isLargeViewport) setAiDrawerOpen(false);
    requestAnimationFrame(() => {
      document.querySelector(`[data-section-id="${sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const onFocusComment = (commentId: string, from?: HTMLElement) => {
    // Reply on a margin card: the thread opens under that card, beside the
    // page rather than over the letter, with the reply box focused, and
    // focus goes back to Reply when it closes (LETTER-X52).
    const card = from?.closest<HTMLElement>(".lw-margin-card");
    if (from && card) {
      setFloatingComment({
        anchor: { getRect: () => card.getBoundingClientRect(), containerEl: card, align: "end" },
        mode: { kind: "existing", commentId },
        focusReply: true,
        returnFocus: from,
      });
      return;
    }
    // The comment's highlight, else (a reviewer's comment that came with
    // only the words it is about) the paragraph holding those words, else
    // its section (LETTER-X44).
    // The highlight on screen: a hidden copy (page measuring) has no box.
    let el =
      [...document.querySelectorAll<HTMLElement>(`mark[data-comment-id="${CSS.escape(commentId)}"]`)].find(
        (m) => m.getClientRects().length > 0
      ) ?? null;
    if (!el) {
      const c = draft.comments?.find((x) => x.id === commentId);
      const sectionEl = c?.sectionId
        ? paperRef.current?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(c.sectionId)}"]`) ?? null
        : null;
      el = (sectionEl && c?.quote ? blockWithText(sectionEl, c.quote) : null) ?? sectionEl;
    }
    if (!el) return;
    const anchorEl = el;
    setFloatingComment({
      anchor: { getRect: () => anchorEl.getBoundingClientRect(), containerEl: anchorEl },
      mode: { kind: "existing", commentId },
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

  /** Fix one health check: DraftHR proposes the change, or the right place opens. */
  const fixCheck = async (check: HealthCheck) => {
    const plan = planFix(check, draft);
    const ws = useLetterWorkspace.getState();
    if (plan.kind === "ai") {
      if (!canvasEditable) return;
      // A suggestion already waiting in that section is never replaced
      // silently (as in the Review step): decide it first.
      const live = useDraftStore.getState().drafts[draft.id]?.sections.find((x) => x.id === plan.section.id);
      if (live?.pendingChange || hasPendingSuggestions(live?.html ?? "")) {
        toast("This section already has a suggested edit", {
          description: "Accept or reject it first, then Fix again.",
        });
        jumpToSection(plan.section.id);
        if (!marginFits) {
          setEditsFilter("edits");
          openPanelTab("edits");
        }
        return;
      }
      ws.setFixing(check.id, true);
      const ok = await proposeSection(plan.section, plan.instruction, plan.category);
      useLetterWorkspace.getState().setFixing(check.id, false);
      if (ok && !marginFits) {
        setEditsFilter("edits");
        openPanelTab("edits");
      }
      if (ok) jumpToSection(plan.section.id);
    } else if (plan.kind === "comments") {
      setEditsFilter("comments");
      openPanelTab("edits");
    } else if (plan.kind === "evidence") {
      openEvidence();
    } else if (plan.kind === "settings") {
      nav("/settings");
    } else {
      jumpToSection(plan.sectionId);
    }
  };

  /** Undo "marked as sent": the letter goes back to ready to send. */
  // Undo on the Sent banner clears the whole send record (the marked-sent
  // exports, the given date, the appeal dates), records "Marked as not
  // sent" and stops the seal (SEND-96 to 98).
  const undoSent = () => {
    const result = undoMarkedSent(draft.id, me || undefined);
    if (result.undone) toast(undoToastText(result));
  };

  /** The reviewer's "Send back to <asker>" in the document bar: sends with
   *  the verdict picked in Your review, or shows the verdict to pick first. */
  const sendBackFromBar = () => {
    openPanelTab("progress");
    window.setTimeout(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="reviewer-send-back"]');
      if (button && !button.disabled) {
        button.click();
        return;
      }
      const verdict = document.querySelector<HTMLElement>('[data-testid="your-review"] [role="radiogroup"][aria-label="Your verdict"]');
      verdict?.scrollIntoView({ block: "center", behavior: "smooth" });
      verdict?.querySelector<HTMLElement>('[role="radio"]')?.focus({ preventScroll: true });
      toast("Pick a verdict first", { description: "Then add a note and send it back." });
    }, 120);
  };

  /** "Message" on the out-for-review strip: the conversation with the reviewer. */
  const openReviewThread = () => {
    openPanelTab("progress");
    focusReviewReply(draft.id);
  };

  const askDraftHR = (prompt: string) => {
    openPanelTab("chat");
    window.dispatchEvent(new CustomEvent("drafthr:ask", { detail: { draftId: draft.id, prompt } }));
  };

  handlersRef.current = {
    openEdits: (filter) => {
      setEditsFilter(filter ?? "edits");
      openPanelTab("edits");
    },
    openEvidence,
    fixCheck: (c) => void fixCheck(c),
    regenerateAll: () => void runGenerateAll(),
    stop: stopStreaming,
    openReviewDialog: (kind) => openReviewAction(kind),
    withdraw: onWithdrawForReview,
    openCounsel: () => setCounselDialogOpen(true),
    openFeedback: () => setReviewFeedbackOpen(true),
    openVersions: () => {
      setActivityTab("versions");
      setActivityOpen(true);
    },
    openTimeline: () => setTimelineDialogOpen(true),
    openChecks: () => setChecksOpen(true),
    ask: askDraftHR,
    jumpToSection,
    finalise: goFinalise,
    // "See all rounds": the review loop's rounds history (RoundsList). The
    // Activity dialog keeps its own Review rounds tab too.
    openRounds: () => openRoundsHistory(draft.id),
    sendForReview: (from) => sendForReview(from),
  };
  // Live facts the stage components read (registered after render).
  liveRef.current = { draftId: draft.id, streaming, canEdit: canvasEditable, counselNeeded, counselReview };

  const bar: DocumentBarProps = {
    draft: sharedView ?? draft,
    journey,
    editor: activeEditor,
    viewMode,
    onViewMode: (m) => {
      setViewMode(m);
      try {
        window.localStorage.setItem(VIEW_KEY, m);
      } catch {
        // Private windows: the choice lasts for this letter only.
      }
    },
    pagedActions: pagedEditorActionsRef,
    backTo,
    streaming,
    canEdit: canvasEditable,
    role,
    viewerIsApprover,
    counselNeeded,
    counselReview,
    pendingEdits,
    commentCount: unresolvedComments,
    activeSection,
    people,
    saved: journey.stage === "sent" ? { kind: "locked" } : saved,
    zoom,
    onZoom: (z: number) => {
      // Zooming in past the room for the margin: its cards move to the
      // Edits tab, so open it when there is something there to decide.
      const leaving = fitsAt(zoom) && !fitsAt(z);
      setZoomChoice(z);
      if (leaving && pendingEdits + reviewerOpenComments > 0 && !viewerIsReviewer) {
        setEditsFilter("edits");
        openPanelTab("edits");
      }
    },
    panelOpen,
    onTogglePanel: togglePanel,
    outlineOpen: showSidebar,
    onToggleOutline: () => setShowSidebar((s) => !s),
    focusMode,
    onToggleFocus: () => setFocusMode((f) => !f),
    onOpenFind: () => {
      setViewMode("edit");
      setFindOpen(true);
    },
    evidenceActive: evidenceDrawerOpen || evidencePinned,
    evidencePinned,
    onEvidenceButton,
    onOpenEvidence: openEvidence,
    inviteOpen: invitePopoverOpen,
    onInviteOpenChange: setInvitePopoverOpen,
    onOpenOnMobile: () => setMobileShareOpen(true),
    onExport: letterExport.requestExport,
    exportBusy: letterExport.busy,
    onFinalise: goFinalise,
    onGoReview: goReviewStep,
    onJourneyAction,
    onSaveTemplate: saveTemplateSource,
    onSaveAsTemplate: () => setSaveAsTemplateOpen(true),
    onOpenEdits: () => {
      setEditsFilter("edits");
      openPanelTab("edits");
    },
    onAcceptAll: acceptAllEdits,
    onRejectAll: rejectAllEdits,
    onOpenComments: () => setAllCommentsOpen(true),
    onComment: commentOnSelection,
    onOpenActivity: () => {
      setActivityTab("history");
      setActivityOpen(true);
    },
    onOpenTimeline: () => setTimelineDialogOpen(true),
    onShowSectionHistory: (s) => setHistorySection(s),
    onRegenerateAll: () => void runGenerateAll(),
    onStop: stopStreaming,
    onRefineSection: () => {
      if (activeSectionId) setRefineSectionId(activeSectionId);
    },
    onEditDetails: () => setEditDetailsOpen(true),
    onReviewAction: (kind) => openReviewAction(kind),
    onWithdraw: onWithdrawForReview,
    onOpenFeedback: () => setReviewFeedbackOpen(true),
    onOpenCounsel: () => setCounselDialogOpen(true),
    onNavigate: (to) => nav(to),
  };

  // Reviewers on a locked letter can still suggest edits, per section.
  const reviewOutToMe = review?.status === "out" && Boolean(me) && review.reviewer.name.trim().toLowerCase() === me.toLowerCase();
  const reviewerMargin = teammateReview
    ? { points: teammatePoints, me: reviewMe, canWork: teammateReview.status === "out" && role !== "viewer" }
    : null;
  const teammateNumbers = suggestionNumbers(teammatePoints);
  const canSuggest =
    !canvasEditable &&
    // The named teammate suggests only in Suggest mode (Read changes nothing).
    !(viewerIsReviewer && reviewerMode !== "suggest") &&
    role !== "viewer" &&
    ((reviewStatus === "in_review" && (role === "reviewer" || viewerIsApprover)) || (review?.status === "out" && (role === "reviewer" || reviewOutToMe)));

  const sidePanel = (onClose: () => void, closeLabel: string) => (
    <LetterSidePanel
      draft={sharedView ?? draft}
      tab={panelTab}
      onTabChange={setPanelTab}
      activeSectionId={activeSectionId}
      editsFilter={editsFilter}
      onEditsFilterChange={setEditsFilter}
      canResolve={canvasEditable}
      pendingEdits={pendingEdits + reviewerOpenComments}
      onAcceptAll={acceptAllEdits}
      onRejectAll={rejectAllEdits}
      onJumpToSection={jumpToSection}
      progress={{
        journey,
        viewerIsApprover,
        viewerIsReviewer,
        viewerIsAsker,
        tickStep,
        role,
        counselNeeded,
        counselReview,
        canFix: canvasEditable,
        onOpenEvidence: openEvidence,
        onOpenCounsel: () => setCounselDialogOpen(true),
        onGoReview: goReviewStep,
        onFinalise: goFinalise,
      }}
      onOpenEvidence={openEvidence}
      onClose={onClose}
      closeLabel={closeLabel}
    />
  );

  // The journey panel (Progress) hosts the review dialogs. When it is not
  // on screen, host them here so the picker still opens.
  const journeyPanelShown =
    (panelTab === "progress" || (panelTab === "edits" && !!journey && editsShowsReview(journey, { viewerIsReviewer, viewerIsAsker }))) &&
    (isLargeViewport ? pinnedDock === "ai" && !focusMode : true);

  const pageInner = (
    <>
      <Letterhead draft={draft} fallbackName={profile.employer?.legalName} fallbackAddress={profile.employer?.address} />
      {/* The seal sits in the flow at the top right, under the letterhead,
       * and the lines beside it wrap around it: it never covers the
       * letter's words, with or without an address block, on any width. */}
      {sentAt && (
        <Seal
          date={sentAt}
          animate={sealAnimates}
          placed={false}
          size={isPhone ? 60 : 84}
          className={cn("relative z-10 float-right -rotate-[8deg]", isPhone ? "-mt-1 mb-1 ml-3" : "-mt-2 mb-2 ml-6 mr-1")}
        />
      )}
      <IssueDate draft={draft} className="m-0 mb-2 font-sans text-[13px] text-[var(--ds-muted)] md:hidden" />
      <ConfidentialLine draft={draft} />
      {draft.sections.map((section) => (
        <div key={section.id} className="group/sec relative">
          <SectionEditor
            // A new editor when the author tools come or go (the named
            // reviewer signs in on this device): the selection bubble is
            // moved out of React's tree and cannot be removed in place.
            key={viewerIsReviewer ? "reviewer" : "author"}
            draft={draft}
            section={section}
            variant="paper"
            hideToolbar
            onEditorFocus={setActiveEditor}
            onEditorReady={(ed) => setActiveEditor((cur) => (cur && !cur.isDestroyed ? cur : ed))}
            isStreaming={section.status === "streaming"}
            active={activeSectionId === section.id}
            onFocus={() => setActiveSectionId(section.id)}
            onChange={(html) => updateSection(draft.id, section.id, html)}
            onRegenerate={(instr) => void proposeSection(section, instr)}
            onClear={() => updateSection(draft.id, section.id, "")}
            onShowHistory={() => setHistorySection(section)}
            onOpenCommentsThread={() => {
              const sectionEl = document.querySelector<HTMLElement>(`[data-section-id="${section.id}"]`);
              if (!sectionEl) return;
              setFloatingComment({
                anchor: { getRect: () => sectionEl.getBoundingClientRect(), containerEl: sectionEl },
                mode: { kind: "new", sectionId: section.id },
              });
            }}
            onOpenEvidenceBinder={() => {
              setActiveSectionId(section.id);
              nav(`/editor/${draft.id}/evidence?section=${section.id}`);
            }}
            onFocusComment={onFocusComment}
            commentCount={(draft.comments ?? []).filter((c) => c.sectionId === section.id && !c.resolved).length}
            onAcceptPending={() => useDraftStore.getState().acceptSectionPending(draft.id, section.id)}
            onRejectPending={() => useDraftStore.getState().rejectSectionPending(draft.id, section.id)}
            editable={canvasEditable}
            authorChrome={!viewerIsReviewer}
          />
          {section.sectionId === "recipient_block" && <IssueDate draft={draft} className="m-0 mb-3 max-md:hidden" />}
          {phoneFlag && phoneFlag.sectionId === section.id && <PhoneFlagHint target={phoneFlag} onFix={(c) => void fixCheck(c)} />}
          {/* The teammate's own points under their paragraph when there is
           * no room for the margin (phones, narrow windows; REVIEW-138). */}
          {reviewerMargin && !marginFits && teammatePoints.some((x) => x.sectionId === section.id) && (
            <div className="mb-4 flex flex-col gap-2 font-sans" data-slot="section-points">
              {teammatePoints
                .filter((x) => x.sectionId === section.id)
                .map((x) => (
                  <div key={x.id} data-point-id={x.id}>
                    <TeammatePointCard
                      point={x}
                      n={teammateNumbers.get(x.id)}
                      me={reviewerMargin.me}
                      canWork={reviewerMargin.canWork}
                      onEdit={() => editTeammatePoint(draft.id, x)}
                      onRemove={() => removeTeammatePoint(draft.id, x)}
                      className="shadow-[var(--ds-shadow-s)]"
                    />
                  </div>
                ))}
            </div>
          )}
          {canSuggest && !section.pendingChange && section.status !== "streaming" && (
            // Shown when the paragraph is hovered or focused (always on touch
            // screens), so a reviewer's page reads as a letter, not a form.
            <div className="pointer-events-none absolute -bottom-3 right-0 z-[2] flex justify-end opacity-0 transition-opacity duration-[120ms] group-hover/sec:pointer-events-auto group-hover/sec:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:-mt-1 [@media(hover:none)]:mb-3 [@media(hover:none)]:opacity-100">
              <button
                type="button"
                onClick={() =>
                  viewerIsReviewer
                    ? openTeammateComposer({ draftId: draft.id, kind: "suggest", sectionId: section.id })
                    : setSuggestSection(section)
                }
                className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-[var(--ds-surface)] px-2.5 font-sans text-[12.5px] font-medium text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <Lightbulb className="size-3.5" />
                Suggest an edit
              </button>
            </div>
          )}
        </div>
      ))}
      {streaming && (
        <p role="status" className="mt-4 flex items-center gap-2 font-sans text-[12.5px] text-[var(--ds-muted)]">
          <Loader2 className="size-3 animate-spin" />
          Streaming sections from the model…
        </p>
      )}
    </>
  );

  return (
    <div className="lw-root relative flex min-h-0 flex-1 bg-[var(--ds-surface)]">
      <div data-page-main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {isPhone ? (
          <>
            <PhoneTopBar bar={bar} matter={matter} />
            <PhoneStrip draft={draft} journey={journey} matter={matter} />
          </>
        ) : (
          !focusMode && <DocumentBar {...bar} />
        )}

        {/* Focus mode: the section pill (top left) leaves it; the bar at the
         * bottom opens Chat. Esc also leaves. */}
        {focusMode && (
          <>
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              className="absolute left-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[12.5px] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              title="Exit focus mode (Esc)"
              aria-label="Exit focus mode"
            >
              <Minimize2 className="size-3" />
              <span className="ds-mono font-medium text-[var(--ds-body)]">
                {(() => {
                  const idx = activeSectionId ? draft.sections.findIndex((s) => s.id === activeSectionId) : -1;
                  return `${idx >= 0 ? idx + 1 : 1} / ${draft.sections.length}`;
                })()}
              </span>
              <span className="max-w-[180px] truncate">{(activeSection ?? draft.sections[0])?.title ?? "Letter"}</span>
              <span className="ds-mono ml-1 rounded bg-[var(--ds-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--ds-muted)]">Esc</span>
            </button>
            <button
              type="button"
              onClick={() => {
                openPanelTab("chat");
                focusComposer();
              }}
              className="absolute bottom-6 left-1/2 z-30 inline-flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-2.5 text-[13.5px] text-[var(--ds-muted)] shadow-[var(--ds-shadow-ask)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              title="Ask DraftHR (Ctrl or Cmd+L)"
              aria-label="Open AI agent"
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span className="flex-1 truncate text-left">Ask DraftHR anything about this letter</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)]">
                <ArrowUp className="size-3.5" />
              </span>
            </button>
          </>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <FindBar open={findOpen} onClose={() => setFindOpen(false)} rootRef={paperRef} version={draft.updatedAt} />
          <div ref={canvasRef} data-slot="letter-canvas" className="relative min-h-0 flex-1 overflow-auto bg-[var(--ds-canvas)]">
            {viewMode === "preview" ? (
              // Page view: the paginated editor. Read-only while locked or
              // while DraftHR is writing (it holds a snapshot of the letter).
              <div className="lw-pageview contents">
                <PagedlyDocEditor
                  draft={draft}
                  readOnly={!canvasEditable || streaming}
                  actionsRef={pagedEditorActionsRef}
                />
                {/* The same numbered citation boxes as the Sections view. */}
                <CitationLayer draft={draft} containerRef={canvasRef} onViewSource={openEvidence} />
              </div>
            ) : (
              <div
                className={cn(
                  isPhone
                    ? "px-3 pb-[96px] pt-3"
                    : marginFits
                      ? "pb-20 pr-4 pt-5"
                      : cn("flex justify-center px-4 pt-5 md:px-6", isLargeViewport ? "pb-20" : "pb-28")
                )}
                style={!isPhone && marginFits ? { paddingLeft: CANVAS_PAD_L } : undefined}
              >
                <div
                  ref={wrapperRef}
                  data-slot="letter-wrapper"
                  className="relative w-full"
                  style={{ maxWidth: isPhone ? undefined : pageW, minWidth: !isPhone && marginFits ? pageW : undefined }}
                >
                  <div className="mb-3 flex min-w-0 flex-col gap-3 empty:hidden">
                    {draft.isTemplateSource && <TemplateSourceBanner draft={draft} onDiscard={discardTemplateSource} />}
                    {draft.isTemplateSource && (
                      <ConfirmDialog
                        open={confirmDiscardTemplate}
                        onOpenChange={setConfirmDiscardTemplate}
                        title="Discard this template?"
                        body="This deletes the template and any saved version of it. You cannot undo this."
                        confirmLabel="Discard template"
                        destructive
                        onConfirm={doDiscardTemplateSource}
                      />
                    )}
                    <LetterNotices
                      draft={draft}
                      journey={journey}
                      review={viewerIsReviewer ? (reviewerOf ?? review) : review}
                      viewerIsReviewer={viewerIsReviewer}
                      viewerIsAsker={viewerIsAsker}
                      matter={matter}
                      employee={employee}
                      onMessage={openReviewThread}
                      onUndoSent={canSubmitForReview(role) ? undoSent : undefined}
                      animateSent={sealAnimates}
                    />
                    <DeadlineBanner draft={draft} />
                    <RetryBanner event={retryEvent} />
                  </div>

                  {/* The letter, on one white page. */}
                  <article
                    ref={paperRef}
                    aria-label="Letter"
                    data-slot="letter-page"
                    className={cn(
                      "lw-paper relative bg-[var(--ds-surface)]",
                      isPhone
                        ? "rounded-[6px] px-5 pb-7 pt-6 shadow-[var(--ds-shadow-s)]"
                        : "min-h-[905px] rounded-[3px] px-[60px] py-12 shadow-[var(--ds-shadow-paper)] max-lg:px-10",
                      sealAnimates && "ds-glow-once"
                    )}
                    style={!isPhone && zoom !== 100 ? { zoom: zoom / 100 } : undefined}
                  >
                    {pageInner}
                  </article>
                  <CitationLayer draft={draft} containerRef={paperRef} onViewSource={openEvidence} />
                  {quotedComments.length > 0 && (
                    <CommentQuoteMarks comments={quotedComments} paperRef={paperRef} wrapperRef={wrapperRef} version={draft.updatedAt} />
                  )}
                  {marginFits && (
                    <MarginLayer
                      draft={draft}
                      journey={journey}
                      review={review}
                      wrapperRef={wrapperRef}
                      canResolve={canvasEditable}
                      activity={activity}
                      onAllVersions={() => {
                        setActivityTab("versions");
                        setActivityOpen(true);
                      }}
                      // A teammate whose review was recalled or sent
                      // back has nothing to reply to here (LETTER-X44).
                      onReplyComment={viewerIsReviewer && reviewerOf?.status !== "out" ? undefined : onFocusComment}
                      onResolveComment={(commentId) => useDraftStore.getState().resolveComment(draft.id, commentId, true)}
                      onJumpToSection={jumpToSection}
                      left={pageW + MARGIN_GAP}
                      reviewer={reviewerMargin}
                    />
                  )}
                </div>
                {isPhone && <PhoneDisclaimer />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side panel (lg+): Edits / Progress / Chat, or the pinned evidence. */}
      {isLargeViewport && pinnedDock !== null && !focusMode &&
        (evidencePinned ? (
          <aside
            data-evidence-rail
            className="flex w-[380px] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)]"
          >
            <EvidenceDrawer
              draft={sharedView ?? draft}
              editor={null}
              canAdd={canvasEditable && !viewerIsReviewer}
              canManage={!viewerIsReviewer}
              open
              onOpenChange={() => {
                /* pinned mode ignores Sheet open state */
              }}
              pinned
              onPinnedChange={(next) => {
                if (next) {
                  setPinnedDock("evidence");
                  setEvidenceDrawerOpen(false);
                } else setPinnedDock("ai");
              }}
            />
          </aside>
        ) : (
          <aside
            aria-label="Letter side panel"
            className="flex w-[380px] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--ds-line)]"
          >
            {sidePanel(() => setPinnedDock(null), "Hide side panel")}
          </aside>
        ))}

      {/* Outline: the sections and the compliance or rights checklist. */}
      {showSidebar && !focusMode && (
        <>
          <button type="button" className="absolute inset-0 z-30 bg-[var(--ds-scrim)]" aria-label="Close panel" onClick={() => setShowSidebar(false)} />
          <aside
            aria-label="Outline"
            className="absolute inset-y-0 left-0 z-40 flex w-[300px] max-w-[85vw] min-h-0 flex-col overflow-hidden border-r border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)]"
          >
            <WizardSidebar
              draft={draft}
              current="edit"
              chrome={false}
              activeSectionId={activeSectionId}
              onSelectSection={(id) => {
                setShowSidebar(false);
                jumpToSection(id);
              }}
              disabled={streaming}
              secondaryTabLabel={draft.mode === "employee" ? "Rights" : "Compliance"}
              secondaryTab={draft.mode === "employee" ? <EmployeeRail draft={draft} /> : <CompliancePanel draft={draft} />}
            />
          </aside>
        </>
      )}

      {/* Desktop, panel hidden: a quiet way back to the assistant. */}
      {isLargeViewport && pinnedDock === null && !focusMode && (
        <button
          type="button"
          onClick={() => {
            openPanelTab("chat");
            focusComposer();
          }}
          className="fixed bottom-5 right-5 z-30 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--ds-accent)] pl-2.5 pr-3.5 text-[13.5px] font-medium text-[var(--ds-on-accent)] shadow-[var(--ds-shadow-m)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          aria-label="Open AI agent"
        >
          <Sparkles className="size-3.5" />
          Ask DraftHR
        </button>
      )}

      {/* Below lg: the side panel is a bottom sheet, opened from the bottom bar. */}
      {!isLargeViewport && (
        <>
          {!focusMode && (
            <PhoneBottomBar
              bar={bar}
              sheetTab={panelTab}
              sheetOpen={aiDrawerOpen}
              showMain={isPhone}
              reviewPoints={reviewerMargin ? teammatePoints.length : undefined}
              onProgress={() => {
                if (aiDrawerOpen && panelTab !== "chat") setAiDrawerOpen(false);
                else openPanelTab(!reviewerMargin && pendingEdits > 0 && panelTab === "edits" ? "edits" : "progress");
              }}
              onChat={() => {
                if (aiDrawerOpen && panelTab === "chat") setAiDrawerOpen(false);
                else openPanelTab("chat");
              }}
            />
          )}
          <button
            type="button"
            className={cn(
              "fixed inset-0 z-30 bg-[var(--ds-scrim)] transition-opacity duration-200 motion-reduce:transition-none",
              aiDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-label="Close AI drawer"
            aria-hidden={!aiDrawerOpen || undefined}
            tabIndex={aiDrawerOpen ? undefined : -1}
            onClick={() => setAiDrawerOpen(false)}
          />
          <MobileBottomSheet open={aiDrawerOpen} snap={sheetSnap} onSnapChange={setSheetSnap} onDismiss={() => setAiDrawerOpen(false)}>
            {sidePanel(() => setAiDrawerOpen(false), "Close panel")}
          </MobileBottomSheet>
        </>
      )}

      {!journeyPanelShown && <ReviewDialogsHost />}

      {letterExport.gate}

      {floatingComment && (
        <FloatingCommentPanel
          draft={draft}
          anchor={floatingComment.anchor}
          mode={floatingComment.mode}
          focusReply={floatingComment.focusReply}
          returnFocus={floatingComment.returnFocus}
          onClose={() => setFloatingComment(null)}
        />
      )}

      {/* The floating evidence drawer, when evidence is not pinned. */}
      {!evidencePinned && (
        <EvidenceDrawer
          draft={sharedView ?? draft}
          editor={null}
          canAdd={canvasEditable && !viewerIsReviewer}
          canManage={!viewerIsReviewer}
          open={evidenceDrawerOpen}
          onOpenChange={setEvidenceDrawerOpen}
          pinned={false}
          onPinnedChange={(next) => {
            if (next) {
              setPinnedDock("evidence");
              setEvidenceDrawerOpen(false);
            } else setPinnedDock("ai");
          }}
        />
      )}

      {/* Unused or missing evidence, before review. Continue opens the picker. */}
      <EvidenceHandoff
        open={handoffReason !== null}
        reason={handoffReason}
        draftId={draft.id}
        onOpenChange={(next) => {
          if (next) return;
          setHandoffReason(null);
          const back = handoffReturnFocus.current;
          handoffReturnFocus.current = null;
          // Opened from code, the dialog has no trigger to return focus to.
          window.requestAnimationFrame(() => {
            if (back?.isConnected && !document.querySelector('[role="dialog"][data-state="open"]')) back.focus();
          });
        }}
        onOpenDrawer={() => {
          setHandoffReason(null);
          if (!evidencePinned) setEvidenceDrawerOpen(true);
        }}
        onContinue={() => {
          setHandoffReason(null);
          openReviewPicker();
        }}
      />

      <CounselReviewDialog
        open={counselDialogOpen}
        onOpenChange={setCounselDialogOpen}
        existing={counselReview}
        onAttest={(reviewedBy, reviewedOn) => {
          updateAnswers(draft.id, { ...draft.answers, _counselReview: { reviewedBy, reviewedOn, attestedAt: Date.now() } });
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

      {/* All comments: click one to jump to its highlight and open the thread. */}
      <Dialog.Root open={allCommentsOpen} onOpenChange={setAllCommentsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-scrim)]" />
          <Dialog.Content className="ds-rise-in fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[520px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-xl)]">
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--ds-line-2)] px-4 py-3">
              <Dialog.Title className="m-0 inline-flex items-center gap-2 text-[14.5px] font-medium text-[var(--ds-ink)]">
                <MessageSquare className="size-4 text-[var(--ds-muted)]" /> Comments
              </Dialog.Title>
              <Dialog.Description className="sr-only">Every comment thread in this letter. Choose one to jump to it.</Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label="Close comments"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              {(() => {
                const all = draft.comments ?? [];
                const roots = all.filter((c) => !c.parentId);
                const unresolved = roots.filter((c) => !c.resolved);
                const resolved = roots.filter((c) => c.resolved);
                if (roots.length === 0) {
                  return (
                    <div className="px-6 py-12 text-center text-[13.5px] text-[var(--ds-muted)]">
                      No comments yet. Highlight any text in the document and click <em>+ Comment</em> to start a thread.
                    </div>
                  );
                }
                const jumpTo = (commentId: string) => {
                  setAllCommentsOpen(false);
                  requestAnimationFrame(() => onFocusComment(commentId));
                };
                return (
                  <div className="py-1">
                    {unresolved.length > 0 && <CommentGroup label="Unresolved" comments={unresolved} draft={draft} replyCounts={all} onJump={jumpTo} />}
                    {resolved.length > 0 && <CommentGroup label="Resolved" comments={resolved} draft={draft} replyCounts={all} onJump={jumpTo} muted />}
                  </div>
                );
              })()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Timeline (overflow menu and Review tab). */}
      <Dialog.Root open={timelineDialogOpen} onOpenChange={setTimelineDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-scrim)]" />
          <Dialog.Content className="ds-rise-in fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-xl)]">
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--ds-line-2)] px-4 py-3">
              <Dialog.Title className="m-0 inline-flex items-center gap-2 text-[14.5px] font-medium text-[var(--ds-ink)]">
                <Clock3 className="size-4 text-[var(--ds-muted)]" /> Timeline
              </Dialog.Title>
              <Dialog.Description className="sr-only">Audit timeline of regenerations, exports, comments and attestations on this letter.</Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label="Close timeline"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <TimelinePanel draft={draft} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        draft={draft}
        review={review}
        tab={activityTab}
        onTabChange={setActivityTab}
        onShowSectionHistory={(s) => {
          setActivityOpen(false);
          setHistorySection(s);
        }}
      />

      <ChecksDialog
        open={checksOpen}
        onOpenChange={setChecksOpen}
        draft={draft}
        checks={checksOpen ? runHealthChecks(draft) : []}
        canFix={canvasEditable && journey.stage === "draft"}
        onFix={(c) => {
          setChecksOpen(false);
          void fixCheck(c);
        }}
        onJump={(sid) => {
          setChecksOpen(false);
          jumpToSection(sid);
        }}
      />

      <VersionHistoryDialog
        open={Boolean(historySection)}
        onClose={() => setHistorySection(null)}
        section={historySection}
        onRestore={(html) => {
          if (!historySection) return;
          // Keep the current text as a version before replacing it.
          const current = useDraftStore.getState().drafts[draft.id]?.sections.find((s) => s.id === historySection.id);
          if (current && current.html && current.html !== html) {
            pushSectionVersion(draft.id, historySection.id, { id: `ver_${Date.now()}`, createdAt: Date.now(), html: current.html });
          }
          updateSection(draft.id, historySection.id, html);
          setHistorySection(null);
          toast("Version restored. The text it replaced is kept as a version.");
        }}
      />

      <EditDetailsSheet open={editDetailsOpen} onOpenChange={setEditDetailsOpen} draft={draft} />

      <SaveAsTemplateModal draft={draft} open={saveAsTemplateOpen} onOpenChange={setSaveAsTemplateOpen} />

      <MobileShareDialog open={mobileShareOpen} onOpenChange={setMobileShareOpen} draftId={draft.id} />

      {/* Send for approval, approve, request changes: one dialog, three kinds. */}
      {reviewDialogKind && (
        <ReviewDialog
          open
          onOpenChange={(next) => !next && setReviewDialogKind(null)}
          kind={reviewDialogKind}
          defaultReviewerName={profile.personal.preferredName || profile.personal.legalName}
          onSubmit={onReviewSubmit}
        />
      )}

      {/* The named teammate: selected words offer Suggest or Comment. */}
      {reviewerMargin && (
        <TeammateSelection draftId={draft.id} enabled={reviewerMargin.canWork} paperRef={paperRef} />
      )}

      {/* A reviewer's "Suggest an edit": an attributed proposal the author
       * accepts or rejects like DraftHR's. */}
      {suggestSection && (
        <SuggestEditDialog
          open
          onOpenChange={(next) => !next && setSuggestSection(null)}
          section={suggestSection}
          onSubmit={(proposedHtml) => {
            const ident = meIdentity(profile);
            useDraftStore.getState().proposeSectionChange(draft.id, suggestSection.id, {
              id: uid("sug"),
              createdAt: Date.now(),
              proposedHtml,
              instruction: "Suggested edit",
              source: "review",
              authorId: ident.email || ident.name,
              authorName: ident.name,
              diffViewMode: "card",
            });
            toast.success("Suggestion sent to the author");
          }}
        />
      )}

      {/* Review feedback: opened from the changes-requested pill. */}
      <Dialog.Root open={reviewFeedbackOpen} onOpenChange={setReviewFeedbackOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-scrim)]" />
          <Dialog.Content className="ds-rise-in fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 text-[13.5px] shadow-[var(--ds-shadow-xl)]">
            <div className="mb-2 flex items-center gap-2">
              <MessageSquareWarning className="size-4 text-[var(--ds-amber-fg)]" />
              <Dialog.Title className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">Review feedback</Dialog.Title>
            </div>
            {latestChangesRequest ? (
              <>
                <Dialog.Description className="mb-2 text-[12.5px] text-[var(--ds-muted)]">
                  From {latestChangesRequest.reviewerName} ·{" "}
                  {new Date(latestChangesRequest.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Dialog.Description>
                <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--ds-ink)]">{latestChangesRequest.body}</p>
              </>
            ) : (
              <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">No feedback recorded yet.</p>
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
                  <Send className="mr-1.5 size-3.5" />
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

      {/* Refine (overflow menu, Review tab): the change arrives as a suggested edit. */}
      <RefineDialog
        open={Boolean(refineSectionId)}
        onOpenChange={(next) => !next && setRefineSectionId(null)}
        sectionTitle={refineSectionId ? draft.sections.find((s) => s.id === refineSectionId)?.title : undefined}
        onRefineRegenerate={(instruction) => {
          const sec = draft.sections.find((s) => s.id === refineSectionId);
          if (sec) void proposeSection(sec, instruction);
          setRefineSectionId(null);
        }}
        onPlainRegenerate={() => {
          const sec = draft.sections.find((s) => s.id === refineSectionId);
          if (sec) void proposeSection(sec);
          setRefineSectionId(null);
        }}
      />
    </div>
  );
}

/**
 * A row in the all-comments dialog: the section, the quoted text, who and
 * when, the start of the comment. Choosing it opens the thread.
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
  comments: Array<{ id: string; sectionId: string; authorName: string; body: string; quote?: string; createdAt: number; resolved?: boolean }>;
  draft: { sections: { id: string; title: string }[]; comments?: { parentId?: string }[] };
  replyCounts: Array<{ id: string; parentId?: string }>;
  onJump: (commentId: string) => void;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "opacity-60" : undefined}>
      <div className="px-4 pb-1 pt-3 text-[12.5px] text-[var(--ds-muted)]">
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
            className="group w-full border-b border-[var(--ds-line-2)] px-4 py-3 text-left transition-colors duration-[120ms] last:border-b-0 hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-[var(--ds-muted)]">{section?.title ?? "Section"}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ds-subtle)]">{commentRelTime(c.createdAt)}</span>
            </div>
            {c.quote && <p className="m-0 mb-1 truncate text-[12.5px] italic text-[var(--ds-muted)]">"{c.quote}"</p>}
            <p className="m-0 line-clamp-2 text-[13px] text-[var(--ds-ink)]">
              <span className="font-medium">{c.authorName}:</span> {c.body}
            </p>
            {replyN > 0 && (
              <p className="m-0 mt-1 text-[11.5px] text-[var(--ds-muted)]">
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
  return new Date(ts).toLocaleDateString("en-GB");
}

/**
 * Counsel review: record who reviewed a high-risk letter, without going
 * through an export first. Saved in the draft's answers.
 */
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
  const [reviewedOn, setReviewedOn] = useState(existing?.reviewedOn ?? todayDateOnly());

  useEffect(() => {
    if (open) {
      setReviewedBy(existing?.reviewedBy ?? "");
      setReviewedOn(existing?.reviewedOn ?? todayDateOnly());
    }
  }, [open, existing?.reviewedBy, existing?.reviewedOn]);

  const canSubmit = reviewedBy.trim().length > 0 && reviewedOn.length > 0;
  const field =
    "h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] outline-none focus:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-scrim)]" />
        <Dialog.Content className="ds-rise-in fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-xl)]">
          <Dialog.Title className="m-0 inline-flex items-center gap-2 text-[15px] font-medium text-[var(--ds-ink)]">
            <ShieldCheck className="size-4 text-[var(--ds-muted)]" />
            {existing ? "Update counsel review" : "Mark counsel-reviewed"}
          </Dialog.Title>
          <Dialog.Description className="mb-4 mt-1 text-[12.5px] text-[var(--ds-muted)]">
            High-risk letters need sign-off before export. Recording it here unlocks export and adds it to the audit trail.
          </Dialog.Description>

          <div className="space-y-3">
            <div>
              <label htmlFor="counsel-by" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-ink)]">
                Reviewer name *
              </label>
              <input
                id="counsel-by"
                type="text"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                placeholder="Counsel name, role"
                className={field}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="counsel-on" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-ink)]">
                Reviewed on *
              </label>
              <input id="counsel-on" type="date" value={reviewedOn} onChange={(e) => setReviewedOn(e.target.value)} className={field} />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div>
              {existing && (
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-[6px] text-[12.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-red-fg)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                >
                  Clear attestation
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canSubmit} onClick={() => onAttest(reviewedBy.trim(), reviewedOn)}>
                {existing ? "Update" : "Mark reviewed"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
