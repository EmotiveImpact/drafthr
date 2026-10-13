import { useEffect, useId, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Link2,
  Mail,
  NotebookText,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Draft, EvidenceItem, Section } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor, sectionLabels } from "@/lib/evidence";
import { isSafeImageDataUrl } from "@/lib/safe-data-url";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Evidence side panel — the permanent right-rail counterpart of the modal
 * EvidenceDrawer. Lives on the Evidence step where managing evidence IS the
 * primary task, so this surface bundles:
 *
 *   - "Add new evidence" inline form (collapsible)
 *   - Search input across name / content / linked sections
 *   - Kind-filter tab strip (All / Emails / Screenshots / Documents / Notes)
 *   - Card list — each card supports:
 *       · inline edit (filename / content / display mode / figure label)
 *       · link / unlink against draft sections (via a section chip strip
 *         showing the active section pre-highlighted)
 *       · Reference / Quote insertion against the currently-active section
 *       · delete
 *   - Footer counter
 *
 * The drawer in EvidenceDrawer.tsx is unchanged — it's still triggered from
 * the Edit step's section-header paperclip popover when 5+ items exist.
 * This component is on a permanent rail, so no Sheet wrapper, no overlay,
 * no close button.
 * ------------------------------------------------------------------------ */

type Kind = EvidenceItem["kind"];

const KIND_ICON: Record<Kind, typeof FileText> = {
  email: Mail,
  calendar: CalendarDays,
  document: FileText,
  screenshot: ImageIcon,
  note: NotebookText,
};

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "calendar", label: "Calendar" },
  { value: "document", label: "Document" },
  { value: "screenshot", label: "Screenshot" },
  { value: "note", label: "Note" },
];

type FilterTab = "all" | "email" | "calendar" | "screenshot" | "document" | "note";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "email", label: "Emails" },
  { id: "calendar", label: "Calendar" },
  { id: "screenshot", label: "Screenshots" },
  { id: "document", label: "Docs" },
  { id: "note", label: "Notes" },
];

const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

export type EvidencePanelInsertHandler = (
  item: EvidenceItem,
  kind: "reference" | "quote",
) => void;

type Props = {
  draft: Draft;
  /** Section currently focused in the canvas — used as the default link
   * target for newly added evidence and as the insertion target for the
   * Reference / Quote buttons. */
  activeSectionId: string | null;
  /** Mutate the draft's evidence list. */
  onChangeEvidence: (items: EvidenceItem[]) => void;
  /** Insert a reference (or quote) at the currently-focused section's
   * cursor. Implemented by the parent route since it owns updateSection. */
  onInsertAtSection: EvidencePanelInsertHandler;
  /** Auto-open the Add form on mount — driven by `?action=add` URL param. */
  autoOpenAdd?: boolean;
  /** Look only: no Add, Edit, Delete, Reference, Quote or Link (the letter
   *  is locked while out for review or with the approver, or this person
   *  cannot edit it). */
  readOnly?: boolean;
  /** Why it is read only, shown above the list. */
  readOnlyNote?: string;
};

export function EvidencePanel({
  draft,
  activeSectionId,
  onChangeEvidence,
  onInsertAtSection,
  autoOpenAdd,
  readOnly = false,
  readOnlyNote,
}: Props) {
  const evidence = draft.evidence ?? [];

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [addOpenState, setAddOpen] = useState<boolean>(Boolean(autoOpenAdd));
  const addOpen = addOpenState && !readOnly;
  const [editingId, setEditingId] = useState<string | null>(null);

  // Open the Add form whenever the parent flips autoOpenAdd true (URL change).
  useEffect(() => {
    if (autoOpenAdd) setAddOpen(true);
  }, [autoOpenAdd]);

  // Counts per filter tab — drives the badge numbers.
  const counts = useMemo(() => {
    const result: Record<FilterTab, number> = {
      all: evidence.length,
      email: 0,
      calendar: 0,
      screenshot: 0,
      document: 0,
      note: 0,
    };
    for (const item of evidence) {
      result[item.kind] += 1;
    }
    return result;
  }, [evidence]);

  // Filtered list — search needle + kind filter.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evidence.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (needle) {
        const linked = (item.sectionIds ?? [])
          .map((id) => draft.sections.find((s) => s.id === id)?.title ?? "")
          .join(" ");
        const haystack = `${item.filename ?? ""} ${item.content ?? ""} ${item.kind} ${linked}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [evidence, query, filter, draft.sections]);

  const addItem = (item: EvidenceItem) => {
    onChangeEvidence([...evidence, item]);
  };

  const updateItem = (id: string, patch: Partial<EvidenceItem>) => {
    onChangeEvidence(
      evidence.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeItem = (id: string) => {
    if (editingId === id) setEditingId(null);
    onChangeEvidence(evidence.filter((item) => item.id !== id));
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--ds-surface)]">
      {/* Header — mirrors the AIPanel header bar in row height + typography
       * so the right-rail switch between Edit (AI) and Evidence doesn't
       * shift the surrounding chrome.
       */}
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--ds-line)] px-4 py-2.5">
        <div
          className="size-7 rounded-lg grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0"
          aria-hidden
        >
          <Paperclip className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[13px] font-semibold text-[var(--ds-ink)]">
            Evidence
          </h2>
          <p className="m-0 text-[10.5px] text-[var(--ds-muted)]">
            {evidence.length} {evidence.length === 1 ? "item" : "items"}
          </p>
        </div>
        {!readOnly && <Button
          size="xs"
          variant={addOpen ? "secondary" : "default"}
          onClick={() => setAddOpen((open) => !open)}
          aria-expanded={addOpen}
        >
          {addOpen ? (
            <>
              <X className="size-3" />
              Close
            </>
          ) : (
            <>
              <Plus className="size-3" />
              Add
            </>
          )}
        </Button>}
      </header>
      {readOnly && readOnlyNote && (
        <p className="m-0 shrink-0 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12.5px] leading-snug text-[var(--ds-muted)]">
          {readOnlyNote}
        </p>
      )}

      {/* Add-new form — collapsible. When closed, just the toggle stays in
       * the header. */}
      {addOpen && (
        <AddEvidenceForm
          draft={draft}
          defaultSectionId={activeSectionId ?? null}
          onSubmit={(item) => {
            addItem(item);
            setAddOpen(false);
          }}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {/* Search */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface-2)] px-3 py-2">
        <Search className="size-3.5 text-[var(--ds-muted)] shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search evidence…"
          className="h-7 flex-1 rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] focus:outline-none focus:border-[var(--ds-ink)] placeholder:text-[var(--ds-muted)]"
        />
      </div>

      {/* Kind filters: chips that wrap, so none is cut off at the panel's
       * edge (LETTER-X32), as in the evidence drawer. */}
      <div role="tablist" aria-label="Evidence kinds" className="flex shrink-0 flex-wrap gap-1.5 border-b border-[var(--ds-line)] px-3 py-2">
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.id;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                isActive
                  ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
                  : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]",
              )}
            >
              <span>{tab.label}</span>
              <span className={cn("ds-mono text-[11px] tabular-nums", isActive ? "text-[var(--ds-faint)]" : "text-[var(--ds-muted)]")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Evidence list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            hasAny={evidence.length > 0}
            onAdd={readOnly ? undefined : () => setAddOpen(true)}
          />
        ) : (
          <ul className="m-0 list-none p-3 space-y-2">
            {filtered.map((item) => (
              <EvidenceCard
                key={item.id}
                draft={draft}
                item={item}
                activeSectionId={activeSectionId}
                isEditing={editingId === item.id}
                onStartEdit={() => setEditingId(item.id)}
                onStopEdit={() => setEditingId(null)}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onDelete={() => removeItem(item.id)}
                onInsertReference={() => onInsertAtSection(item, "reference")}
                onInsertQuote={() => onInsertAtSection(item, "quote")}
                readOnly={readOnly}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ===========================================================================
 * Add-new evidence inline form
 * ======================================================================== */

function AddEvidenceForm({
  draft,
  defaultSectionId,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  defaultSectionId: string | null;
  onSubmit: (item: EvidenceItem) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>("note");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [includeVerbatim, setIncludeVerbatim] = useState(false);
  const [sectionIds, setSectionIds] = useState<string[]>(
    defaultSectionId ? [defaultSectionId] : [],
  );
  const [fileData, setFileData] = useState<{
    dataUrl?: string;
    mimeType?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);

  // Keep section-id selection in sync with the active section when the form
  // is still pristine — once the user picks something, we leave it alone.
  useEffect(() => {
    if (sectionIds.length === 0 && defaultSectionId) {
      setSectionIds([defaultSectionId]);
    }
  }, [defaultSectionId, sectionIds.length]);

  const toggleSection = (id: string) => {
    setSectionIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_EVIDENCE_FILE_BYTES) {
      setError(
        `${file.name} is larger than 10 MB. Use a smaller file or summarise it as a note.`,
      );
      return;
    }
    setError(null);
    setFilename(file.name);
    setKind(file.type.startsWith("image/") ? "screenshot" : "document");
    const dataUrl = await readAsDataUrl(file);
    setFileData({ dataUrl, mimeType: file.type });
    if (
      file.size <= MAX_TEXT_PREVIEW_BYTES &&
      (file.type.startsWith("text/") ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".md"))
    ) {
      setContent(await file.text());
    } else if (!content.trim()) {
      setContent(`Uploaded file: ${file.name}`);
    }
  };

  const canSubmit =
    content.trim().length > 0 ||
    filename.trim().length > 0 ||
    Boolean(fileData.dataUrl);

  const submit = () => {
    if (!canSubmit) return;
    const text = content.trim();
    const name = filename.trim();
    const item: EvidenceItem = {
      id: uid("ev"),
      kind,
      filename: name || undefined,
      content: text || (name ? `Uploaded file: ${name}` : "Evidence item"),
      uploadedAt: Date.now(),
      includeVerbatim,
      sectionIds,
      fileDataUrl: fileData.dataUrl,
      mimeType: fileData.mimeType,
    };
    onSubmit(item);
  };

  const typeLabelId = useId();
  return (
    <div className="shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="block text-[10.5px] font-medium text-[var(--ds-muted)]">
          <span id={typeLabelId}>Type</span>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger
              size="sm"
              aria-labelledby={typeLabelId}
              className="mt-1 h-7 w-full rounded-md px-1.5 text-[12px] font-normal data-[size=sm]:h-7 data-[size=sm]:text-[12px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[60]">
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="block text-[10.5px] font-medium text-[var(--ds-muted)]">
          Label
          <input
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            placeholder="email.pdf"
            className="mt-1 h-7 w-full rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)]"
          />
        </label>
      </div>

      <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--ds-line)] bg-white text-[11px] text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] transition">
        <Upload className="size-3" />
        {fileData.dataUrl ? "Replace file" : "Upload file"}
        <input
          type="file"
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files?.[0])}
        />
      </label>

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Paste key text, quote, or a short factual summary."
        rows={4}
        className="w-full resize-y rounded-md border border-[var(--ds-line)] bg-white px-2 py-1.5 text-[12px] leading-relaxed text-[var(--ds-ink)] focus:border-[var(--ds-ink)] focus:outline-none placeholder:text-[var(--ds-muted)]"
      />

      {draft.sections.length > 0 && (
        <div className="rounded-md bg-white border border-[var(--ds-line)] p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--ds-muted)]">
            <Link2 className="size-3" />
            Link to sections
          </div>
          <div className="max-h-32 space-y-0.5 overflow-auto pr-1">
            {draft.sections.map((section) => (
              <label
                key={section.id}
                className="flex items-center gap-1.5 text-[11px] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] px-1 py-0.5 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={sectionIds.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                />
                <span className="truncate">{section.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[var(--ds-muted)]">
        <input
          type="checkbox"
          checked={includeVerbatim}
          onChange={(event) => setIncludeVerbatim(event.target.checked)}
          className="mt-0.5"
        />
        Include exact content in AI prompts when the wording matters.
      </label>

      {error && (
        <p className="m-0 text-[11px] text-[var(--ds-red-fg)] bg-[var(--ds-red-bg)] rounded-md px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="xs"
          onClick={submit}
          disabled={!canSubmit}
          className="flex-1"
        >
          Add evidence
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Per-item card (read + edit)
 * ======================================================================== */

function EvidenceCard({
  draft,
  item,
  activeSectionId,
  isEditing,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onDelete,
  onInsertReference,
  onInsertQuote,
  readOnly = false,
}: {
  readOnly?: boolean;
  draft: Draft;
  item: EvidenceItem;
  activeSectionId: string | null;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (patch: Partial<EvidenceItem>) => void;
  onDelete: () => void;
  onInsertReference: () => void;
  onInsertQuote: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const evidence = draft.evidence ?? [];
  const figLabel = figureLabelFor(item, evidence);
  const linked = sectionLabels(draft, item.sectionIds);
  const mode = displayModeOf(item);
  const isLinkedToActive =
    activeSectionId !== null && (item.sectionIds ?? []).includes(activeSectionId);

  const toggleSectionLink = (sectionId: string) => {
    const current = item.sectionIds ?? [];
    onUpdate({
      sectionIds: current.includes(sectionId)
        ? current.filter((candidate) => candidate !== sectionId)
        : [...current, sectionId],
    });
  };

  return (
    <li
      className={cn(
        "rounded-md border bg-white transition-shadow",
        isLinkedToActive
          ? "border-[var(--ds-ink)]/40 shadow-[0_0_0_3px_rgba(24,24,27,0.06)]"
          : "border-[var(--ds-line)] hover:border-[var(--ds-subtle)]",
      )}
    >
      <div className="flex items-start gap-2.5 p-2.5">
        <div
          className="size-8 rounded-md grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0"
          aria-hidden
        >
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <h3 className="m-0 truncate text-[12.5px] font-semibold text-[var(--ds-ink)]">
                {item.filename || labelFor(item.kind)}
              </h3>
              <p className="m-0 text-[10.5px] text-[var(--ds-muted)] truncate">
                {labelFor(item.kind)}
                {linked ? ` · ${linked}` : " · general"}
                {mode === "figure" && figLabel ? ` · ${figLabel}` : ""}
              </p>
            </div>
            {!readOnly && <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={isEditing ? onStopEdit : onStartEdit}
                aria-label={isEditing ? "Close editor" : "Edit evidence"}
                title={isEditing ? "Close editor" : "Edit"}
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
              >
                {isEditing ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <Pencil className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete evidence"
                title="Delete"
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
              >
                <Trash2 className="size-3" />
              </button>
            </div>}
          </div>

          {!isEditing && (
            <p className="mt-1.5 m-0 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--ds-body)]">
              {item.parsedSummary || item.content}
            </p>
          )}

          {!isEditing &&
            isSafeImageDataUrl(item.fileDataUrl) &&
            item.mimeType?.startsWith("image/") && (
              <img
                src={item.fileDataUrl}
                alt=""
                className="mt-2 max-h-28 w-full rounded-md border border-[var(--ds-line)] object-cover"
              />
            )}

          {/* Insertion actions — only meaningful when a section is active.
           * The reference / quote / link buttons all act on activeSectionId. */}
          {!readOnly && <div className="mt-2 flex flex-wrap gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={onInsertReference}
              disabled={!activeSectionId}
              title={
                activeSectionId
                  ? "Append a reference to the active section"
                  : "Click a section in the letter first"
              }
            >
              <Link2 className="size-3" />
              Reference
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={onInsertQuote}
              disabled={!activeSectionId || !item.content.trim()}
              title={
                !item.content.trim()
                  ? "Add content to this item first"
                  : activeSectionId
                  ? "Append a blockquote to the active section"
                  : "Click a section in the letter first"
              }
            >
              <Quote className="size-3" />
              Quote
            </Button>
            {activeSectionId && (
              <Button
                size="xs"
                variant={isLinkedToActive ? "secondary" : "outline"}
                onClick={() => toggleSectionLink(activeSectionId)}
              >
                <ChevronRight className="size-3" />
                {isLinkedToActive ? "Linked here" : "Link to active"}
              </Button>
            )}
          </div>}
        </div>
      </div>

      {isEditing && !readOnly && (
        <CardEditPanel
          draft={draft}
          item={item}
          onUpdate={onUpdate}
          onClose={onStopEdit}
        />
      )}
    </li>
  );
}

/* ===========================================================================
 * Inline edit panel — shown beneath the card body when the user pencils
 * an item open. Edits the same fields the Add form does, plus the figure
 * display-mode chip strip the old EvidenceStep had.
 * ======================================================================== */

function CardEditPanel({
  draft,
  item,
  onUpdate,
  onClose,
}: {
  draft: Draft;
  item: EvidenceItem;
  onUpdate: (patch: Partial<EvidenceItem>) => void;
  onClose: () => void;
}) {
  const typeLabelId = useId();
  const mode = displayModeOf(item);
  const evidence = draft.evidence ?? [];
  const autoLabel = figureLabelFor(item, evidence);

  return (
    <div className="border-t border-[var(--ds-line-2)] bg-[var(--ds-surface-2)] px-2.5 py-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="block text-[10px] font-medium text-[var(--ds-muted)]">
          <span id={typeLabelId}>Type</span>
          <Select value={item.kind} onValueChange={(v) => onUpdate({ kind: v as Kind })}>
            <SelectTrigger
              size="sm"
              aria-labelledby={typeLabelId}
              className="mt-1 h-7 w-full rounded-md px-1.5 text-[12px] font-normal data-[size=sm]:h-7 data-[size=sm]:text-[12px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[60]">
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="block text-[10px] font-medium text-[var(--ds-muted)]">
          Label
          <input
            value={item.filename ?? ""}
            onChange={(event) =>
              onUpdate({ filename: event.target.value || undefined })
            }
            placeholder={labelFor(item.kind)}
            className="mt-1 h-7 w-full rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)]"
          />
        </label>
      </div>

      <textarea
        value={item.content}
        onChange={(event) => onUpdate({ content: event.target.value })}
        placeholder="Key text, quote, or factual summary."
        rows={4}
        className="w-full resize-y rounded-md border border-[var(--ds-line)] bg-white px-2 py-1.5 text-[12px] leading-relaxed text-[var(--ds-ink)] focus:border-[var(--ds-ink)] focus:outline-none placeholder:text-[var(--ds-muted)]"
      />

      {/* Section linking — same checkbox stack as the Add form. */}
      {draft.sections.length > 0 && (
        <div className="rounded-md bg-white border border-[var(--ds-line)] p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-[var(--ds-muted)]">
            <Link2 className="size-3" />
            Linked sections
          </div>
          <div className="max-h-28 space-y-0.5 overflow-auto pr-1">
            {draft.sections.map((section) => {
              const checked = (item.sectionIds ?? []).includes(section.id);
              return (
                <label
                  key={section.id}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] px-1 py-0.5 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const current = item.sectionIds ?? [];
                      onUpdate({
                        sectionIds: checked
                          ? current.filter((id) => id !== section.id)
                          : [...current, section.id],
                      });
                    }}
                  />
                  <span className="truncate">{section.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Display-mode chip strip — figure / inline / attached / pack-only.
       * Same control surface as the old EvidenceStep card. */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ds-muted)]">
          Show as
        </div>
        <div className="flex flex-wrap gap-1">
          {(["figure", "inline", "attached", "pack_only"] as const).map(
            (candidate) => {
              const active = mode === candidate;
              const labels: Record<typeof candidate, string> = {
                figure: "Fig",
                inline: "Inline",
                attached: "Attached",
                pack_only: "Pack only",
              };
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => onUpdate({ displayMode: candidate })}
                  className={cn(
                    "text-[10.5px] px-2 py-0.5 rounded-full border transition",
                    active
                      ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
                      : "bg-white text-[var(--ds-muted)] border-[var(--ds-line)] hover:border-[var(--ds-subtle)]",
                  )}
                >
                  {labels[candidate]}
                </button>
              );
            },
          )}
        </div>
        {mode === "figure" && (
          <input
            type="text"
            value={item.figureLabel ?? ""}
            placeholder={autoLabel || "Fig N"}
            onChange={(event) => onUpdate({ figureLabel: event.target.value })}
            title="Custom label (e.g. 'Exhibit A'). Leave blank for auto-numbered."
            className="mt-1 h-7 w-full rounded-md border border-[var(--ds-line)] bg-white px-2 text-[11.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)] focus:border-[var(--ds-ink)] focus:outline-none"
          />
        )}
      </div>

      <label className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[var(--ds-muted)]">
        <input
          type="checkbox"
          checked={item.includeVerbatim}
          onChange={(event) => onUpdate({ includeVerbatim: event.target.checked })}
          className="mt-0.5"
        />
        Include exact content in AI prompts when wording matters.
      </label>

      <div className="flex items-center justify-end">
        <Button size="xs" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Empty state
 * ======================================================================== */

function EmptyState({
  hasAny,
  onAdd,
}: {
  hasAny: boolean;
  onAdd?: () => void;
}) {
  if (!hasAny) {
    return (
      <div className="text-center px-4 py-10">
        <div className="mx-auto size-10 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] grid place-items-center mb-2.5">
          <Paperclip className="size-4" />
        </div>
        <p className="m-0 text-[12.5px] font-semibold text-[var(--ds-ink)]">
          No evidence yet
        </p>
        <p className="m-0 mt-1 mb-3 text-[11px] text-[var(--ds-muted)] max-w-[220px] mx-auto leading-snug">
          {onAdd
            ? "Add emails, screenshots, documents or notes. You can then link each item to the sections that rely on it."
            : "Nothing has been added to this letter."}
        </p>
        {onAdd && (
          <Button size="xs" onClick={onAdd}>
            <Plus className="size-3" />
            Add evidence
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="text-center px-4 py-10">
      <div className="mx-auto size-10 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)] grid place-items-center mb-2.5">
        <Search className="size-4" />
      </div>
      <p className="m-0 text-[12.5px] font-semibold text-[var(--ds-ink)]">
        No matches
      </p>
      <p className="m-0 mt-1 text-[11px] text-[var(--ds-muted)]">
        Try a different search term or filter.
      </p>
    </div>
  );
}

/* ===========================================================================
 * Helpers
 * ======================================================================== */

function labelFor(kind: Kind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* ===========================================================================
 * HTML helpers — used by the parent route when wiring onInsertAtSection. We
 * export them here so the EvidenceStep doesn't have to re-implement.
 * ======================================================================== */

export function appendEvidenceHtml(current: string, next: string): string {
  return `${current.trim()}${current.trim() ? "\n" : ""}${next}`;
}

export function buildEvidenceReferenceHtml(
  item: EvidenceItem,
): string {
  const name = displayNameFor(item);
  return `<p>I refer to ${escapeHtml(name)} as supporting evidence for the matters set out in this section.</p>`;
}

export function buildEvidenceQuoteHtml(item: EvidenceItem): string {
  const name = displayNameFor(item);
  const quote = item.content.trim();
  if (!quote) return "";
  return `<p>I rely on the following excerpt from ${escapeHtml(name)}:</p><blockquote><p>${escapeHtml(truncateForQuote(quote, 700))}</p></blockquote>`;
}

export function findTargetSectionForItem(
  draft: Draft,
  item: EvidenceItem,
  preferredSectionId: string | null,
): Section | undefined {
  if (preferredSectionId) {
    const exact = draft.sections.find((section) => section.id === preferredSectionId);
    if (exact) return exact;
  }
  const firstLinked = item.sectionIds?.[0];
  return firstLinked
    ? draft.sections.find((section) => section.id === firstLinked)
    : draft.sections[0];
}

function displayNameFor(item: EvidenceItem): string {
  return item.filename || labelFor(item.kind);
}

function truncateForQuote(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trim()}...`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
