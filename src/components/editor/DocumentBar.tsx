import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
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
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { SAFE_IMAGE_ACCEPT } from "@/lib/safe-data-url";
import { cn } from "@/lib/utils";
import type { JourneyActionId, JourneyInfo } from "@/lib/journey/stage";
import { Avatar } from "@/components/ds";
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

export type BarPerson = { name: string; seed: string; title?: string; approved?: boolean };

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
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.on("transaction", force);
    editor.on("selectionUpdate", force);
    editor.on("focus", force);
    editor.on("blur", force);
    return () => {
      editor.off("transaction", force);
      editor.off("selectionUpdate", force);
      editor.off("focus", force);
      editor.off("blur", force);
    };
  }, [editor]);
  const ed = editor && !editor.isDestroyed ? editor : null;
  const canFormat = Boolean(ed) && p.viewMode === "edit" && p.canEdit && !p.streaming;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="shrink-0 bg-[var(--ds-surface)]">
        <TopRow {...p} />
        {/* Ribbon: tabs and the chosen tab's tools. */}
        <div className="border-b border-[var(--ds-line-2)] px-4">
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
          <div className="flex h-[46px] min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
            {tab === "home" && <HomeRow {...p} ed={ed} canFormat={canFormat} />}
            {tab === "insert" && <InsertRow {...p} ed={ed} canFormat={canFormat} />}
            {tab === "layout" && <LayoutRow {...p} />}
            {tab === "review" && <ReviewRow {...p} />}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------ Top row ---------------------------------- */

function TopRow(p: DocumentBarProps) {
  const { draft, journey } = p;
  const evidenceCount = draft.evidence?.length ?? 0;
  const reviewStatus = draft.reviewStatus ?? "draft";
  return (
    <div className="flex h-[60px] min-w-0 items-center gap-1 border-b xl:gap-1.5 border-[var(--ds-line-2)] pl-3 pr-3.5">
      <Link
        to={p.backTo}
        aria-label="Back to letters"
        title="Back to letters"
        className="grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <ArrowLeft className="size-[18px]" />
      </Link>
      <div className="ml-0.5 mr-1.5 flex min-w-0 shrink items-center lg:min-w-[76px]">
        <EditableTitleBar draft={draft} variant="bar" />
      </div>
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
        {p.counselNeeded && (
          <button
            type="button"
            onClick={p.onOpenCounsel}
            className={cn(
              "inline-flex h-[22px] items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
              p.counselReview
                ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
            )}
            title={
              p.counselReview
                ? `Counsel-reviewed by ${p.counselReview.reviewedBy} on ${p.counselReview.reviewedOn}. Click to update.`
                : "Counsel review is needed before export. Click to mark it reviewed."
            }
          >
            <ShieldCheck className="size-3" />
            <span className="hidden 2xl:inline">{p.counselReview ? "Reviewed" : "Needs review"}</span>
            <span className="sr-only 2xl:hidden">{p.counselReview ? "Reviewed" : "Needs review"}</span>
          </button>
        )}
        {p.streaming && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
            <Loader2 className="size-3 animate-spin" /> Drafting…
          </span>
        )}
      </span>

      <span className="min-w-2 flex-1" />

      <InvitePopover
        draft={draft}
        open={p.inviteOpen}
        onOpenChange={p.onInviteOpenChange}
        onOpenOnPhone={p.onOpenOnMobile}
        trigger={
          <button
            type="button"
            className="ml-0.5 mr-1 hidden shrink-0 xl:ml-2 xl:mr-1.5 items-center rounded-full pl-1.5 transition-opacity duration-[120ms] hover:opacity-85 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] lg:inline-flex"
            aria-label="Invite"
            title="Share and invite people"
          >
            {p.people.map((person, i) => (
              <span key={person.seed + i} className={cn("relative", i > 0 && "-ml-1.5")}>
                <Avatar size="lg" name={person.name} seed={person.seed} title={person.title ?? person.name} className="ring-2 ring-[var(--ds-surface)]" />
                {person.approved && (
                  <span
                    aria-label={`${person.name} approved`}
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
        <span className="hidden xl:inline">Evidence</span>
        {evidenceCount > 0 && (
          <span className="ds-mono rounded-[5px] bg-[var(--ds-surface-3)] px-1.5 text-[12px] font-medium text-[var(--ds-muted)]">
            {evidenceCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={p.onOpenActivity}
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-[7px] text-[14px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        aria-label="Activity"
        title="Activity: the letter's history and saved versions"
      >
        <History className="size-4" />
        <span className="hidden xl:inline">Activity</span>
      </button>

      <MainAction {...p} />

      <MoreMenu {...p} />
    </div>
  );
}

/** The one main action on the far right of the bar, by stage. */
export function MainAction(p: DocumentBarProps & { size?: "bar" | "phone" }) {
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
      {icon && <span className={phone ? "contents" : "contents max-xl:hidden"}>{icon}</span>}
      {action.label}
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
export function MoreMenu(p: DocumentBarProps & { phone?: boolean; trigger?: ReactNode }) {
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
                disabled={journey.locked || p.streaming}
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
                {canApprove(role) && (
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
              <BookmarkPlus className="mr-2 size-4" /> Save as template…
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
            <DropdownMenuItem onClick={p.onFinalise}>
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

function HomeRow(p: FormatProps) {
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
  const hint = locked ? undefined : "Click into a section to format it";
  return (
    <>
      <RBtn label={p.outlineOpen ? "Hide sections outline" : "Sections outline"} active={p.outlineOpen} onClick={p.onToggleOutline}>
        <PanelLeft className="size-[17px]" />
      </RBtn>
      <Sep />
      <RBtn
        label="Undo"
        hint={!canFormat && !page ? hint : undefined}
        disabled={page ? locked : !canFormat || !ed?.can().undo()}
        onClick={() => (page ? p.pagedActions.current?.undo() : ed?.chain().focus().undo().run())}
      >
        <Undo2 className="size-[17px]" />
      </RBtn>
      <RBtn
        label="Redo"
        hint={!canFormat && !page ? hint : undefined}
        disabled={page ? locked : !canFormat || !ed?.can().redo()}
        onClick={() => (page ? p.pagedActions.current?.redo() : ed?.chain().focus().redo().run())}
      >
        <Redo2 className="size-[17px]" />
      </RBtn>
      <Sep />
      <ZoomMenu zoom={p.zoom} onZoom={p.onZoom} disabled={locked || page} />
      <Sep />
      {page ? (
        <>
          <RBtn label="Select all" disabled={locked} onClick={() => p.pagedActions.current?.selectAll()} text="Select all">
            <TextSelect className="size-4" />
          </RBtn>
          <RBtn label="Find in letter" onClick={() => p.pagedActions.current?.openFind()} text="Find">
            <Search className="size-4" />
          </RBtn>
          <Sep />
          <span className="whitespace-nowrap px-1.5 text-[12.5px] text-[var(--ds-muted)]">
            Page view. Switch to Sections in Layout to format a section.
          </span>
        </>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!canFormat}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[13.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                aria-label={`Text style: ${style}`}
                title={!canFormat ? hint ?? "The letter is locked" : "Text style"}
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
          <DocumentPopover draft={p.draft} variant="tools" disabled={locked} />
          <Sep />
          <RBtn label="Bold" hint={hint} active={focused && ed?.isActive("bold")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </RBtn>
          <RBtn label="Italic" hint={hint} active={focused && ed?.isActive("italic")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </RBtn>
          <Sep />
          <RBtn label="Bullets" hint={hint} active={focused && ed?.isActive("bulletList")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBulletList().run()}>
            <List className="size-[17px]" />
          </RBtn>
          <RBtn label="Numbered list" hint={hint} active={focused && ed?.isActive("orderedList")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="size-[17px]" />
          </RBtn>
          <Sep />
          <RBtn label="Align left" hint={hint} active={focused && ed?.isActive({ textAlign: "left" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="size-[17px]" />
          </RBtn>
          <RBtn label="Align centre" hint={hint} active={focused && ed?.isActive({ textAlign: "center" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="size-[17px]" />
          </RBtn>
          <RBtn label="Align right" hint={hint} active={focused && ed?.isActive({ textAlign: "right" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="size-[17px]" />
          </RBtn>
          <RBtn label="Justify" hint={hint} active={focused && ed?.isActive({ textAlign: "justify" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="size-[17px]" />
          </RBtn>
          <Sep />
          <RBtn label="Find in letter" disabled={locked} onClick={p.onOpenFind}>
            <Search className="size-4" />
          </RBtn>
        </>
      )}
      <SavedIndicator saved={p.saved} />
    </>
  );
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

export function SavedIndicator({ saved, className }: { saved: SavedState; className?: string }) {
  // Re-render every 30s so "2 min ago" stays true.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      aria-live="polite"
      className={cn("ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pl-3 text-[12.5px] text-[var(--ds-subtle)]", className)}
    >
      {saved.kind === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving
        </>
      ) : saved.kind === "locked" ? (
        <>
          <Check className="size-3.5" /> Locked after sending
        </>
      ) : (
        <>
          <Check className="size-3.5" /> Saved {agoText(saved.at)}
        </>
      )}
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

function InsertRow(p: FormatProps) {
  const { ed, canFormat, draft } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const evidenceCount = draft.evidence?.length ?? 0;
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
      {ed && canFormat && evidenceCount > 0 ? (
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
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[13.5px] text-[var(--ds-body)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
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
      )}
      <RBtn label="Insert image (or paste or drop one)" disabled={!canFormat} onClick={() => fileRef.current?.click()} text="Image">
        <ImageIcon className="size-4" />
      </RBtn>
      <LinkBtn ed={ed} disabled={!canFormat} text="Link" />
      <RBtn label="Comment on the selected text" disabled={!p.activeSection} onClick={p.onComment} text="Comment">
        <MessageSquarePlus className="size-4" />
      </RBtn>
      <Sep />
      <RBtn label="Open evidence" onClick={p.onOpenEvidence} text={evidenceCount > 0 ? `Evidence (${evidenceCount})` : "Add evidence"}>
        <Paperclip className="size-4" />
      </RBtn>
      <SavedIndicator saved={p.saved} />
    </>
  );
}

function LayoutRow(p: DocumentBarProps) {
  const [mode, setMode] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DiffViewMode>).detail;
      if (d === "inline" || d === "card") setMode(d);
    };
    window.addEventListener("drafthr:diff-view-mode", on);
    return () => window.removeEventListener("drafthr:diff-view-mode", on);
  }, []);
  return (
    <>
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
              "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
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
      <Sep />
      <RBtn label="Document settings" onClick={p.onEditDetails} text="Document settings">
        <Settings2 className="size-4" />
      </RBtn>
      <Sep />
      <span className="shrink-0 whitespace-nowrap px-1 text-[12.5px] text-[var(--ds-muted)]">New edits</span>
      <RBtn label="Show new edits in the text" active={mode === "inline"} onClick={() => setDiffViewMode("inline")} text="In the text">
        <AlignLeft className="size-4" />
      </RBtn>
      <RBtn label="Show new edits side by side" active={mode === "card"} onClick={() => setDiffViewMode("card")} text="Side by side">
        <Columns2 className="size-4" />
      </RBtn>
      <Sep />
      <RBtn label={p.outlineOpen ? "Hide outline" : "Show outline"} active={p.outlineOpen} onClick={p.onToggleOutline} text="Outline">
        <PanelLeft className="size-4" />
      </RBtn>
      <RBtn label={p.focusMode ? "Exit focus mode" : "Enter focus mode"} active={p.focusMode} onClick={p.onToggleFocus} text="Focus">
        <Maximize2 className="size-4" />
      </RBtn>
      <SavedIndicator saved={p.saved} />
    </>
  );
}

function ReviewRow(p: DocumentBarProps) {
  const { role, draft, journey } = p;
  const reviewStatus = draft.reviewStatus ?? "draft";
  return (
    <>
      <RBtn label="Open edits to review" onClick={p.onOpenEdits} text={`Edits${p.pendingEdits ? ` (${p.pendingEdits})` : ""}`}>
        <MessageSquareWarning className="size-4" />
      </RBtn>
      {p.pendingEdits > 0 && p.canEdit && (
        <>
          <RBtn label="Reject every pending edit" onClick={p.onRejectAll} text="Reject all">
            <X className="size-4" />
          </RBtn>
          <RBtn label="Accept every pending edit" onClick={p.onAcceptAll} text="Accept all">
            <CheckCheck className="size-4" />
          </RBtn>
        </>
      )}
      <Sep />
      <RBtn label="All comments" onClick={p.onOpenComments} text={`Comments${p.commentCount ? ` (${p.commentCount})` : ""}`}>
        <MessageSquare className="size-4" />
      </RBtn>
      <RBtn label="Timeline" onClick={p.onOpenTimeline} text="Timeline">
        <Clock3 className="size-4" />
      </RBtn>
      <Sep />
      {p.streaming ? (
        <RBtn label="Stop generation" onClick={p.onStop} text="Stop">
          <StopCircle className="size-4" />
        </RBtn>
      ) : (
        <RBtn label="Redraft every section" disabled={!p.canEdit} onClick={p.onRegenerateAll} text="Redraft all">
          <Sparkles className="size-4" />
        </RBtn>
      )}
      <RBtn label="Refine current section" disabled={!p.activeSection || !p.canEdit} onClick={p.onRefineSection} text="Refine section">
        <Wand2 className="size-4" />
      </RBtn>
      {p.counselNeeded && (
        <RBtn label="Counsel review" onClick={p.onOpenCounsel} text={p.counselReview ? "Counsel reviewed" : "Counsel review"}>
          <ShieldCheck className="size-4" />
        </RBtn>
      )}
      {!draft.isTemplateSource && (
        <>
          <Sep />
          {journey.primaryAction && journey.primaryAction.id !== "export" && journey.primaryAction.id !== "download" && (
            <RBtn
              label={journey.primaryAction.label}
              disabled={Boolean(journey.primaryAction.disabled) || !canSubmitForReview(role)}
              onClick={() => p.onJourneyAction(journey.primaryAction!.id)}
              text={journey.primaryAction.label}
            >
              <Send className="size-4" />
            </RBtn>
          )}
          {(reviewStatus === "draft" || reviewStatus === "changes_requested") && canSubmitForReview(role) && (
            <RBtn label="Submit for approval" disabled={journey.locked} onClick={() => p.onReviewAction("submit")} text={reviewStatus === "draft" ? "Submit for approval" : "Re-submit"}>
              <Stamp className="size-4" />
            </RBtn>
          )}
          {reviewStatus === "in_review" && canApprove(role) && (
            <>
              <RBtn label="Approve" onClick={() => p.onReviewAction("approve")} text="Approve">
                <Check className="size-4" />
              </RBtn>
              <RBtn label="Request changes" onClick={() => p.onReviewAction("request_changes")} text="Request changes">
                <MessageSquareWarning className="size-4" />
              </RBtn>
            </>
          )}
          <RBtn label="Open the Review step" onClick={p.onGoReview} text="Review step">
            <ArrowRight className="size-4" />
          </RBtn>
        </>
      )}
      <SavedIndicator saved={p.saved} />
    </>
  );
}

/* ------------------------------ Atoms ----------------------------------- */

function LinkBtn({ ed, disabled, text }: { ed: Editor | null; disabled?: boolean; text?: string }) {
  return (
    <RBtn
      label="Link"
      text={text}
      active={Boolean(ed?.isFocused) && ed?.isActive("link")}
      disabled={disabled}
      onClick={() => {
        if (!ed) return;
        const prev = ed.getAttributes("link").href as string | undefined;
        const url = prompt("Link address", prev ?? "https://");
        if (url == null) return;
        if (url === "") ed.chain().focus().unsetLink().run();
        else ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }}
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

