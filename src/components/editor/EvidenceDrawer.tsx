import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Editor } from "@tiptap/react";
import {
  Paperclip,
  Search,
  X,
  ArrowRight,
  Upload,
  FileText,
  Mail,
  NotebookText,
  Image as ImageIcon,
  CalendarDays,
  PinIcon,
  Undo2,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";
import { isSafeImageDataUrl } from "@/lib/safe-data-url";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { uid } from "@/lib/utils";

/** Read a File as a base64 data URL. Same pattern as EvidencePanel. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Map a file's MIME type to an EvidenceItem kind. */
function kindFromFile(file: File): EvidenceItem["kind"] {
  const t = file.type || "";
  if (t.startsWith("image/")) return "screenshot";
  if (t.includes("pdf") || t.includes("word") || t.includes("document")) return "document";
  if (t.includes("calendar") || t.includes("ical")) return "calendar";
  if (t.startsWith("message/") || file.name.endsWith(".eml")) return "email";
  return "document";
}

/* ---------------------------------------------------------------------------
 * Kind metadata — kept local so we don't depend on imports outside scope.
 * Mirrors KIND_OPTIONS in EvidenceStep.tsx (which we cannot modify here).
 * ------------------------------------------------------------------------ */
type Kind = EvidenceItem["kind"];

const KIND_ICON: Record<Kind, typeof FileText> = {
  email: Mail,
  calendar: CalendarDays,
  document: FileText,
  screenshot: ImageIcon,
  note: NotebookText,
};

type FilterTab = "all" | "email" | "calendar" | "screenshot" | "document" | "note";

// Short labels — long ones ("Screenshots", "Documents") overflowed the
// pinned-rail width even with overflow-x-auto. These fit cleanly into a
// 380px slot at every viewport without scrolling.
const FILTER_TABS: { id: FilterTab; label: string; kind?: Kind }[] = [
  { id: "all", label: "All" },
  { id: "email", label: "Email", kind: "email" },
  { id: "calendar", label: "Cal", kind: "calendar" },
  { id: "screenshot", label: "Screens", kind: "screenshot" },
  { id: "document", label: "Docs", kind: "document" },
  { id: "note", label: "Notes", kind: "note" },
];

/* ---------------------------------------------------------------------------
 * Component
 *
 * The EvidenceDrawer has two render modes:
 *  - "floating" (default): a Sheet overlay that slides over the canvas. Used
 *    when the user is dipping in occasionally to insert a single citation.
 *  - "pinned": a permanent right column that REPLACES the AI agent rail. Used
 *    when the user is doing heavy evidence work (e.g. medical-leave letters
 *    where every paragraph cites a screenshot or email). Pinning persists per
 *    draft in localStorage so it survives page reloads.
 *
 * The Pin button (in the header) toggles between the two; the Edit page reads
 * the pinned state and uses it to choose which rail to mount (AI vs Evidence).
 * ------------------------------------------------------------------------ */
export function EvidenceDrawer({
  draft,
  editor,
  open,
  onOpenChange,
  pinned = false,
  onPinnedChange,
  canAdd = true,
  canManage = true,
}: {
  draft: Draft;
  editor: Editor | null;
  /** Only relevant in floating mode — controls the Sheet open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, render as a permanent right rail instead of a Sheet. */
  pinned?: boolean;
  /** Toggle pinned mode. When omitted, the Pin button is hidden. */
  onPinnedChange?: (next: boolean) => void;
  /** Upload new evidence: off while the letter is locked and for anyone
   *  who cannot edit it (a reviewer, a viewer). */
  canAdd?: boolean;
  /** The Manage evidence link to the Evidence page: off for a teammate
   *  reviewer, who sees only what was shared with them. */
  canManage?: boolean;
}) {
  const allItems = draft.evidence ?? [];
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Inline file upload — the old "Upload new" link navigated to the
  // /editor/:id/evidence route which 302's back to Edit, causing a
  // visible page flash. Now we just open a native file picker, read
  // each chosen file as a base64 data URL, and append to the draft's
  // evidence array via setEvidence. No navigation, no flash.
  const setEvidence = useDraftStore((s) => s.setEvidence);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const handleUploadFiles = async (files: FileList | null) => {
    if (!canAdd || !files || files.length === 0) return;
    setUploadStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    try {
      const items: EvidenceItem[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readAsDataUrl(file);
        items.push({
          id: uid("ev"),
          kind: kindFromFile(file),
          filename: file.name,
          content: "",
          fileDataUrl: dataUrl,
          mimeType: file.type || undefined,
          sectionIds: [],
          uploadedAt: Date.now(),
          includeVerbatim: false,
        });
      }
      // Append to the letter's own list: the drawer may be showing only what
      // a reviewer was given, and the rest must not be lost.
      const live = useDraftStore.getState().drafts[draft.id]?.evidence ?? allItems;
      setEvidence(draft.id, [...live, ...items]);
      setUploadStatus(`Added ${items.length} item${items.length > 1 ? "s" : ""}`);
      // Clear the status banner after a moment.
      window.setTimeout(() => setUploadStatus(null), 2400);
    } catch (err) {
      setUploadStatus(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Detect which evidence ids have already been inserted into ANY section
  // by scanning each section's HTML for `data-fig-id="ID"`. Re-computed every
  // open so the drawer reflects the current draft state. When pinned, the
  // drawer is always "open" so we recompute on any section-html change.
  const visible = open || pinned;
  const insertedIds = useMemo(() => {
    if (!visible) return new Set<string>();
    const set = new Set<string>();
    for (const section of draft.sections) {
      const html = section.html ?? "";
      // Match either figure-ref or attachment-ref tokens.
      const figRe = /data-fig-id="([^"]+)"/g;
      const attRe = /data-att-id="([^"]+)"/g;
      let m;
      while ((m = figRe.exec(html))) set.add(m[1]);
      while ((m = attRe.exec(html))) set.add(m[1]);
    }
    return set;
  }, [draft.sections, visible]);

  // Counts per tab — used for the small badges.
  const counts = useMemo(() => {
    const result: Record<FilterTab, number> = {
      all: allItems.length,
      email: 0,
      calendar: 0,
      screenshot: 0,
      document: 0,
      note: 0,
    };
    for (const item of allItems) {
      const tab = item.kind as FilterTab;
      if (
        tab === "email" ||
        tab === "calendar" ||
        tab === "screenshot" ||
        tab === "document" ||
        tab === "note"
      ) {
        result[tab] += 1;
      }
    }
    return result;
  }, [allItems]);

  // Filtered list — search + kind tab.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allItems.filter((item) => {
      // Kind filter
      if (activeTab !== "all") {
        if (item.kind !== activeTab) return false;
      }
      // Search filter — match name, content, or any linked section title.
      if (needle) {
        const linkedTitles = (item.sectionIds ?? [])
          .map((id) => draft.sections.find((s) => s.id === id)?.title ?? "")
          .join(" ");
        const haystack = `${item.filename ?? ""} ${item.content ?? ""} ${item.kind} ${linkedTitles}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [allItems, query, activeTab, draft.sections]);

  // Total bytes from items that carry a data URL — for the footer counter.
  const totalBytes = useMemo(() => {
    let sum = 0;
    for (const item of allItems) {
      if (!item.fileDataUrl) continue;
      // Rough base64 size: payload chars × 0.75
      const idx = item.fileDataUrl.indexOf(",");
      const payload = idx >= 0 ? item.fileDataUrl.length - idx - 1 : item.fileDataUrl.length;
      sum += Math.floor(payload * 0.75);
    }
    return sum;
  }, [allItems]);

  // Section title at the cursor — derived from the editor's parent
  // <section data-section-id="…"> when available. Best-effort; falls
  // back to empty string when the toolbar isn't associated with a section.
  const cursorSectionTitle = useMemo(() => {
    if (!editor) return "";
    const el = editor.options.element as HTMLElement | undefined;
    if (!el) return "";
    const node = el.closest<HTMLElement>("[data-section-id]");
    const id = node?.dataset.sectionId;
    if (!id) return "";
    return draft.sections.find((s) => s.id === id)?.title ?? "";
  }, [editor, draft.sections, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // After an insert the floating dialog closes and focus belongs in the
  // editor at the new reference, not back on the button that opened it.
  const focusEditorOnClose = useRef(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const insert = (item: EvidenceItem) => {
    if (!editor) return;
    const mode = displayModeOf(item);
    if (mode === "figure") {
      const label = figureLabelFor(item, allItems) || "Fig";
      editor
        .chain()
        .focus()
        .insertContent(
          `<span class="figure-ref" data-fig-id="${escAttr(item.id)}">[See ${escHtml(label)}]</span>&nbsp;`
        )
        .run();
    } else if (mode === "inline") {
      editor.chain().focus().insertContent(buildInlineHtml(item)).run();
    } else if (mode === "attached") {
      editor
        .chain()
        .focus()
        .insertContent(
          `<span class="attachment-ref" data-att-id="${escAttr(item.id)}">[See Attachments]</span>&nbsp;`
        )
        .run();
    }
    // When floating, the user expects the drawer to dismiss after insert
    // (the canvas is what they want to see next). When pinned, leave it open
    // — they're doing batched insertions and will dismiss themselves.
    if (!pinned) {
      focusEditorOnClose.current = true;
      onOpenChange(false);
    }
  };

  // ----------------- Shared body (used by both render modes) -----------------
  const headerNode = (
    <div className="px-5 py-4 border-b border-[var(--ds-line)] flex items-center gap-2.5">
      <div
        className="size-9 rounded-lg grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0"
        aria-hidden
      >
        <Paperclip className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        {pinned ? (
          <h2 className="text-[15px] font-bold tracking-tight text-[var(--ds-ink)]">
            Insert evidence
          </h2>
        ) : (
          // Dialog.Title gives the floating dialog its accessible name.
          <Dialog.Title className="text-[15px] font-bold tracking-tight text-[var(--ds-ink)]">
            Insert evidence
          </Dialog.Title>
        )}
        {cursorSectionTitle && (
          <p className="text-[11.5px] text-[var(--ds-muted)] mt-0.5 truncate">
            At cursor in §{cursorSectionTitle}
          </p>
        )}
      </div>
      {onPinnedChange && !pinned && (
        <button
          type="button"
          onClick={() => onPinnedChange(true)}
          aria-label="Pin evidence beside the letter"
          title="Keep evidence open beside the letter, in place of the side panel"
          className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-[11.5px] font-semibold text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
        >
          <PinIcon className="size-3.5" />
          Pin
          <ArrowRight className="size-3" />
        </button>
      )}
      {!pinned && (
        <Dialog.Close
          aria-label="Close evidence drawer"
          className="size-7 rounded-md grid place-items-center text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
        >
          <X className="size-4" />
        </Dialog.Close>
      )}
    </div>
  );

  const unpinBar = pinned && onPinnedChange ? (
    <div className="px-5 py-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-amber-bg)]/40 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPinnedChange(false)}
        aria-label="Unpin evidence and return the side panel"
        title="Unpin evidence and return the side panel"
        className="h-6 px-2 inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-[var(--ds-amber-fg)] hover:bg-[var(--ds-amber-bg)] transition"
      >
        <Undo2 className="size-3" />
        Unpin
      </button>
      <span className="text-[11px] text-[var(--ds-muted)]">
        Evidence pinned here. Unpin to bring back Progress and Ask DraftHR.
      </span>
    </div>
  ) : null;

  const innerBody = (
    <>
      {unpinBar}
      {headerNode}

        {/* Search */}
        <div className="px-5 py-3 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface-2)] flex items-center gap-2">
          <Search className="size-[14px] text-[var(--ds-muted)] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, kind, or section…"
            className="h-[30px] flex-1 rounded-md border border-[var(--ds-line)] bg-white px-2.5 text-[12.5px] focus:outline-none focus:border-[var(--ds-ink)] placeholder:text-[var(--ds-muted)]"
          />
        </div>

        {/* Tabs — min-w-0 on the flex container is required for overflow-x-auto
         * to actually kick in when the inner buttons exceed the slot width. */}
        <div className="flex min-w-0 justify-between border-b border-[var(--ds-line)] px-2">
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "py-2.5 px-1 text-[12px] font-semibold border-b-2 -mb-px transition whitespace-nowrap shrink-0",
                  isActive
                    ? "text-[var(--ds-ink)] border-[var(--ds-ink)]"
                    : "text-[var(--ds-muted)] border-transparent hover:text-[var(--ds-ink)]"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "ml-1 inline-block min-w-[16px] text-center text-[10.5px] font-semibold px-1 py-px rounded-full",
                    isActive
                      ? "bg-[var(--ds-ink)] text-white"
                      : "bg-[var(--ds-surface-2)] text-[var(--ds-muted)]"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Body — scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          {filtered.length === 0 ? (
            <EmptyState
              canAdd={canAdd}
              hasAnyEvidence={allItems.length > 0}
              onUploadClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const Icon = KIND_ICON[item.kind];
                const mode = displayModeOf(item);
                const label = figureLabelFor(item, allItems);
                const inserted = insertedIds.has(item.id);
                const modeLabel =
                  mode === "figure"
                    ? "As Figure"
                    : mode === "inline"
                    ? "As Inline"
                    : mode === "attached"
                    ? "Attachment"
                    : "Pack only";
                const disabled = mode === "pack_only" || !editor;

                return (
                  <li key={item.id}>
                    <div className="flex items-start gap-3 p-3.5 border border-[var(--ds-line)] rounded-xl hover:border-[var(--ds-subtle)] hover:shadow-sm transition">
                      <div
                        className="size-11 rounded-lg grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0"
                        aria-hidden
                      >
                        <Icon className="size-[18px]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold tracking-tight text-[var(--ds-ink)] truncate">
                          {item.filename || labelFor(item.kind)}
                        </div>
                        {item.content && (
                          <p className="text-[11.5px] text-[var(--ds-muted)] line-clamp-2 leading-snug mt-0.5">
                            {item.content}
                          </p>
                        )}
                        <p className="text-[10.5px] text-[var(--ds-subtle)] mt-1 tabular-nums">
                          {inserted ? (
                            <>
                              {mode === "figure" && label ? (
                                <>
                                  Already inserted as{" "}
                                  <strong className="text-[var(--ds-amber-fg)] font-bold">
                                    {label}
                                  </strong>
                                </>
                              ) : (
                                <>Already inserted</>
                              )}
                            </>
                          ) : mode === "figure" && label ? (
                            <>
                              Will insert as{" "}
                              <strong className="text-[var(--ds-amber-fg)] font-bold">
                                {label}
                              </strong>
                            </>
                          ) : mode === "inline" ? (
                            <>Will embed at cursor</>
                          ) : mode === "attached" ? (
                            <>Will reference Attachments</>
                          ) : (
                            <>Pack only, not inserted in the letter</>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[var(--ds-amber-fg)] bg-[var(--ds-amber-bg)] px-1.5 py-0.5 rounded">
                          {modeLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => insert(item)}
                          disabled={disabled}
                          className={cn(
                            "h-7 px-2.5 rounded-md text-[11.5px] font-semibold flex items-center gap-1 transition",
                            disabled
                              ? "bg-[var(--ds-line-2)] text-[var(--ds-muted)] cursor-not-allowed"
                              : "bg-[var(--ds-ink)] text-white hover:bg-[var(--ds-ink)]/90"
                          )}
                          title={
                            mode === "pack_only"
                              ? "Pack-only items aren't inserted into the letter"
                              : inserted
                              ? "Insert another reference"
                              : "Insert at cursor"
                          }
                        >
                          {inserted ? (
                            <>
                              Re-insert
                              <ArrowRight className="size-3" />
                            </>
                          ) : (
                            <>
                              Insert
                              <ArrowRight className="size-3" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — Upload-new opens a native file picker (inline, no navigation).
         * Manage evidence link returned per UX request — affordance for
         * discoverability even though the route redirects back to the drawer. */}
        <div className="px-5 py-3 border-t border-[var(--ds-line)] bg-[var(--ds-surface-2)] flex items-center gap-3">
          {canManage && (
            <Link
              to={`/editor/${draft.id}/evidence`}
              onClick={() => { if (!pinned) onOpenChange(false); }}
              className="text-[12px] font-semibold text-[var(--ds-ink)] underline decoration-[var(--ds-line)] underline-offset-[3px] hover:decoration-[var(--ds-ink)] flex items-center gap-1 shrink-0"
            >
              Manage evidence
              <ExternalLink className="size-3" />
            </Link>
          )}
          <span className="text-[11.5px] text-[var(--ds-muted)] tabular-nums">
            {allItems.length} {allItems.length === 1 ? "item" : "items"}
            {totalBytes > 0 && <> · {formatBytes(totalBytes)}</>}
          </span>
          {uploadStatus && (
            <span className="text-[11px] text-[var(--ds-amber-fg)] truncate">
              {uploadStatus}
            </span>
          )}
          {canAdd && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleUploadFiles(e.target.files);
                  e.target.value = ""; // allow re-picking the same file
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-auto h-[30px] px-3 bg-white border border-[var(--ds-line)] rounded-md text-[12px] font-semibold text-[var(--ds-ink)] flex items-center gap-1.5 hover:bg-[var(--ds-line-2)] transition"
              >
                <Upload className="size-3" />
                Upload new
              </button>
            </>
          )}
        </div>
    </>
  );

  // Pinned mode — render as a plain column. The Edit page mounts this in
  // place of the AI rail when pinned. Width/height come from the parent rail
  // slot so we just fill the slot.
  if (pinned) {
    return (
      <aside
        aria-label="Evidence"
        className="flex flex-col h-full min-h-0 bg-white text-[var(--ds-ink)]"
      >
        {innerBody}
      </aside>
    );
  }

  // Floating mode — a modal dialog on the Radix primitive, animated with
  // Framer Motion like the AI drawer. Radix supplies the accessibility:
  // role="dialog" + aria-modal, the label from Dialog.Title, focus moved in on
  // open and trapped while open, Escape and scrim click to close, the rest of
  // the page hidden from assistive tech, and focus returned to the element
  // that opened it on close.
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                key="evidence-drawer-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-30 bg-black/30"
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              aria-modal="true"
              aria-describedby={undefined}
              onOpenAutoFocus={() => {
                // Remember what opened the dialog. Radix only restores focus
                // to its own Dialog.Trigger, and this drawer is opened from
                // several places (toolbar, section header, keyboard shortcut).
                const active = document.activeElement;
                returnFocusTo.current =
                  active instanceof HTMLElement && active !== document.body ? active : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (focusEditorOnClose.current && editor) {
                  editor.commands.focus();
                } else if (returnFocusTo.current?.isConnected) {
                  returnFocusTo.current.focus();
                }
                focusEditorOnClose.current = false;
                returnFocusTo.current = null;
              }}
            >
              <motion.aside
                key="evidence-drawer-overlay"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                // The side panel's own width: it opens over the Edits /
                // Progress / Chat tabs, never over the document bar.
                className="fixed inset-y-0 right-0 z-40 w-full max-w-[380px] bg-[var(--ds-surface)] border-l border-[var(--ds-line)] shadow-[var(--ds-shadow-l)] flex flex-col min-h-0 overflow-hidden focus:outline-none"
              >
                {innerBody}
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/* ---------------------------------------------------------------------------
 * Empty state — distinguishes "no evidence yet" vs. "no matches".
 * ------------------------------------------------------------------------ */
function EmptyState({
  hasAnyEvidence,
  onUploadClick,
  canAdd = true,
}: {
  hasAnyEvidence: boolean;
  onUploadClick: () => void;
  canAdd?: boolean;
}) {
  if (!hasAnyEvidence) {
    return (
      <div className="text-center py-12 px-4">
        <div className="mx-auto size-12 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] grid place-items-center mb-3">
          <Paperclip className="size-5" />
        </div>
        <p className="text-[13px] font-semibold text-[var(--ds-ink)]">
          No evidence yet
        </p>
        <p className="text-[11.5px] text-[var(--ds-muted)] mt-1 mb-4 max-w-[280px] mx-auto leading-snug">
          Drop in emails, screenshots, documents or notes. They'll appear here
          and you can insert <strong>[See Fig N]</strong> references into the letter.
        </p>
        {canAdd && <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex items-center gap-1.5 h-[30px] px-3 bg-[var(--ds-ink)] text-white text-[12px] font-semibold rounded-md hover:bg-[var(--ds-ink)]/90 transition"
        >
          <Upload className="size-3" />
          Upload first item
        </button>}
      </div>
    );
  }
  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto size-12 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)] grid place-items-center mb-3">
        <Search className="size-5" />
      </div>
      <p className="text-[13px] font-semibold text-[var(--ds-ink)]">
        No matches
      </p>
      <p className="text-[11.5px] text-[var(--ds-muted)] mt-1">
        Try a different search term or filter.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Helpers — kept local to keep the file self-contained.
 * The insertion HTML mirrors EvidencePickerPopover.buildInlineHtml.
 * ------------------------------------------------------------------------ */
function buildInlineHtml(item: EvidenceItem): string {
  const caption = item.filename ? ` (${escHtml(item.filename)})` : "";
  if (item.kind === "screenshot" && isSafeImageDataUrl(item.fileDataUrl)) {
    return `<figure><img src="${escAttr(item.fileDataUrl)}" alt="${escAttr(
      item.filename || "screenshot"
    )}" />${
      item.content
        ? `<figcaption>${escHtml(item.content)}</figcaption>`
        : item.filename
        ? `<figcaption>${escHtml(item.filename)}</figcaption>`
        : ""
    }</figure>`;
  }
  if (item.kind === "note" || item.kind === "email" || item.kind === "calendar") {
    const text = item.content || item.filename || "Evidence";
    const kindLabel =
      item.kind === "email"
        ? "Email"
        : item.kind === "calendar"
        ? "Calendar entry"
        : "Note";
    return `<blockquote>${escHtml(text)}<br/><em>${kindLabel}${caption}</em></blockquote>`;
  }
  // Documents
  return `<p>I refer to the document <em>${escHtml(item.filename || "(unnamed)")}</em>${
    item.content ? `, summarised: ${escHtml(item.content)}` : ""
  }.</p>`;
}

function labelFor(kind: Kind): string {
  switch (kind) {
    case "email":
      return "Email";
    case "calendar":
      return "Calendar entry";
    case "document":
      return "Document";
    case "screenshot":
      return "Screenshot";
    case "note":
      return "Note";
    default:
      return kind;
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escHtml(s);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

