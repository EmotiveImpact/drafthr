import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  BookmarkPlus,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Columns2,
  Download,
  Eye,
  FileEdit,
  History,
  ImageIcon,
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
  ShieldCheck,
  Smartphone,
  Sparkles,
  StopCircle,
  TextSelect,
  Undo,
  Undo2,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import type { Draft, Section } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import { canApprove, canSubmitForReview } from "@/lib/permissions";
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { SAFE_IMAGE_ACCEPT } from "@/lib/safe-data-url";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PagedEditorActions } from "./paged-edit/types";
import type { ReviewDialogKind } from "./ReviewDialog";
import { EditableTitleBar } from "./EditableTitleBar";
import { DocumentPopover } from "./DocumentPopover";
import { InvitePopover } from "./InvitePopover";
import { EvidencePickerPopover } from "./EvidencePickerPopover";
import { fileToDataUrl } from "./EditorToolbar";
import { EXPORT_FORMATS, type LetterExportFormat } from "./useLetterExport";

type RibbonTab = "home" | "insert" | "layout" | "review";
const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Layout" },
  { id: "review", label: "Review" },
];

export type DocumentBarProps = {
  draft: Draft;
  /** Tiptap editor of the section being edited (null until one is focused). */
  editor: Editor | null;
  viewMode: "edit" | "preview";
  onViewMode: (m: "edit" | "preview") => void;
  pagedActions: RefObject<PagedEditorActions | null>;
  backTo: string;
  streaming: boolean;
  canEdit: boolean;
  role: WorkspaceRole | undefined;
  counselNeeded: boolean;
  counselReview: { reviewedBy: string; reviewedOn: string } | null;
  pendingEdits: number;
  commentCount: number;
  activeSection: Section | null;
  // Panels
  panelOpen: boolean;
  onTogglePanel: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  // Evidence
  evidenceActive: boolean;
  evidencePinned: boolean;
  onEvidenceButton: () => void;
  onOpenEvidence: () => void;
  // Share
  inviteOpen: boolean;
  onInviteOpenChange: (open: boolean) => void;
  onOpenOnMobile: () => void;
  // Export
  onExport: (format: LetterExportFormat) => void;
  exportBusy: LetterExportFormat | null;
  onFinalise: () => void;
  onGoReview: () => void;
  onSaveTemplate: () => void;
  onSaveAsTemplate: () => void;
  // Review and edits
  onOpenEdits: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onOpenComments: () => void;
  onComment: () => void;
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
 * 11A document bar for the letter workspace: the file name with its status
 * pills, Versions / Share / Export and an overflow menu on the first row;
 * Home / Insert / Layout / Review ribbon tabs on the second; and the chosen
 * tab's controls on the third. Every control calls a handler the editor
 * already had (the old File, Tools, Edit and View menus, the format toolbar,
 * the pending pill and the topbar buttons all moved here).
 */
export function DocumentBar(p: DocumentBarProps) {
  const { draft, editor } = p;
  const [tab, setTab] = useState<RibbonTab>("home");
  const reviewStatus = draft.reviewStatus ?? "draft";

  // Re-render on every editor transaction so active states stay current.
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.on("transaction", force);
    editor.on("selectionUpdate", force);
    return () => {
      editor.off("transaction", force);
      editor.off("selectionUpdate", force);
    };
  }, [editor]);
  const ed = editor && !editor.isDestroyed ? editor : null;
  const canFormat = Boolean(ed) && p.viewMode === "edit" && p.canEdit && !p.streaming;

  const evidenceCount = draft.evidence?.length ?? 0;
  const sectionsWithHistory = draft.sections.filter((s) => s.versions.length > 0);

  return (
    <div className="shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)]">
      {/* Row 1: file name, status, Versions / Share / Export, overflow */}
      <div className="@container/docbar flex h-12 min-w-0 items-center gap-1 px-2 sm:gap-1.5 sm:px-3">
        <Link
          to={p.backTo}
          aria-label="Back to letters"
          title="Back to letters"
          className="grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <IconBtn
          label={p.outlineOpen ? "Hide outline" : "Show outline"}
          onClick={p.onToggleOutline}
          active={p.outlineOpen}
          className="hidden sm:grid"
        >
          <PanelLeft className="size-4" />
        </IconBtn>
        <div className="ml-0.5 min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <EditableTitleBar draft={draft} variant="bar" />
            <StatusPills {...p} reviewStatus={reviewStatus} />
            {p.streaming && (
              <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-[var(--ds-muted)] md:flex">
                <Loader2 className="size-3 animate-spin" /> Drafting…
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Evidence: toggles the floating drawer, or focuses the pinned one. */}
          <button
            type="button"
            onClick={p.onEvidenceButton}
            aria-pressed={p.evidenceActive}
            aria-label={
              p.evidencePinned
                ? "Focus pinned evidence rail"
                : p.evidenceActive
                  ? "Close evidence drawer"
                  : "Open evidence drawer"
            }
            title={p.evidencePinned ? "Evidence is open in the side panel" : "Evidence for this letter"}
            className={cn(
              "hidden h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2 text-[13px] font-medium transition sm:inline-flex",
              p.evidenceActive
                ? "bg-[var(--ds-chip)] text-[var(--ds-ink)]"
                : "text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]",
            )}
          >
            <Paperclip className="size-3.5" />
            <span className="hidden @3xl/docbar:inline">Evidence</span>
            {evidenceCount > 0 && <span className="ds-mono text-[11.5px] text-[var(--ds-muted)]">{evidenceCount}</span>}
          </button>

          {/* Versions: the timeline plus each section's saved versions. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2 text-[13px] font-medium text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                aria-label="Versions"
                title="Versions and timeline"
              >
                <History className="size-4" />
                <span className="hidden @2xl/docbar:inline">Versions</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuItem onClick={p.onOpenTimeline}>
                <Clock3 className="mr-2 size-4" /> Timeline
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">
                Section history
              </DropdownMenuLabel>
              {sectionsWithHistory.length === 0 ? (
                <DropdownMenuItem disabled>No saved versions yet</DropdownMenuItem>
              ) : (
                sectionsWithHistory.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => p.onShowSectionHistory(s)}>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="ds-mono text-[11px] text-[var(--ds-muted)]">{s.versions.length}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <InvitePopover
            draft={draft}
            open={p.inviteOpen}
            onOpenChange={p.onInviteOpenChange}
            onOpenOnPhone={p.onOpenOnMobile}
            trigger={
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[13px] font-medium text-[var(--ds-ink)] transition hover:bg-[var(--ds-surface-2)] sm:px-2.5"
                aria-label="Invite"
                title="Share and invite people"
              >
                <UserPlus className="size-3.5" />
                <span className="hidden @xl/docbar:inline">Share</span>
              </button>
            }
          />

          {draft.isTemplateSource ? (
            <button
              type="button"
              disabled={p.streaming}
              onClick={p.onSaveTemplate}
              aria-label="Save template"
              title="Save template"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[13px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)] disabled:opacity-50"
            >
              <BookmarkPlus className="size-3.5" />
              <span className="hidden sm:inline">Save template</span>
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[13px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
                  aria-label="Export"
                  title="Export the letter"
                >
                  {p.exportBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  <span className="hidden sm:inline">Export</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px]">
                <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">
                  Download as
                </DropdownMenuLabel>
                {EXPORT_FORMATS.map((f) => (
                  <DropdownMenuItem
                    key={f.format}
                    disabled={Boolean(p.exportBusy) || p.streaming}
                    onClick={() => p.onExport(f.format)}
                  >
                    <span className="flex-1">{f.label}</span>
                    <span className="ds-mono text-[11px] text-[var(--ds-muted)]">{f.ext}</span>
                  </DropdownMenuItem>
                ))}
                {p.counselNeeded && !p.counselReview && (
                  <p className="m-0 px-2 pb-1.5 pt-1 text-[11.5px] leading-snug text-[var(--ds-muted)]">
                    High-risk letter. You will be asked who reviewed it first.
                  </p>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={p.onGoReview}>
                  <CheckCircle2 className="mr-2 size-4" /> Review step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={p.onFinalise}>
                  <Send className="mr-2 size-4" /> Finalise and send…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <MoreMenu {...p} reviewStatus={reviewStatus} />

          <IconBtn
            label={p.panelOpen ? "Hide side panel" : "Show side panel"}
            onClick={p.onTogglePanel}
            active={p.panelOpen}
            className="hidden lg:grid"
          >
            <PanelRight className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* Row 2: ribbon tabs */}
      <div className="flex items-center gap-0.5 px-2 sm:px-3" role="tablist" aria-label="Document tools">
        {RIBBON_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-7 rounded-[var(--ds-r-s)] px-2.5 text-[13px] transition-colors",
              tab === t.id
                ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]"
                : "text-[var(--ds-body)] hover:text-[var(--ds-ink)]",
            )}
          >
            {t.label}
            {t.id === "review" && p.pendingEdits > 0 && (
              <span className="ds-mono ml-1.5 text-[11px] text-[var(--ds-muted)]">{p.pendingEdits}</span>
            )}
          </button>
        ))}
      </div>

      {/* Row 3: the chosen tab's controls. Scrolls sideways on small screens. */}
      <div className="flex h-11 min-w-0 items-center gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] sm:px-3">
        {tab === "home" && <HomeRow {...p} ed={ed} canFormat={canFormat} />}
        {tab === "insert" && <InsertRow {...p} ed={ed} canFormat={canFormat} />}
        {tab === "layout" && <LayoutRow {...p} />}
        {tab === "review" && <ReviewRow {...p} reviewStatus={reviewStatus} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function StatusPills(p: DocumentBarProps & { reviewStatus: string }) {
  const { reviewStatus } = p;
  return (
    <>
      {reviewStatus !== "draft" && (
        <button
          type="button"
          onClick={() => {
            if (reviewStatus === "changes_requested") p.onOpenFeedback();
          }}
          disabled={reviewStatus !== "changes_requested"}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
            reviewStatus === "approved"
              ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
              : reviewStatus === "in_review"
                ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                : "cursor-pointer bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
          )}
          title={
            reviewStatus === "approved"
              ? "Draft approved. Ready to send."
              : reviewStatus === "in_review"
                ? "Awaiting reviewer sign-off"
                : "Reviewer requested changes. Click to read feedback."
          }
        >
          {reviewStatus === "approved" ? (
            <CheckCircle2 className="size-3" />
          ) : reviewStatus === "in_review" ? (
            <Send className="size-3" />
          ) : (
            <MessageSquareWarning className="size-3" />
          )}
          <span className="hidden @2xl/docbar:inline">
            {reviewStatus === "approved" ? "Approved" : reviewStatus === "in_review" ? "In review" : "Changes requested"}
          </span>
        </button>
      )}
      {p.counselNeeded && (
        <button
          type="button"
          onClick={p.onOpenCounsel}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
            p.counselReview
              ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
              : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
          )}
          title={
            p.counselReview
              ? `Counsel-reviewed by ${p.counselReview.reviewedBy} on ${p.counselReview.reviewedOn}. Click to update.`
              : "Counsel review required before export. Click to mark reviewed."
          }
        >
          <ShieldCheck className="size-3" />
          <span className="hidden @2xl/docbar:inline">{p.counselReview ? "Reviewed" : "Needs review"}</span>
        </button>
      )}
    </>
  );
}

/** Overflow: everything from the old File, Tools and View menus that has no
 * place on the ribbon, plus the phone-only shortcuts. */
function MoreMenu(p: DocumentBarProps & { reviewStatus: string }) {
  const { draft, reviewStatus, role } = p;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
          aria-label="More"
          title="More"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuItem onClick={p.onEditDetails}>
          <Settings2 className="mr-2 size-4" /> Edit details
        </DropdownMenuItem>
        <DropdownMenuItem className="sm:hidden" onClick={p.onOpenEvidence}>
          <Paperclip className="mr-2 size-4" /> Evidence
          {(draft.evidence?.length ?? 0) > 0 && (
            <span className="ds-mono ml-auto text-[11px] text-[var(--ds-muted)]">{draft.evidence?.length}</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={p.onOpenComments}>
          <MessageSquare className="mr-2 size-4" /> Comments
          {p.commentCount > 0 && (
            <span className="ds-mono ml-auto text-[11px] text-[var(--ds-muted)]">{p.commentCount}</span>
          )}
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
          <DropdownMenuItem onClick={p.onRegenerateAll}>
            <Sparkles className="mr-2 size-4" /> Regenerate all sections
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!p.activeSection} onClick={p.onRefineSection}>
          <Wand2 className="mr-2 size-4" /> Refine current section…
        </DropdownMenuItem>
        {!draft.isTemplateSource && (
          <>
            <DropdownMenuSeparator />
            {reviewStatus === "draft" && canSubmitForReview(role) && (
              <DropdownMenuItem onClick={() => p.onReviewAction("submit")}>
                <Send className="mr-2 size-4" /> Submit for approval…
              </DropdownMenuItem>
            )}
            {reviewStatus === "changes_requested" && canSubmitForReview(role) && (
              <DropdownMenuItem onClick={() => p.onReviewAction("submit")}>
                <Send className="mr-2 size-4" /> Re-submit for approval…
              </DropdownMenuItem>
            )}
            {reviewStatus === "in_review" && (
              <>
                <DropdownMenuItem onClick={p.onWithdraw}>
                  <Undo className="mr-2 size-4" /> Withdraw from review
                </DropdownMenuItem>
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
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={p.onOpenOnMobile} data-testid="open-on-mobile-menu-item">
          <Smartphone className="mr-2 size-4" /> Open on mobile…
        </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => p.onNavigate("/settings")}>
          <Settings2 className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => p.onNavigate("/privacy")}>
          <ShieldCheck className="mr-2 size-4" /> Privacy &amp; data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------- Ribbon rows ------------------------------- */

type FormatProps = DocumentBarProps & { ed: Editor | null; canFormat: boolean };

function HomeRow(p: FormatProps) {
  const { ed, canFormat } = p;
  const page = p.viewMode === "preview";
  const style = !ed
    ? "Paragraph"
    : ed.isActive("heading", { level: 2 })
      ? "Heading 2"
      : ed.isActive("heading", { level: 3 })
        ? "Heading 3"
        : "Paragraph";
  return (
    <>
      <RBtn
        label="Undo"
        disabled={page ? !p.canEdit : !canFormat || !ed?.can().undo()}
        onClick={() => (page ? p.pagedActions.current?.undo() : ed?.chain().focus().undo().run())}
      >
        <Undo2 className="size-4" />
      </RBtn>
      <RBtn
        label="Redo"
        disabled={page ? !p.canEdit : !canFormat || !ed?.can().redo()}
        onClick={() => (page ? p.pagedActions.current?.redo() : ed?.chain().focus().redo().run())}
      >
        <Redo2 className="size-4" />
      </RBtn>
      <Sep />
      {page ? (
        <>
          <RBtn label="Select all" onClick={() => p.pagedActions.current?.selectAll()} text="Select all">
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
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--ds-r-s)] px-2 text-[13px] text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)] disabled:opacity-40"
                aria-label={`Text style: ${style}`}
              >
                {style}
                <ChevronDown className="size-3 text-[var(--ds-muted)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onClick={() => ed?.chain().focus().setParagraph().run()}>Paragraph</DropdownMenuItem>
              <DropdownMenuItem onClick={() => ed?.chain().focus().toggleHeading({ level: 2 }).run()}>
                Heading 2
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => ed?.chain().focus().toggleHeading({ level: 3 }).run()}>
                Heading 3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Sep />
          <RBtn label="Bold" active={ed?.isActive("bold")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </RBtn>
          <RBtn label="Italic" active={ed?.isActive("italic")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </RBtn>
          <Sep />
          <RBtn label="Bullets" active={ed?.isActive("bulletList")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleBulletList().run()}>
            <List className="size-4" />
          </RBtn>
          <RBtn label="Numbered list" active={ed?.isActive("orderedList")} disabled={!canFormat} onClick={() => ed?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="size-4" />
          </RBtn>
          <Sep />
          <RBtn label="Align left" active={ed?.isActive({ textAlign: "left" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="size-4" />
          </RBtn>
          <RBtn label="Align centre" active={ed?.isActive({ textAlign: "center" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="size-4" />
          </RBtn>
          <RBtn label="Align right" active={ed?.isActive({ textAlign: "right" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="size-4" />
          </RBtn>
          <RBtn label="Justify" active={ed?.isActive({ textAlign: "justify" })} disabled={!canFormat} onClick={() => ed?.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="size-4" />
          </RBtn>
          <Sep />
          <LinkBtn ed={ed} disabled={!canFormat} />
          {!ed && p.canEdit && (
            <span className="ml-1 whitespace-nowrap text-[12.5px] text-[var(--ds-muted)]">Click into a section to format it</span>
          )}
        </>
      )}
    </>
  );
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
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2 text-[13px] text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
              aria-label={`Insert evidence at cursor (${evidenceCount} ${evidenceCount === 1 ? "item" : "items"})`}
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
      <div className="inline-flex shrink-0 rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] p-0.5" role="tablist" aria-label="View mode">
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
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-medium transition-colors",
              p.viewMode === m
                ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <Sep />
      <DocumentPopover draft={p.draft} variant="ribbon" />
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
    </>
  );
}

function ReviewRow(p: DocumentBarProps & { reviewStatus: string }) {
  const { reviewStatus, role, draft } = p;
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
          {(reviewStatus === "draft" || reviewStatus === "changes_requested") && canSubmitForReview(role) && (
            <RBtn label="Submit for approval" onClick={() => p.onReviewAction("submit")} text={reviewStatus === "draft" ? "Submit for approval" : "Re-submit"}>
              <Send className="size-4" />
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
    </>
  );
}

/* ------------------------------ Atoms ----------------------------------- */

function LinkBtn({ ed, disabled, text }: { ed: Editor | null; disabled?: boolean; text?: string }) {
  return (
    <RBtn
      label="Link"
      text={text}
      active={ed?.isActive("link")}
      disabled={disabled}
      onClick={() => {
        if (!ed) return;
        const prev = ed.getAttributes("link").href as string | undefined;
        const url = prompt("URL", prev ?? "https://");
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
 * selection while a format is applied. */
function RBtn({
  label,
  onClick,
  active,
  disabled,
  text,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  text?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--ds-r-s)] text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-35",
        text ? "px-2" : "w-8",
        active
          ? "bg-[var(--ds-chip)] text-[var(--ds-ink)]"
          : "text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]",
      )}
    >
      {children}
      {text && <span>{text}</span>}
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  active,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] transition",
        active
          ? "text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
          : "text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]",
        className ?? "grid",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--ds-line)]" />;
}
