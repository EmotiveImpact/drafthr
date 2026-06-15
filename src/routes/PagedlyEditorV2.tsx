import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Eye,
  FileDown,
  FileText,
  Pencil,
  PenLine,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  LetterEditor,
  FEATURES_FULL,
  downloadDocx,
  type EditorHandle,
  type LetterEditorChange,
} from "pagedly";
import "pagedly/styles.css";

import { BrandMark } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { toLetterDraft } from "@/lib/letters/toLetterDraft";
import { SaveStatusChip, type SaveState } from "@/components/editor/SaveStatusChip";

/**
 * /pagedly2/:draftId — the SECOND, polished pagedly editor surface.
 *
 * v1 (/pagedly/:draftId) is a bare <LetterEditor> with no chrome. v2 wraps it
 * in a real app top bar (back-to-classic, title, a TRUTHFUL save-status chip,
 * Edit/Read-only toggle, Find, Download PDF, Download Word) and turns on
 * pagedly's full capability set (tables, headings, lists, outline, command
 * palette, page numbers, A4, watermark). Both surfaces stay reachable from the
 * editor Tools menu so they can be compared side by side.
 *
 * Design spec: the multi-agent design pass (2026-06-15). Key correctness rules:
 *  - the draft is mapped to LetterDraft ONCE per draftId (pagedly keeps its own
 *    live copy; re-mapping every render would clobber in-editor edits);
 *  - we persist via the single onChange path (writing ONLY sections back to the
 *    store), with no-op + blank-write guards so reflow/remount can't flip clean
 *    sections to "edited" or blank real content;
 *  - the save chip only claims DEVICE durability (the sync local write), never
 *    server durability (the async dual-write mirror raises its own toasts);
 *  - comments + inline-AI are OFF for now — pagedly comment spans would pollute
 *    the stored section HTML (comments are app-owned), and the AI adapter is a
 *    follow-up.
 */
function slug(s: string): string {
  return s.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "letter";
}

const V2_FEATURES = { ...FEATURES_FULL, comments: false, ai: false };

export function PagedlyEditorV2() {
  const { draftId } = useParams<{ draftId: string }>();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const updateSection = useDraftStore((s) => s.updateSection);

  const editorRef = useRef<EditorHandle | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  // Map ONCE per draft — pagedly copies the prop into its own live ref on mount,
  // so re-mapping on every store change would fight the editor and clobber edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mappedDraft = useMemo(() => (draft ? toLetterDraft(draft) : null), [draftId]);

  const titleText = (draft?.title?.trim() || "Untitled letter") as string;

  // The single write path. pagedly hands us the full sparse map of changed
  // sections; we write ONLY sections back (employer/evidence are display-only
  // inbound and have no safe return channel). Sync local write → "saved".
  const persist = useCallback(
    (change: LetterEditorChange) => {
      if (!draftId) return;
      try {
        const d = useDraftStore.getState().drafts[draftId];
        if (!d) return;
        let wrote = false;
        for (const [key, html] of Object.entries(change.sections)) {
          const cur = d.sections.find((s) => s.id === key || s.sectionId === key);
          if (!cur) continue; // never blind-create an unknown section
          if (cur.html === html) continue; // no-op guard (avoids churning clean → edited)
          if (html === "" && cur.html.trim() !== "") continue; // blank-write guard (data-loss)
          updateSection(d.id, cur.id, html);
          wrote = true;
        }
        // The store write is synchronous to localStorage, so durability is
        // achieved the instant updateSection returns.
        if (wrote) setSave({ kind: "saved", at: Date.now() });
      } catch {
        setSave({ kind: "error" });
        toast.error("Couldn't save your changes to this device.");
      }
    },
    [draftId, updateSection],
  );

  const retrySave = useCallback(() => {
    // Re-settle pending edits; flush() re-emits onChange → persist runs again.
    void editorRef.current?.flush();
  }, []);

  const onFind = useCallback(() => editorRef.current?.openFind(), []);
  const onDownloadPdf = useCallback(
    () => editorRef.current?.downloadPdf?.({ filename: `${slug(titleText)}.pdf` }),
    [titleText],
  );
  const onDownloadWord = useCallback(async () => {
    const h = editorRef.current;
    if (!h) return;
    try {
      const html = await h.flush();
      downloadDocx(html, `${slug(titleText)}.docx`);
    } catch {
      toast.error("Couldn't export to Word.");
    }
  }, [titleText]);

  if (!draft || !mappedDraft) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-[15px] font-semibold text-[var(--ds-ink)]">Draft not found.</p>
          <Link
            to="/"
            className="mt-3 inline-block text-[13px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          >
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--ds-canvas)]">
      {/* Top bar — mirrors the classic editor's h-14 --ds-* header grammar. */}
      <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 sm:px-4">
        {/* LEFT: back to the classic editor + brand + title */}
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/editor/${draftId}`}
            aria-label="Back to the classic editor"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[var(--ds-muted)] transition hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
          >
            <ChevronLeft className="size-4" />
            <BrandMark size={28} />
          </Link>
          <span className="truncate text-[14px] font-semibold text-[var(--ds-ink)]" title={titleText}>
            {titleText}
          </span>
          <span className="hidden shrink-0 rounded-full bg-[var(--ds-line-2)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] sm:inline">
            beta · v2
          </span>
        </div>

        {/* CENTER: the save-status trust anchor */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <SaveStatusChip state={save} onRetry={retrySave} />
        </div>

        {/* RIGHT: view toggle + actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--ds-line)]">
            <ToggleSeg active={viewMode === "edit"} onClick={() => setViewMode("edit")} icon={<Pencil className="size-3.5" />} label="Edit" />
            <ToggleSeg active={viewMode === "preview"} onClick={() => setViewMode("preview")} icon={<Eye className="size-3.5" />} label="Read-only" />
          </div>
          <BarButton onClick={onFind} icon={<Search className="size-3.5" />} label="Find" />
          <BarButton onClick={onDownloadPdf} icon={<FileDown className="size-3.5" />} label="PDF" />
          <BarButton onClick={onDownloadWord} icon={<FileText className="size-3.5" />} label="Word" />
          <Link
            to={`/editor/${draftId}`}
            className="ml-1 hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ds-muted)] transition hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] md:inline-flex"
          >
            <PenLine className="size-3.5" /> Classic editor
          </Link>
        </div>
      </header>

      {/* The pagedly editor fills the rest. */}
      <div className="min-h-0 flex-1">
        <LetterEditor
          key={draft.id}
          draft={mappedDraft}
          editorRef={editorRef}
          toolbar
          toolbarPosition="sticky"
          toolbarLayout="full"
          features={V2_FEATURES}
          readOnly={viewMode === "preview"}
          showPageNumbers
          pageSize="A4"
          watermark={draft.reviewStatus !== "approved" ? "DRAFT" : undefined}
          onChange={persist}
          className="h-full"
          canvasClassName="bg-[var(--ds-canvas)]"
        />
      </div>
    </div>
  );
}

function ToggleSeg({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1 px-2.5 text-[12px] font-medium transition",
        active ? "bg-[var(--ds-ink)] text-white" : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function BarButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12px] font-medium text-[var(--ds-body)] transition hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
