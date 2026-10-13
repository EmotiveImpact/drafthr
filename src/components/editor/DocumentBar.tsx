import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bold,
  BookmarkPlus,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Columns2,
  Download,
  Eye,
  FileEdit,
  History,
  ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareWarning,
  Minimize2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Paperclip,
  Redo2,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stamp,
  StopCircle,
  TextSelect,
  Undo,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import type { Draft, Section } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import { canApprove, canSubmitForReview } from "@/lib/permissions";
import { useReviewUI, useReviewerMode } from "@/components/journey/review/review-ui";
import { ReviewerModeSwitch } from "@/components/journey/review/reviewer";
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { SAFE_IMAGE_ACCEPT } from "@/lib/safe-data-url";
import { cn } from "@/lib/utils";
import { finaliseBlocked, submitBlocked, type JourneyActionId, type JourneyInfo } from "@/lib/journey/stage";
import { Avatar } from "@/components/ds";
import { recipientNameFor } from "@/lib/letters/display";
import { StatusPill } from "@/components/journey/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PagedEditorActions } from "./paged-edit/types";
import type { ReviewDialogKind } from "./ReviewDialog";
import { EditableTitleBar } from "./EditableTitleBar";
import { DocumentPopover, TONE_OPTIONS } from "./DocumentPopover";
import { InvitePopover } from "./InvitePopover";
import { EvidencePickerPopover } from "./EvidencePickerPopover";
import { fileToDataUrl } from "./EditorToolbar";
import { InlineDisclaimer } from "./InlineDisclaimer";
import { EXPORT_FORMATS, type LetterExportFormat } from "./useLetterExport";

type RibbonTab = "home" | "insert" | "layout" | "review";
const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Layout" },
  { id: "review", label: "Review" },
];

export const ZOOM_LEVELS = [75, 90, 100, 110, 125, 150] as const;

/** Menus fade and rise in about 160ms and close faster. */
export const MENU_MOTION = "duration-[160ms] data-[state=closed]:duration-[100ms]";

export type BarPerson = { name: string; seed: string; title?: string; approved?: boolean; kind?: string };

export type SavedState = { kind: "saving" } | { kind: "saved"; at: number } | { kind: "locked" };

export type DocumentBarProps = {
  draft: Draft;
  journey: JourneyInfo;
  /** Tiptap editor of the section being edited (null until one is focused). */
  editor: Editor | null;
  viewMode: "edit" | "preview";
  onViewMode: (m: "edit" | "preview") => void;
  pagedActions: RefObject<PagedEditorActions | null>;
  backTo: string;
  streaming: boolean;
  /** The page can be typed into by this person right now. */
  canEdit: boolean;
  role: WorkspaceRole | undefined;
  viewerIsApprover: boolean;
  counselNeeded: boolean;
  counselReview: { reviewedBy: string; reviewedOn: string } | null;
  pendingEdits: number;
  commentCount: number;
  activeSection: Section | null;
  people: BarPerson[];
  saved: SavedState;
  zoom: number;
  onZoom: (z: number) => void;
  // Panels
  panelOpen: boolean;
  onTogglePanel: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  onOpenFind: () => void;
  // Evidence
  evidenceActive: boolean;
  evidencePinned: boolean;
  onEvidenceButton: () => void;
  onOpenEvidence: () => void;
  // Share
  inviteOpen: boolean;
  onInviteOpenChange: (open: boolean) => void;
  onOpenOnMobile: () => void;
  // Export and the journey
  onExport: (format: LetterExportFormat) => void;
  exportBusy: LetterExportFormat | null;
  onFinalise: () => void;
  /** The old Review step page (/editor/:id/review). */
  onGoReview: () => void;
  /** The journey's main action. */
  onJourneyAction: (id: JourneyActionId) => void;
  onSaveTemplate: () => void;
  onSaveAsTemplate: () => void;
  // Review and edits
  onOpenEdits: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onOpenComments: () => void;
  onComment: () => void;
  onOpenActivity: () => void;
  onOpenTimeline: () => void;
  onShowSectionHistory: (section: Section) => void;
  onRegenerateAll: () => void;
  onStop: () => void;
  onRefineSection: () => void;
  onEditDetails: () => void;
  onReviewAction: (kind: ReviewDialogKind) => void;
  onWithdraw: () => void;
  onOpenFeedback: () => void;
  onOpenCounsel: () => void;
  onNavigate: (to: string) => void;
};

/**
 * The letter's document bar (mocks f1 to f8): back, the letter's name and
 * the employee, the journey status pill, the people on the letter,
 * Evidence, Activity and the one main action for the stage, then a quiet
 * overflow menu. Under it the Home / Insert / Layout / Review ribbon and the
 * chosen tab's tools, all disabled while the letter is locked.
 */
export function DocumentBar(p: DocumentBarProps) {
  const { draft, editor } = p;
  const [tab, setTab] = useState<RibbonTab>("home");

  // Re-render on every editor transaction so active states stay current.
  const [, force] = useReducer((n: number) => n + 1, 0);
  // Formatting acts on the section being edited: the tools are live only
  // while a section has focus (or focus moved into the ribbon or one of its
  // menus, which hand it back). Otherwise they are greyed with the hint
  // "Click into a section to format it".
  const ribbonRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(Boolean(editor && !editor.isDestroyed && editor.isFocused));
    if (!editor || editor.isDestroyed) return;
    const onFocus = () => {
      setArmed(true);
      force();
    };
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const to = event?.relatedTarget as Element | null;
      const stays =
        !!to && (ribbonRef.current?.contains(to) || !!to.closest?.("[data-radix-popper-content-wrapper],[role=menu],[role=dialog]"));
      if (!stays) setArmed(false);
      force();
    };
    editor.on("transaction", force);
    editor.on("selectionUpdate", force);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("transaction", force);
      editor.off("selectionUpdate", force);
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);
  const ed = editor && !editor.isDestroyed ? editor : null;
  const canFormat = Boolean(ed) && armed && p.viewMode === "edit" && p.canEdit && !p.streaming;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="shrink-0 bg-[var(--ds-surface)]">
        <TopRow {...p} />
        {/* Ribbon: tabs and the chosen tab's tools. */}
        <div ref={ribbonRef} className="border-b border-[var(--ds-line-2)] px-4">
          <div className="flex items-center gap-0.5 pt-2" role="tablist" aria-label="Document tools">
            {RIBBON_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-[7px] px-2.5 py-[5px] text-[14px] leading-[18px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                  tab === t.id
                    ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]"
                    : "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]"
                )}
              >
                {t.label}
                {t.id === "review" && p.pendingEdits > 0 && (
                  <span className="ds-mono ml-1.5 text-[11.5px] text-[var(--ds-subtle)]">{p.pendingEdits}</span>
                )}
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-1.5 text-[12.5px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-muted)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label="DraftHR drafts, you decide. Not legal advice."
                >
                  <Info aria-hidden className="size-[13px]" />
                  <span className="hidden xl:inline">DraftHR drafts, you decide. Not legal advice.</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className={cn("w-[340px] p-2", MENU_MOTION)}>
                <InlineDisclaimer draft={draft} />
              </PopoverContent>
            </Popover>
          </div>
          {tab === "home" && <ToolsRow tools={homeTools({ ...p, ed, canFormat })} saved={p.saved} resetKey={`home:${p.viewMode}`} />}
          {tab === "insert" && <InsertRow {...p} ed={ed} canFormat={canFormat} resetKey="insert" />}
          {tab === "layout" && <LayoutRow {...p} resetKey="layout" />}
          {tab === "review" && <ToolsRow tools={reviewTools(p)} saved={p.saved} resetKey="review" />}
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------ Top row ---------------------------------- */

function TopRow(p: DocumentBarProps) {
  const reviewerBack = useJustBack(p.draft.id);
  const { draft, journey } = p;
  const evidenceCount = draft.evidence?.length ?? 0;
  const reviewStatus = draft.reviewStatus ?? "draft";
  // The named teammate reviewer's bar (V1): Evidence and Activity keep only
  // their icons (names stay for screen readers) so the Read, Suggest and
  // Comment switch can show its words beside the letter's name (REVIEW-88).
  const reviewer = journey.primaryAction?.id === "send-back";
  const squeeze = useTitleSqueeze(
    [draft.title, recipientNameFor(draft), journey.statusLabel, p.counselNeeded, p.counselReview?.reviewedBy, p.streaming, reviewStatus].join("|")
  );
  return (
    <div className="@container flex h-[60px] min-w-0 items-center gap-1 border-b border-[var(--ds-line-2)] pl-3 pr-3.5 @min-[900px]:gap-1.5">
      <Link
        to={p.backTo}
        aria-label="Back to letters"
        title="Back to letters"
        className="grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <ArrowLeft className="size-[18px]" />
      </Link>
      {/* The name and its pills take the room between the back arrow and the
       * actions. When the name would be cut short, the employee moves under
       * it, then the counsel pill drops to its icon (useTitleSqueeze). */}
      <div ref={squeeze.ref} className="flex min-w-0 flex-1 items-center overflow-hidden">
      <div data-bar-title className="ml-0.5 mr-1.5 flex min-w-[96px] shrink items-center">
        <EditableTitleBar draft={draft} variant="bar" stack={squeeze.level >= 1} />
      </div>
      {p.streaming && (
        <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]" role="status">
          <Loader2 className="size-3 animate-spin" /> Drafting…
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1.5">
        {reviewStatus === "changes_requested" ? (
          <button
            type="button"
            onClick={p.onOpenFeedback}
            title="The approver asked for changes. Read the feedback."
            className="rounded-[6px] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <StatusPill key={journey.statusLabel} tone={journey.statusTone} className="lw-fade-in cursor-pointer">
              {journey.statusLabel}
            </StatusPill>
          </button>
        ) : (
          <StatusPill key={journey.statusLabel} tone={journey.statusTone} className="lw-fade-in">
            {journey.statusLabel}
          </StatusPill>
        )}
        {/* One pill only (mocks f1 to f8): the stage. A high-risk letter's
         * counsel sign-off is the "Counsel review" tool in the row below and
         * the More menu, and the Send step says so before the download. */}
      </span>
      </div>

      <InvitePopover
        draft={draft}
        open={p.inviteOpen}
        onOpenChange={p.onInviteOpenChange}
        onOpenOnPhone={p.onOpenOnMobile}
        trigger={
          <button
            type="button"
            className="ml-0.5 mr-1 hidden shrink-0 items-center rounded-full pl-1.5 transition-opacity duration-[120ms] hover:opacity-85 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] @min-[680px]:inline-flex @min-[900px]:ml-2 @min-[900px]:mr-1.5"
            aria-label="Invite"
            title="Share and invite people"
          >
            {p.people.map((person, i) => (
              // Earlier avatars sit on top and the overlap is small, so every
              // set of initials stays readable.
              <span key={person.seed + i} className={cn("relative", i > 0 && "-ml-1")} style={{ zIndex: p.people.length - i }}>
                <Avatar size="lg" name={person.name} seed={person.seed} title={person.title ?? person.name} className="ring-2 ring-[var(--ds-surface)]" />
                {(person.approved || (reviewerBack && person.kind === "reviewer")) && (
                  <span
                    aria-label={person.approved ? `${person.name} approved` : `${person.name} sent it back`}
                    className="lw-okb absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-[var(--ds-green-solid)] text-white ring-2 ring-[var(--ds-surface)]"
                  >
                    <Check className="size-2" strokeWidth={3.2} />
                  </span>
                )}
              </span>
            ))}
          </button>
        }
      />

      {/* Evidence: toggles the floating drawer, or focuses the pinned one. */}
      <button
        type="button"
        onClick={p.onEvidenceButton}
        aria-pressed={p.evidenceActive}
        aria-label={`Evidence${evidenceCount ? `, ${evidenceCount} ${evidenceCount === 1 ? "file" : "files"}` : ""}`}
        title={p.evidencePinned ? "Evidence is open in the side panel" : "Evidence for this letter"}
        className={cn(
          "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-[7px] text-[14px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
          p.evidenceActive && "bg-[var(--ds-surface-2)]"
        )}
      >
        <Paperclip className="size-4" />
        <span className={cn("hidden", !reviewer && "@min-[860px]:inline")}>Evidence</span>
        {evidenceCount > 0 && (
          <span className="ds-mono rounded-[5px] bg-[var(--ds-surface-3)] px-1.5 text-[12px] font-medium text-[var(--ds-muted)]">
            {evidenceCount}
          </span>
        )}
      </button>

      {squeeze.level < 4 && <button
        type="button"
        onClick={p.onOpenActivity}
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-[7px] text-[14px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        aria-label="Activity"
        title="Activity: the letter's history and saved versions"
      >
        <History className="size-4" />
        <span className={cn("hidden", !reviewer && "@min-[860px]:inline")}>Activity</span>
      </button>}

      {reviewer && <BarReviewerMode draftId={draft.id} disabled={p.role === "viewer"} compact={squeeze.level >= 3} />}

      <MainAction {...p} short={squeeze.level >= 5} />

      <MoreMenu {...p} activityInMenu={squeeze.level >= 4} />
    </div>
  );
}

/** How much the document bar's name area has to give: 0 shows "Name ·
 *  Employee" on one row with the counsel pill's words; 1 puts the employee
 *  under the name; 2 also drops the counsel pill to its icon; 3 also drops
 *  the reviewer's Read / Suggest / Comment switch to its icons (names stay
 *  for screen readers); 4 also moves Activity into the More menu; 5 also
 *  shortens "Send back to <name>" to "Send back". It steps up
 *  before paint while the name or employee is cut short, and starts again
 *  from 0 when the room or the words change, so the name is never cut to
 *  a letter or two while there is a way to make room. */
function useTitleSqueeze(sig: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const lastW = useRef(0);
  useLayoutEffect(() => {
    setLevel(0);
  }, [sig]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      if (w !== lastW.current) {
        lastW.current = w;
        setLevel(0);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || level >= 5) return;
    const cut =
      el.scrollWidth > el.clientWidth + 1 ||
      Array.from(el.querySelectorAll<HTMLElement>("[data-bar-title] button, [data-bar-employee]")).some(
        (x) => x.offsetParent !== null && x.scrollWidth > x.clientWidth + 1
      );
    if (cut) setLevel((l) => Math.min(5, l + 1));
  });
  return { ref, level };
}

/** True for a moment after the review on this letter came back while it was
 *  open (REVIEW-85): the reviewer's avatar shows a brief green tick. */
function useJustBack(draftId: string): boolean {
  const at = useReviewUI((s) => (s.justBack?.draftId === draftId ? s.justBack.at : 0));
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!at) return;
    const left = 2600 - (Date.now() - at);
    if (left <= 0) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), left);
    return () => window.clearTimeout(t);
  }, [at]);
  return on;
}

/** The named teammate reviewer's Read / Suggest / Comment switch (shared
 *  with Your review in the Progress panel). It shows its words while the
 *  bar has room and drops to icons only when the letter's name would
 *  otherwise be cut short (useTitleSqueeze level 3). */
function BarReviewerMode({ draftId, disabled, compact }: { draftId: string; disabled: boolean; compact: boolean }) {
  const [mode, setMode] = useReviewerMode(draftId);
  return <ReviewerModeSwitch mode={mode} onChange={setMode} disabled={disabled} compact={compact} className="ml-1 shrink-0" />;
}

/** The one main action on the far right of the bar, by stage. */
export function MainAction(p: DocumentBarProps & { size?: "bar" | "phone"; short?: boolean }) {
  const { draft, journey, role } = p;
  const phone = p.size === "phone";
  const base = phone
    ? "inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 text-[14.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
    : "ml-1 inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[14px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";
  const dark = "bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]";
  const ghost =
    "border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)]";
  const off = "opacity-35 cursor-not-allowed";

  if (draft.isTemplateSource) {
    return (
      <button
        type="button"
        disabled={p.streaming}
        onClick={p.onSaveTemplate}
        aria-label="Save template"
        title="Save template"
        className={cn(base, dark, "disabled:opacity-35")}
      >
        <BookmarkPlus className="size-[15px]" />
        Save template
      </button>
    );
  }

  const action = journey.primaryAction;
  if (!action) return null;

  if (action.id === "export" || action.id === "download") {
    return <ExportMenu {...p} label={action.id === "export" ? "Export" : "Download"} className={cn(base, action.id === "export" && phone ? dark : ghost)} chevron={action.id === "export"} />;
  }

  // Who may take the action.
  let blockedReason: string | undefined;
  if ((action.id === "send-for-review" || action.id === "send-for-approval" || action.id === "recall" || action.id === "finish-review" || action.id === "remind") && !canSubmitForReview(role)) {
    blockedReason = "Viewers can read this letter but cannot move it on.";
  }
  if (action.id === "send-back" && role === "viewer") blockedReason = "Viewers can read this letter but cannot send a review back.";
  if (action.id === "approve" && !canApprove(role)) blockedReason = "Only an owner, admin or reviewer can approve.";
  const disabled = Boolean(action.disabled) || Boolean(blockedReason) || (p.streaming && action.id.startsWith("send"));
  const reason =
    blockedReason ?? (action.disabled ? action.reason : p.streaming && action.id.startsWith("send") ? "DraftHR is still drafting." : undefined);

  const icon =
    action.id === "send-for-review" ? (
      <Eye className="size-[15px]" />
    ) : action.id === "send-for-approval" ? (
      <Stamp className="size-[15px]" />
    ) : action.id === "recall" ? (
      <Undo2 className="size-[15px]" />
    ) : action.id === "finish-review" || action.id === "approve" ? (
      <Check className="size-[15px]" />
    ) : action.id === "remind" ? (
      <Bell className="size-[15px]" />
    ) : action.id === "send-back" ? (
      <Send className="size-[15px]" />
    ) : null;
  const tone = action.id === "recall" || action.id === "remind" ? ghost : dark;
  const button = (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      data-journey-action={action.id}
      onClick={() => {
        if (disabled) return;
        p.onJourneyAction(action.id);
      }}
      className={cn(base, tone, disabled && off, disabled && "hover:bg-[var(--ds-accent)]")}
    >
      {icon && <span className={phone ? "contents" : "hidden @min-[900px]:contents"}>{icon}</span>}
      {p.short && action.id === "send-back" ? (
        <>
          Send back<span className="sr-only">{action.label.replace(/^Send back/, "")}</span>
        </>
      ) : (
        action.label
      )}
      {disabled && reason && <span className="sr-only">. {reason}</span>}
    </button>
  );
  if (!disabled || !reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px]">
        {reason} {action.id.startsWith("send") && !blockedReason ? "Fix it in Progress to send." : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function ExportMenu(p: DocumentBarProps & { label: string; className: string; chevron?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(p.className, !p.className.includes("ml-1") ? "" : "")} aria-label={p.label} title={p.label === "Export" ? "Export the letter" : "Download the letter"}>
          {p.exportBusy ? <Loader2 className="size-[15px] animate-spin" /> : <Download className="size-[15px]" />}
          {p.label}
          {p.chevron && <ChevronDown className="size-[14px]" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-[260px]", MENU_MOTION)}>
        <ExportItems {...p} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Download as" and the four formats, shared by the Export menu and the
 * overflow menu (exports stay reachable before approval). */
function ExportItems(p: DocumentBarProps) {
  return (
    <>
      <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">Download as</DropdownMenuLabel>
      {EXPORT_FORMATS.map((f) => (
        <DropdownMenuItem key={f.format} disabled={Boolean(p.exportBusy) || p.streaming} onClick={() => p.onExport(f.format)}>
          <span className="flex-1">{f.label}</span>
          <span className="ds-mono text-[11px] text-[var(--ds-muted)]">{f.ext}</span>
        </DropdownMenuItem>
      ))}
      {p.counselNeeded && !p.counselReview && (
        <p className="m-0 px-2 pb-1.5 pt-1 text-[11.5px] leading-snug text-[var(--ds-muted)]">
          High-risk letter. You will be asked who reviewed it first.
        </p>
      )}
    </>
  );
}

/** Overflow: everything from the old File, Tools and View menus. On the
 * phone it also carries Evidence, Activity and the formatting tools. */
export function MoreMenu(p: DocumentBarProps & { phone?: boolean; trigger?: ReactNode; activityInMenu?: boolean }) {
  const { draft, role, journey } = p;
  const reviewStatus = draft.reviewStatus ?? "draft";
  const ed = p.editor && !p.editor.isDestroyed ? p.editor : null;
  const canFormat = Boolean(ed) && p.viewMode === "edit" && p.canEdit && !p.streaming;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {p.trigger ?? (
          <button
            type="button"
            className="grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            aria-label="More"
            title="More"
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("min-w-[248px]", MENU_MOTION)}>
        {!p.phone && p.activityInMenu && (
          <>
            <DropdownMenuItem onClick={p.onOpenActivity}>
              <History className="mr-2 size-4" /> Activity
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {p.phone && (
          <>
            <DropdownMenuItem onClick={p.onOpenEvidence}>
              <Paperclip className="mr-2 size-4" /> Evidence
              {(draft.evidence?.length ?? 0) > 0 && (
                <span className="ds-mono ml-auto text-[11px] text-[var(--ds-muted)]">{draft.evidence?.length}</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={p.onOpenActivity}>
              <History className="mr-2 size-4" /> Activity
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Bold className="mr-2 size-4" /> Format
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[200px]">
                {!canFormat && (
                  <p className="m-0 px-2 py-1.5 text-[11.5px] text-[var(--ds-muted)]">
                    {p.canEdit ? "Tap into a section to format it." : "The letter is locked."}
                  </p>
                )}
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().undo().run()}>
                  <Undo2 className="mr-2 size-4" /> Undo
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().redo().run()}>
                  <Redo2 className="mr-2 size-4" /> Redo
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBold().run()}>
                  <Bold className="mr-2 size-4" /> Bold
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().toggleItalic().run()}>
                  <Italic className="mr-2 size-4" /> Italic
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBulletList().run()}>
                  <List className="mr-2 size-4" /> Bullets
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().toggleOrderedList().run()}>
                  <ListOrdered className="mr-2 size-4" /> Numbered list
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("left").run()}>
                  <AlignLeft className="mr-2 size-4" /> Align left
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("center").run()}>
                  <AlignCenter className="mr-2 size-4" /> Align centre
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("right").run()}>
                  <AlignRight className="mr-2 size-4" /> Align right
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("justify").run()}>
                  <AlignJustify className="mr-2 size-4" /> Justify
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={p.onOpenFind}>
                  <Search className="mr-2 size-4" /> Find in letter
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!p.canEdit}>
                <Sparkles className="mr-2 size-4" /> Tone
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[200px]">
                <ToneItems draft={draft} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={p.onEditDetails}>
          <Settings2 className="mr-2 size-4" /> Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={p.onOpenComments}>
          <MessageSquare className="mr-2 size-4" /> Comments
          {p.commentCount > 0 && <span className="ds-mono ml-auto text-[11px] text-[var(--ds-muted)]">{p.commentCount}</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={p.onOpenTimeline}>
          <Clock3 className="mr-2 size-4" /> Timeline
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {p.streaming ? (
          <DropdownMenuItem onClick={p.onStop}>
            <StopCircle className="mr-2 size-4" /> Stop generation
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={!p.canEdit} onClick={p.onRegenerateAll}>
            <Sparkles className="mr-2 size-4" /> Regenerate all sections
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!p.activeSection || !p.canEdit} onClick={p.onRefineSection}>
          <Wand2 className="mr-2 size-4" /> Refine current section…
        </DropdownMenuItem>
        {!draft.isTemplateSource && (
          <>
            <DropdownMenuSeparator />
            {(reviewStatus === "draft" || reviewStatus === "changes_requested") && canSubmitForReview(role) && (
              <DropdownMenuItem
                disabled={journey.locked || p.streaming || Boolean(submitBlocked(journey))}
                title={submitBlocked(journey) ?? undefined}
                onClick={() => p.onReviewAction("submit")}
              >
                <Send className="mr-2 size-4" /> {reviewStatus === "changes_requested" ? "Re-submit for approval…" : "Submit for approval…"}
              </DropdownMenuItem>
            )}
            {reviewStatus === "in_review" && (
              <>
                {canSubmitForReview(role) && (
                  <DropdownMenuItem onClick={p.onWithdraw}>
                    <Undo className="mr-2 size-4" /> Withdraw from review
                  </DropdownMenuItem>
                )}
                {/* Only the named approver approves (as in the Approve step):
                 * the person who sent it to Ruth cannot approve it themselves. */}
                {canApprove(role) && p.viewerIsApprover && (
                  <>
                    <DropdownMenuItem onClick={() => p.onReviewAction("approve")}>
                      <CheckCircle2 className="mr-2 size-4" /> Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => p.onReviewAction("request_changes")}>
                      <MessageSquareWarning className="mr-2 size-4" /> Request changes…
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            <DropdownMenuItem onClick={p.onSaveAsTemplate}>
              <BookmarkPlus className="mr-2 size-4" /> Save as template
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download className="mr-2 size-4" /> Export
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[260px]">
                <ExportItems {...p} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={p.onGoReview}>
              <CheckCircle2 className="mr-2 size-4" /> Review step
            </DropdownMenuItem>
            {/* The full Finalise page sends the letter, so it waits for the
             * journey: not while it is out for review or with the approver,
             * and not past a failing required check. */}
            <DropdownMenuItem
              disabled={Boolean(finaliseBlocked(journey))}
              title={finaliseBlocked(journey) ?? undefined}
              onClick={p.onFinalise}
            >
              <Send className="mr-2 size-4" /> Finalise and send…
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={p.onOpenOnMobile} data-testid="open-on-mobile-menu-item">
          <Smartphone className="mr-2 size-4" /> Open on mobile…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => p.onInviteOpenChange(true)}>
          <Share2 className="mr-2 size-4" /> Share and invite…
        </DropdownMenuItem>
        {!p.phone && (
          <>
            <DropdownMenuItem onClick={p.onToggleFocus}>
              {p.focusMode ? <Minimize2 className="mr-2 size-4" /> : <Maximize2 className="mr-2 size-4" />}
              {p.focusMode ? "Exit focus mode" : "Enter focus mode"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={p.onToggleOutline}>
              <PanelLeft className="mr-2 size-4" /> {p.outlineOpen ? "Hide outline" : "Show outline"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={p.onTogglePanel}>
              <PanelRight className="mr-2 size-4" /> {p.panelOpen ? "Hide side panel" : "Show side panel"}
            </DropdownMenuItem>
          </>
        )}
        {p.phone && (
          <DropdownMenuItem onClick={p.onToggleOutline}>
            <PanelLeft className="mr-2 size-4" /> {p.outlineOpen ? "Hide outline" : "Show outline"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => p.onNavigate("/settings")}>
          <Settings2 className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => p.onNavigate("/privacy")}>
          <ShieldCheck className="mr-2 size-4" /> Privacy and data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToneItems({ draft }: { draft: Draft }) {
  const { options, current, setTone } = TONE_OPTIONS(draft);
  return (
    <>
      {options.map((o) => (
        <DropdownMenuItem key={o.value} onClick={() => setTone(o.value)}>
          <span className="flex-1">{o.label}</span>
          {o.value === current && <Check className="size-3.5" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/* ---------------------------- Ribbon rows ------------------------------- */

type FormatProps = DocumentBarProps & { ed: Editor | null; canFormat: boolean };

/**
 * One tool in a ribbon row. `inline` is the button in the row; `menu` is
 * the same action as a menu item, used when the row has no room for it and
 * it moves into the row's "More tools" menu. `drop` orders what moves first
 * (highest first); 0 or undefined never moves. `sep` draws a thin separator
 * before the tool when something visible comes before it.
 */
type Tool = { key: string; inline: ReactNode; menu?: ReactNode; drop?: number; sep?: boolean };

/**
 * A ribbon tools row that never scrolls sideways: when the tools do not fit,
 * the saved indicator turns compact, then tools move one by one (by their
 * `drop` order) into a "More tools" menu at the end of the row. It measures
 * itself, so it adapts to the real room (side panel open or not, zoom).
 */
function ToolsRow({ tools, saved, resetKey }: { tools: Tool[]; saved: SavedState; resetKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const droppable = tools.filter((t) => t.drop && t.menu).sort((a, b) => (b.drop ?? 0) - (a.drop ?? 0));
  const maxLevel = droppable.length + 1;
  const sig = tools.map((t) => t.key).join("|");

  // Start from everything inline when the row, the room or the tools change.
  const lastW = useRef(0);
  useLayoutEffect(() => {
    setLevel(0);
  }, [resetKey, sig]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      if (w !== lastW.current) {
        lastW.current = w;
        setLevel(0);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Too wide: take the next step (before paint, so nothing is ever cut off).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 1 && level < maxLevel) setLevel((l) => Math.min(maxLevel, l + 1));
  });

  const compactSaved = level >= 1;
  const dropped = new Set(droppable.slice(0, Math.max(0, level - 1)).map((t) => t.key));
  const shown = tools.filter((t) => !dropped.has(t.key));
  const menu = tools.filter((t) => dropped.has(t.key));
  return (
    <div ref={ref} className="flex h-[46px] min-w-0 items-center gap-0.5 overflow-hidden">
      {shown.map((t, i) => (
        <span key={t.key} className="contents">
          {t.sep && i > 0 && <Sep />}
          {t.inline}
        </span>
      ))}
      {menu.length > 0 && (
        <>
          <Sep />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-[var(--ds-body)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                aria-label="More tools"
                title="More tools"
              >
                <MoreHorizontal className="size-[17px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn("min-w-[220px]", MENU_MOTION)} onCloseAutoFocus={(e) => e.preventDefault()}>
              {menu.map((t, i) => (
                <span key={t.key} className="contents">
                  {t.sep && i > 0 && <DropdownMenuSeparator />}
                  {t.menu}
                </span>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <SavedIndicator saved={saved} compact={compactSaved} />
    </div>
  );
}

/** A menu item for a tool that moved into "More tools". */
function MItem({
  icon,
  label,
  onClick,
  disabled,
  active,
  hint,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  hint?: string;
}) {
  return (
    <DropdownMenuItem disabled={disabled} onClick={onClick} title={disabled && hint ? `${label}. ${hint}` : undefined}>
      <span className="mr-2 inline-flex size-4 items-center justify-center [&>svg]:size-4">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <Check className="size-3.5" />}
    </DropdownMenuItem>
  );
}

function homeTools(p: FormatProps): Tool[] {
  const { ed, canFormat } = p;
  const page = p.viewMode === "preview";
  const locked = !p.canEdit;
  // Pressed states show for the section being edited, not before a click.
  const focused = Boolean(ed?.isFocused);
  const style = !ed
    ? "Paragraph"
    : ed.isActive("heading", { level: 2 })
      ? "Heading 2"
      : ed.isActive("heading", { level: 3 })
        ? "Heading 3"
        : "Paragraph";
  // Why a format tool is greyed out.
  const hint = locked ? "The letter is locked" : p.streaming ? "DraftHR is still drafting" : "Click into a section to format it";
  const tools: Tool[] = [
    {
      key: "outline",
      inline: (
        <RBtn label={p.outlineOpen ? "Hide sections outline" : "Sections outline"} active={p.outlineOpen} onClick={p.onToggleOutline}>
          <PanelLeft className="size-[17px]" />
        </RBtn>
      ),
    },
    {
      key: "undo",
      sep: true,
      inline: (
        <RBtn
          label="Undo"
          hint={!page ? hint : undefined}
          disabled={page ? locked : !canFormat || !ed?.can().undo()}
          onClick={() => (page ? p.pagedActions.current?.undo() : ed?.chain().focus().undo().run())}
        >
          <Undo2 className="size-[17px]" />
        </RBtn>
      ),
    },
    {
      key: "redo",
      inline: (
        <RBtn
          label="Redo"
          hint={!page ? hint : undefined}
          disabled={page ? locked : !canFormat || !ed?.can().redo()}
          onClick={() => (page ? p.pagedActions.current?.redo() : ed?.chain().focus().redo().run())}
        >
          <Redo2 className="size-[17px]" />
        </RBtn>
      ),
    },
    {
      key: "zoom",
      sep: true,
      drop: 2,
      inline: <ZoomMenu zoom={p.zoom} onZoom={p.onZoom} disabled={page} />,
      menu: (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={page}>
            <Search className="mr-2 size-4" /> Zoom <span className="ds-mono ml-auto pl-3 text-[11.5px] text-[var(--ds-muted)]">{p.zoom}%</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[120px]">
            {ZOOM_LEVELS.map((z) => (
              <DropdownMenuItem key={z} onClick={() => p.onZoom(z)}>
                <span className="ds-mono flex-1">{z}%</span>
                {z === p.zoom && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ),
    },
  ];
  if (page) {
    tools.push(
      {
        key: "select-all",
        sep: true,
        inline: (
          <RBtn label="Select all" disabled={locked} onClick={() => p.pagedActions.current?.selectAll()} text="Select all">
            <TextSelect className="size-4" />
          </RBtn>
        ),
      },
      {
        key: "page-find",
        inline: (
          <RBtn label="Find in letter" onClick={() => p.pagedActions.current?.openFind()} text="Find">
            <Search className="size-4" />
          </RBtn>
        ),
      },
      {
        key: "page-note",
        sep: true,
        drop: 9,
        inline: (
          <span className="shrink-0 whitespace-nowrap px-1.5 text-[12.5px] text-[var(--ds-muted)]">
            Page view. Switch to Sections in Layout to format a section.
          </span>
        ),
        menu: (
          <p className="m-0 px-2 py-1.5 text-[12px] text-[var(--ds-muted)]">Page view. Switch to Sections in Layout to format a section.</p>
        ),
      }
    );
    return tools;
  }
  const fmt = (
    key: string,
    label: string,
    icon: ReactNode,
    active: boolean | undefined,
    run: () => void,
    drop?: number,
    sep?: boolean
  ): Tool => ({
    key,
    sep,
    drop,
    inline: (
      <RBtn label={label} hint={hint} active={focused && active} disabled={!canFormat} onClick={run}>
        {icon}
      </RBtn>
    ),
    menu: <MItem icon={icon} label={label} hint={hint} disabled={!canFormat} active={focused && active} onClick={run} />,
  });
  tools.push(
    {
      key: "style",
      sep: true,
      inline: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!canFormat}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[13.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              aria-label={`Text style: ${style}`}
              title={!canFormat ? `Text style. ${hint}` : "Text style"}
            >
              {style}
              <ChevronDown className="size-[14px] text-[var(--ds-subtle)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={cn("w-[180px]", MENU_MOTION)} onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem onClick={() => ed?.chain().focus().setParagraph().run()}>Paragraph</DropdownMenuItem>
            <DropdownMenuItem onClick={() => ed?.chain().focus().toggleHeading({ level: 2 }).run()}>Heading 2</DropdownMenuItem>
            <DropdownMenuItem onClick={() => ed?.chain().focus().toggleHeading({ level: 3 }).run()}>Heading 3</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    { key: "tone", inline: <DocumentPopover draft={p.draft} variant="tools" disabled={locked} /> },
    fmt("bold", "Bold", <Bold className="size-4" />, ed?.isActive("bold"), () => ed?.chain().focus().toggleBold().run(), undefined, true),
    fmt("italic", "Italic", <Italic className="size-4" />, ed?.isActive("italic"), () => ed?.chain().focus().toggleItalic().run()),
    fmt("bullets", "Bullets", <List className="size-[17px]" />, ed?.isActive("bulletList"), () => ed?.chain().focus().toggleBulletList().run(), 3, true),
    fmt("numbered", "Numbered list", <ListOrdered className="size-[17px]" />, ed?.isActive("orderedList"), () => ed?.chain().focus().toggleOrderedList().run(), 4),
    fmt("left", "Align left", <AlignLeft className="size-[17px]" />, ed?.isActive({ textAlign: "left" }), () => ed?.chain().focus().setTextAlign("left").run(), 5, true),
    fmt("centre", "Align centre", <AlignCenter className="size-[17px]" />, ed?.isActive({ textAlign: "center" }), () => ed?.chain().focus().setTextAlign("center").run(), 6),
    fmt("right", "Align right", <AlignRight className="size-[17px]" />, ed?.isActive({ textAlign: "right" }), () => ed?.chain().focus().setTextAlign("right").run(), 7),
    fmt("justify", "Justify", <AlignJustify className="size-[17px]" />, ed?.isActive({ textAlign: "justify" }), () => ed?.chain().focus().setTextAlign("justify").run(), 8),
    {
      key: "find",
      sep: true,
      drop: 9,
      inline: (
        <RBtn label="Find in letter" disabled={locked} onClick={p.onOpenFind}>
          <Search className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Search />} label="Find in letter" disabled={locked} onClick={p.onOpenFind} />,
    }
  );
  return tools;
}

function ZoomMenu({ zoom, onZoom, disabled }: { zoom: number; onZoom: (z: number) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[13.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          aria-label={`Zoom ${zoom}%`}
          title="Zoom"
        >
          <span className="ds-mono">{zoom}%</span>
          <ChevronDown className="size-[14px] text-[var(--ds-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn("w-[120px]", MENU_MOTION)}>
        {ZOOM_LEVELS.map((z) => (
          <DropdownMenuItem key={z} onClick={() => onZoom(z)}>
            <span className="ds-mono flex-1">{z}%</span>
            {z === zoom && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SavedIndicator({ saved, className, compact }: { saved: SavedState; className?: string; compact?: boolean }) {
  // Re-render every 30s so "2 min ago" stays true.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);
  const text = saved.kind === "saving" ? "Saving" : saved.kind === "locked" ? "Locked after sending" : `Saved ${agoText(saved.at)}`;
  return (
    <span
      aria-live="polite"
      title={compact ? text : undefined}
      className={cn("ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pl-3 text-[12.5px] text-[var(--ds-subtle)]", className)}
    >
      {saved.kind === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      <span className={compact ? "sr-only" : undefined}>{text}</span>
    </span>
  );
}

export function agoText(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function InsertTools(p: FormatProps & { fileRef: RefObject<HTMLInputElement | null>; pickerOpen: boolean; setPickerOpen: (o: boolean) => void }): Tool[] {
  const { ed, canFormat, draft, fileRef, pickerOpen, setPickerOpen } = p;
  const evidenceCount = draft.evidence?.length ?? 0;
  const linkRun = () => promptLink(ed);
  return [
    {
      key: "citation",
      inline:
        ed && canFormat && evidenceCount > 0 ? (
          <EvidencePickerPopover
            draft={draft}
            editor={ed}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onOpenDrawer={() => {
              setPickerOpen(false);
              p.onOpenEvidence();
            }}
            trigger={
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[13.5px] text-[var(--ds-body)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                aria-label={`Insert evidence at cursor (${evidenceCount} ${evidenceCount === 1 ? "item" : "items"})`}
                title="Insert evidence at the cursor (or type / in the letter)"
              >
                <Paperclip className="size-4" /> Citation
              </button>
            }
          />
        ) : (
          <RBtn
            label={evidenceCount > 0 ? "Click into a section to insert a citation" : "Add evidence first to insert citations"}
            disabled
            onClick={() => {}}
            text="Citation"
          >
            <Paperclip className="size-4" />
          </RBtn>
        ),
    },
    {
      key: "image",
      drop: 3,
      inline: (
        <RBtn label="Insert image (or paste or drop one)" disabled={!canFormat} onClick={() => fileRef.current?.click()} text="Image">
          <ImageIcon className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<ImageIcon />} label="Image" disabled={!canFormat} onClick={() => fileRef.current?.click()} />,
    },
    {
      key: "link",
      drop: 4,
      inline: <LinkBtn ed={ed} disabled={!canFormat} text="Link" />,
      menu: <MItem icon={<LinkIcon />} label="Link" disabled={!canFormat} onClick={linkRun} />,
    },
    {
      key: "comment",
      drop: 2,
      inline: (
        <RBtn label="Comment on the selected text" disabled={!p.activeSection} onClick={p.onComment} text="Comment">
          <MessageSquarePlus className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<MessageSquarePlus />} label="Comment" disabled={!p.activeSection} onClick={p.onComment} />,
    },
    {
      key: "evidence",
      sep: true,
      drop: 1,
      inline: (
        <RBtn label="Open evidence" onClick={p.onOpenEvidence} text={evidenceCount > 0 ? `Evidence (${evidenceCount})` : "Add evidence"}>
          <Paperclip className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Paperclip />} label={evidenceCount > 0 ? `Evidence (${evidenceCount})` : "Add evidence"} onClick={p.onOpenEvidence} />,
    },
  ];
}

function InsertRow(p: FormatProps & { resetKey: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { ed } = p;
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={SAFE_IMAGE_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !ed) return;
          const src = await fileToDataUrl(file);
          if (src) ed.chain().focus().setImage({ src, alt: file.name }).run();
        }}
      />
      <ToolsRow tools={InsertTools({ ...p, fileRef, pickerOpen, setPickerOpen })} saved={p.saved} resetKey={p.resetKey} />
    </>
  );
}

function LayoutRow(p: DocumentBarProps & { resetKey: string }) {
  const [mode, setMode] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DiffViewMode>).detail;
      if (d === "inline" || d === "card") setMode(d);
    };
    window.addEventListener("drafthr:diff-view-mode", on);
    return () => window.removeEventListener("drafthr:diff-view-mode", on);
  }, []);
  const tools: Tool[] = [
    {
      key: "view",
      inline: (
        <div className="inline-flex shrink-0 rounded-[8px] bg-[var(--ds-surface-2)] p-0.5" role="tablist" aria-label="View mode">
          {(
            [
              ["edit", "Sections", <FileEdit key="e" className="size-3.5" />],
              ["preview", "Page", <Eye key="p" className="size-3.5" />],
            ] as const
          ).map(([m, label, icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={p.viewMode === m}
              onClick={() => p.onViewMode(m)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                p.viewMode === m
                  ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                  : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      ),
    },
    {
      key: "settings",
      sep: true,
      drop: 5,
      inline: (
        <RBtn label="Document settings" onClick={p.onEditDetails} text="Document settings">
          <Settings2 className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Settings2 />} label="Document settings" onClick={p.onEditDetails} />,
    },
    {
      key: "new-edits",
      sep: true,
      drop: 3,
      inline: (
        <>
          <span className="shrink-0 whitespace-nowrap px-1 text-[12.5px] text-[var(--ds-muted)]">New edits</span>
          <RBtn label="Show new edits in the text" active={mode === "inline"} onClick={() => setDiffViewMode("inline")} text="In the text">
            <AlignLeft className="size-4" />
          </RBtn>
          <RBtn label="Show new edits side by side" active={mode === "card"} onClick={() => setDiffViewMode("card")} text="Side by side">
            <Columns2 className="size-4" />
          </RBtn>
        </>
      ),
      menu: (
        <>
          <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">New edits</DropdownMenuLabel>
          <MItem icon={<AlignLeft />} label="In the text" active={mode === "inline"} onClick={() => setDiffViewMode("inline")} />
          <MItem icon={<Columns2 />} label="Side by side" active={mode === "card"} onClick={() => setDiffViewMode("card")} />
        </>
      ),
    },
    {
      key: "outline",
      sep: true,
      drop: 4,
      inline: (
        <RBtn label={p.outlineOpen ? "Hide outline" : "Show outline"} active={p.outlineOpen} onClick={p.onToggleOutline} text="Outline">
          <PanelLeft className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<PanelLeft />} label="Outline" active={p.outlineOpen} onClick={p.onToggleOutline} />,
    },
    {
      key: "focus",
      drop: 2,
      inline: (
        <RBtn label={p.focusMode ? "Exit focus mode" : "Enter focus mode"} active={p.focusMode} onClick={p.onToggleFocus} text="Focus">
          <Maximize2 className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Maximize2 />} label="Focus" active={p.focusMode} onClick={p.onToggleFocus} />,
    },
  ];
  return <ToolsRow tools={tools} saved={p.saved} resetKey={p.resetKey} />;
}

/** Sending on (for review or for approval) is blocked by the Draft gate:
 *  a required check failing, a required section empty, DraftHR writing. */

function reviewTools(p: DocumentBarProps): Tool[] {
  const { role, draft, journey } = p;
  const reviewStatus = draft.reviewStatus ?? "draft";
  const blocked = submitBlocked(journey);
  const tools: Tool[] = [
    {
      key: "edits",
      inline: (
        <RBtn label="Open edits to review" onClick={p.onOpenEdits} text={`Edits${p.pendingEdits ? ` (${p.pendingEdits})` : ""}`}>
          <MessageSquareWarning className="size-4" />
        </RBtn>
      ),
    },
  ];
  if (p.pendingEdits > 0 && p.canEdit) {
    tools.push(
      {
        key: "reject-all",
        drop: 3,
        inline: (
          <RBtn label="Reject every pending edit" onClick={p.onRejectAll} text="Reject all">
            <X className="size-4" />
          </RBtn>
        ),
        menu: <MItem icon={<X />} label="Reject all" onClick={p.onRejectAll} />,
      },
      {
        key: "accept-all",
        drop: 2,
        inline: (
          <RBtn label="Accept every pending edit" onClick={p.onAcceptAll} text="Accept all">
            <CheckCheck className="size-4" />
          </RBtn>
        ),
        menu: <MItem icon={<CheckCheck />} label="Accept all" onClick={p.onAcceptAll} />,
      }
    );
  }
  tools.push(
    {
      key: "comments",
      sep: true,
      drop: 5,
      inline: (
        <RBtn label="All comments" onClick={p.onOpenComments} text={`Comments${p.commentCount ? ` (${p.commentCount})` : ""}`}>
          <MessageSquare className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<MessageSquare />} label={`Comments${p.commentCount ? ` (${p.commentCount})` : ""}`} onClick={p.onOpenComments} />,
    },
    {
      key: "timeline",
      drop: 6,
      inline: (
        <RBtn label="Timeline" onClick={p.onOpenTimeline} text="Timeline">
          <Clock3 className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Clock3 />} label="Timeline" onClick={p.onOpenTimeline} />,
    },
    p.streaming
      ? {
          key: "stop",
          sep: true,
          inline: (
            <RBtn label="Stop generation" onClick={p.onStop} text="Stop">
              <StopCircle className="size-4" />
            </RBtn>
          ),
        }
      : {
          key: "redraft",
          sep: true,
          drop: 7,
          inline: (
            <RBtn label="Redraft every section" disabled={!p.canEdit} onClick={p.onRegenerateAll} text="Redraft all">
              <Sparkles className="size-4" />
            </RBtn>
          ),
          menu: <MItem icon={<Sparkles />} label="Redraft all" disabled={!p.canEdit} onClick={p.onRegenerateAll} />,
        },
    {
      key: "refine",
      drop: 8,
      inline: (
        <RBtn label="Refine current section" disabled={!p.activeSection || !p.canEdit} onClick={p.onRefineSection} text="Refine section">
          <Wand2 className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<Wand2 />} label="Refine section" disabled={!p.activeSection || !p.canEdit} onClick={p.onRefineSection} />,
    }
  );
  if (p.counselNeeded) {
    const label = p.counselReview ? "Counsel reviewed" : "Counsel review";
    tools.push({
      key: "counsel",
      drop: 9,
      inline: (
        <RBtn label="Counsel review" onClick={p.onOpenCounsel} text={label}>
          <ShieldCheck className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<ShieldCheck />} label={label} onClick={p.onOpenCounsel} />,
    });
  }
  if (!draft.isTemplateSource) {
    const a = journey.primaryAction;
    if (a && a.id !== "export" && a.id !== "download") {
      const disabled = Boolean(a.disabled) || !canSubmitForReview(role) || (p.streaming && a.id.startsWith("send"));
      tools.push({
        key: "primary",
        sep: true,
        drop: 1,
        inline: (
          <RBtn label={a.label} hint={a.reason} disabled={disabled} onClick={() => p.onJourneyAction(a.id)} text={a.label}>
            <Send className="size-4" />
          </RBtn>
        ),
        menu: <MItem icon={<Send />} label={a.label} hint={a.reason} disabled={disabled} onClick={() => p.onJourneyAction(a.id)} />,
      });
    }
    if ((reviewStatus === "draft" || reviewStatus === "changes_requested") && canSubmitForReview(role) && a?.id !== "send-for-approval") {
      const label = reviewStatus === "draft" ? "Submit for approval" : "Re-submit";
      const disabled = journey.locked || p.streaming || Boolean(blocked);
      tools.push({
        key: "submit",
        drop: 4,
        inline: (
          <RBtn label="Submit for approval" hint={blocked ?? undefined} disabled={disabled} onClick={() => p.onReviewAction("submit")} text={label}>
            <Stamp className="size-4" />
          </RBtn>
        ),
        menu: <MItem icon={<Stamp />} label={label} hint={blocked ?? undefined} disabled={disabled} onClick={() => p.onReviewAction("submit")} />,
      });
    }
    if (reviewStatus === "in_review" && canApprove(role) && p.viewerIsApprover) {
      tools.push(
        {
          key: "approve",
          drop: 1,
          inline: (
            <RBtn label="Approve" onClick={() => p.onReviewAction("approve")} text="Approve">
              <Check className="size-4" />
            </RBtn>
          ),
          menu: <MItem icon={<Check />} label="Approve" onClick={() => p.onReviewAction("approve")} />,
        },
        {
          key: "request",
          drop: 4,
          inline: (
            <RBtn label="Request changes" onClick={() => p.onReviewAction("request_changes")} text="Request changes">
              <MessageSquareWarning className="size-4" />
            </RBtn>
          ),
          menu: <MItem icon={<MessageSquareWarning />} label="Request changes" onClick={() => p.onReviewAction("request_changes")} />,
        }
      );
    }
    tools.push({
      key: "review-step",
      drop: 10,
      inline: (
        <RBtn label="Open the Review step" onClick={p.onGoReview} text="Review step">
          <ArrowRight className="size-4" />
        </RBtn>
      ),
      menu: <MItem icon={<ArrowRight />} label="Review step" onClick={p.onGoReview} />,
    });
  }
  return tools;
}

/* ------------------------------ Atoms ----------------------------------- */

function promptLink(ed: Editor | null) {
  if (!ed) return;
  const prev = ed.getAttributes("link").href as string | undefined;
  const url = prompt("Link address", prev ?? "https://");
  if (url == null) return;
  if (url === "") ed.chain().focus().unsetLink().run();
  else ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function LinkBtn({ ed, disabled, text }: { ed: Editor | null; disabled?: boolean; text?: string }) {
  return (
    <RBtn
      label="Link"
      text={text}
      active={Boolean(ed?.isFocused) && ed?.isActive("link")}
      disabled={disabled}
      onClick={() => promptLink(ed)}
    >
      <LinkIcon className="size-4" />
    </RBtn>
  );
}

/** Ribbon button. mousedown is cancelled so the section editor keeps its
 * selection while a format is applied. Disabled tools turn faint. */
function RBtn({
  label,
  onClick,
  active,
  disabled,
  text,
  hint,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  text?: string;
  /** Why it is disabled (shown as the tooltip). */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled && hint ? `${label}. ${hint}` : label}
      aria-pressed={active === undefined ? undefined : Boolean(active) && !disabled}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] text-[13.5px] transition-colors duration-[120ms] disabled:cursor-default disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
        text ? "px-2" : "w-8",
        active && !disabled
          ? "bg-[var(--ds-surface-3)] text-[var(--ds-ink)]"
          : "text-[var(--ds-body)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]"
      )}
    >
      {children}
      {text && <span>{text}</span>}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-[5px] h-[18px] w-px shrink-0 bg-[var(--ds-line)]" />;
}

