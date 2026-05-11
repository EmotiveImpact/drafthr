import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Link2,
  ListPlus,
  Mail,
  NotebookText,
  Paperclip,
  Quote,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft, EvidenceItem, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { linkedEvidenceForSection, sectionLabels } from "@/lib/evidence";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { cn, uid } from "@/lib/utils";

const KIND_OPTIONS: { value: EvidenceItem["kind"]; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "calendar", label: "Calendar" },
  { value: "document", label: "Document" },
  { value: "screenshot", label: "Screenshot" },
  { value: "note", label: "Note" },
];

export function EvidenceStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const setEvidence = useDraftStore((s) => s.setEvidence);
  const updateSection = useDraftStore((s) => s.updateSection);

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    params.get("section")
  );
  const [kind, setKind] = useState<EvidenceItem["kind"]>("note");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [includeVerbatim, setIncludeVerbatim] = useState(false);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [fileData, setFileData] = useState<{ dataUrl?: string; mimeType?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);

  const evidence = draft?.evidence ?? [];
  const selectedSection = useMemo(
    () => draft?.sections.find((section) => section.id === selectedSectionId) ?? defaultEvidenceSection(draft),
    [draft, selectedSectionId]
  );

  useEffect(() => {
    if (!draft) return;
    const requested = params.get("section");
    const exists = requested && draft.sections.some((section) => section.id === requested);
    setSelectedSectionId(exists ? requested : defaultEvidenceSection(draft)?.id ?? null);
  }, [draft, params]);

  useEffect(() => {
    if (!selectedSection?.id) return;
    if (sectionIds.length > 0 || filename.trim() || content.trim() || fileData.dataUrl) return;
    setSectionIds([selectedSection.id]);
  }, [content, fileData.dataUrl, filename, sectionIds.length, selectedSection?.id]);

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4" /> Back home
        </Button>
      </div>
    );
  }

  const selectSection = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setSectionIds((current) => (current.length === 0 ? [sectionId] : current));
  };

  const resetForm = () => {
    setKind("note");
    setFilename("");
    setContent("");
    setIncludeVerbatim(false);
    setSectionIds(selectedSection?.id ? [selectedSection.id] : []);
    setFileData({});
  };

  const addEvidence = () => {
    const text = content.trim();
    const name = filename.trim();
    if (!text && !name && !fileData.dataUrl) return;

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
    setEvidence(draft.id, [...evidence, item]);
    setNotice(`Added ${item.filename || labelFor(item.kind)}.`);
    resetForm();
  };

  const removeEvidence = (id: string) => {
    setEvidence(draft.id, evidence.filter((item) => item.id !== id));
  };

  const toggleFormSection = (id: string) => {
    setSectionIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
    );
  };

  const toggleItemSection = (item: EvidenceItem, sectionId: string) => {
    const current = item.sectionIds ?? [];
    const next = current.includes(sectionId)
      ? current.filter((candidate) => candidate !== sectionId)
      : [...current, sectionId];
    setEvidence(
      draft.id,
      evidence.map((candidate) =>
        candidate.id === item.id ? { ...candidate, sectionIds: next } : candidate
      )
    );
  };

  const insertReference = (item: EvidenceItem) => {
    const target = targetSectionForItem(draft, item, selectedSection?.id);
    if (!target) return;
    updateSection(
      draft.id,
      target.id,
      appendHtml(
        target.html,
        `<p>I refer to ${escapeHtml(displayName(item))} as supporting evidence for the matters set out in this section.</p>`
      )
    );
    setNotice(`Referenced ${displayName(item)} in ${target.title}.`);
  };

  const insertQuote = (item: EvidenceItem) => {
    const target = targetSectionForItem(draft, item, selectedSection?.id);
    const quote = item.content.trim();
    if (!target || !quote) return;
    updateSection(
      draft.id,
      target.id,
      appendHtml(
        target.html,
        `<p>I rely on the following excerpt from ${escapeHtml(displayName(item))}:</p><blockquote><p>${escapeHtml(truncate(quote, 700))}</p></blockquote>`
      )
    );
    setNotice(`Quoted ${displayName(item)} in ${target.title}.`);
  };

  const insertAttachmentList = () => {
    if (evidence.length === 0) return;
    const target =
      draft.sections.find((section) => section.sectionId === "evidence_attached") ??
      draft.sections.find((section) => section.sectionId === "witnesses") ??
      selectedSection;
    if (!target) return;
    updateSection(
      draft.id,
      target.id,
      appendHtml(
        target.html,
        `<p><strong>Evidence and attachments</strong></p><ul>${evidence
          .map((item) => `<li>${escapeHtml(displayName(item))}${item.sectionIds?.length ? ` (${escapeHtml(sectionLabels(draft, item.sectionIds))})` : ""}</li>`)
          .join("")}</ul>`
      )
    );
    setNotice(`Inserted attachment list in ${target.title}.`);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setFilename(file.name);
    setKind(file.type.startsWith("image/") ? "screenshot" : "document");
    setFileData({ dataUrl: await readAsDataUrl(file), mimeType: file.type });
    if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      setContent(await file.text());
    } else if (!content.trim()) {
      setContent(`Uploaded file: ${file.name}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--ds-canvas)]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] px-4">
        <Button variant="ghost" size="icon-sm" onClick={() => nav(`/editor/${draft.id}`)} aria-label="Back to letter">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[14px] font-semibold text-[var(--ds-ink)]">
            Evidence & Attachments
          </h1>
          <p className="m-0 truncate text-[11px] text-[var(--ds-muted)]">
            {draft.employee.legalName || draft.employer.legalName || "Draft"} · {evidence.length} item{evidence.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="ml-auto hidden items-center gap-1 text-[11px] text-[var(--ds-muted)] md:flex">
          <StepPill done label="Draft letter" />
          <ArrowRight className="size-3" />
          <StepPill active label="Evidence" />
          <ArrowRight className="size-3" />
          <StepPill label="Review/export" />
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link to={`/editor/${draft.id}`}>Back to letter</Link>
        </Button>
        <Button size="sm" onClick={() => nav(`/editor/${draft.id}/review`)}>
          Next: Review <ArrowRight className="size-4" />
        </Button>
      </header>

      {notice && (
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--ds-line)] bg-[var(--ds-green-bg)] px-4 py-2 text-[12px] text-[var(--ds-green-fg)]"
        >
          <CheckCircle2 className="size-3.5" />
          {notice}
        </button>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:block">
          <div className="border-b border-[var(--ds-line-2)] px-4 py-3">
            <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
              Sections
            </h2>
          </div>
          <div className="h-full min-h-0 overflow-auto p-3">
            {draft.sections.map((section, index) => {
              const count = linkedEvidenceForSection(draft, section.id).length;
              const selected = selectedSection?.id === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => selectSection(section.id)}
                  className={cn(
                    "mb-1 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
                    selected
                      ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)]"
                      : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-[var(--ds-line-2)] text-[10px] text-[var(--ds-muted)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  {count > 0 && (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--accent-9)] text-[10px] font-semibold text-[var(--accent-contrast)]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-4 sm:p-6">
          <section className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
                  Selected section
                </p>
                <h2 className="m-0 mt-1 truncate text-[17px] font-semibold text-[var(--ds-ink)]">
                  {selectedSection?.title ?? "No section selected"}
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={insertAttachmentList} disabled={evidence.length === 0}>
                <ListPlus className="size-4" />
                Insert attachment list
              </Button>
            </div>
            {selectedSection?.html ? (
              <div
                className="mt-3 max-h-36 overflow-auto rounded-md bg-[var(--ds-canvas)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ds-body)]"
                dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(selectedSection.html) }}
              />
            ) : (
              <p className="mt-3 rounded-md bg-[var(--ds-canvas)] px-3 py-2 text-[12px] text-[var(--ds-muted)]">
                This section has no text yet.
              </p>
            )}
          </section>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-semibold text-[var(--ds-ink)]">
                Evidence items
              </h2>
              <span className="text-[11px] text-[var(--ds-muted)]">
                Reference, quote, or list each item before review.
              </span>
            </div>

            {evidence.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-8 text-center text-[13px] text-[var(--ds-muted)]">
                No evidence yet. Add notes, files, screenshots, or email excerpts from the panel on the right.
              </div>
            ) : (
              <div className="space-y-3">
                {evidence.map((item) => (
                  <EvidenceRow
                    key={item.id}
                    draft={draft}
                    item={item}
                    selectedSectionId={selectedSection?.id}
                    onToggleSection={(sectionId) => toggleItemSection(item, sectionId)}
                    onReference={() => insertReference(item)}
                    onQuote={() => insertQuote(item)}
                    onDelete={() => removeEvidence(item.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="min-h-0 overflow-auto border-t border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 lg:border-l lg:border-t-0">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Paperclip className="size-4 text-[var(--ds-muted)]" />
              <h2 className="m-0 text-[13px] font-semibold text-[var(--ds-ink)]">
                Add evidence
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-[var(--ds-muted)]">
                Type
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as EvidenceItem["kind"])}
                  className="mt-1 h-8 w-full rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[12px] text-[var(--ds-ink)]"
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] text-[var(--ds-muted)]">
                File or label
                <input
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder="email.pdf"
                  className="mt-1 h-8 w-full rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[12px] text-[var(--ds-ink)]"
                />
              </label>
            </div>

            <label className="mt-2 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--ds-line)] text-[12px] text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)]">
              <Upload className="size-3.5" />
              Upload file
              <input type="file" className="hidden" onChange={(event) => void onUpload(event.target.files?.[0])} />
            </label>

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste key text, quote, or write a short factual summary."
              rows={7}
              className="mt-2 w-full resize-y rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--ds-ink)] focus:border-[var(--ds-ink)] focus:outline-none"
            />

            <div className="mt-2 rounded-md bg-[var(--ds-line-2)] p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--ds-muted)]">
                <Link2 className="size-3" />
                Link to sections
              </div>
              <div className="max-h-44 space-y-1 overflow-auto pr-1">
                {draft.sections.map((section) => (
                  <label
                    key={section.id}
                    className="flex items-center gap-2 text-[11px] text-[var(--ds-body)]"
                  >
                    <input
                      type="checkbox"
                      checked={sectionIds.includes(section.id)}
                      onChange={() => toggleFormSection(section.id)}
                    />
                    <span className="truncate">{section.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--ds-muted)]">
              <input
                type="checkbox"
                checked={includeVerbatim}
                onChange={(event) => setIncludeVerbatim(event.target.checked)}
                className="mt-0.5"
              />
              Include exact content in AI prompts when the wording matters.
            </label>

            <Button
              className="mt-3 w-full"
              onClick={addEvidence}
              disabled={!content.trim() && !filename.trim() && !fileData.dataUrl}
            >
              Add evidence
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function EvidenceRow({
  draft,
  item,
  selectedSectionId,
  onToggleSection,
  onReference,
  onQuote,
  onDelete,
}: {
  draft: Draft;
  item: EvidenceItem;
  selectedSectionId?: string;
  onToggleSection: (sectionId: string) => void;
  onReference: () => void;
  onQuote: () => void;
  onDelete: () => void;
}) {
  const Icon = iconFor(item.kind);
  const linked = sectionLabels(draft, item.sectionIds);
  const selectedLinked = selectedSectionId ? item.sectionIds?.includes(selectedSectionId) : false;

  return (
    <article className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--ds-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="m-0 truncate text-[13px] font-semibold text-[var(--ds-ink)]">
                {displayName(item)}
              </h3>
              <p className="m-0 mt-0.5 text-[11px] text-[var(--ds-muted)]">
                {labelFor(item.kind)} · {linked || "General evidence"}
              </p>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
              aria-label="Delete evidence"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[var(--ds-body)]">
            {item.parsedSummary || item.content}
          </p>

          {item.fileDataUrl && item.mimeType?.startsWith("image/") && (
            <img
              src={item.fileDataUrl}
              alt=""
              className="mt-2 max-h-40 w-full rounded-md border border-[var(--ds-line)] object-cover"
            />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="xs" variant="outline" onClick={onReference}>
              <Link2 className="size-3" />
              Reference in section
            </Button>
            <Button size="xs" variant="outline" onClick={onQuote} disabled={!item.content.trim()}>
              <Quote className="size-3" />
              Quote in section
            </Button>
            {selectedSectionId && (
              <Button size="xs" variant={selectedLinked ? "secondary" : "outline"} onClick={() => onToggleSection(selectedSectionId)}>
                {selectedLinked ? "Linked here" : "Link to selected"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function StepPill({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1",
        active && "bg-[var(--ds-ink)] text-white",
        done && !active && "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
        !active && !done && "bg-[var(--ds-line-2)] text-[var(--ds-muted)]"
      )}
    >
      {label}
    </span>
  );
}

function targetSectionForItem(
  draft: Draft,
  item: EvidenceItem,
  selectedSectionId: string | undefined
): Section | undefined {
  if (selectedSectionId) return draft.sections.find((section) => section.id === selectedSectionId);
  const firstLinked = item.sectionIds?.[0];
  return firstLinked
    ? draft.sections.find((section) => section.id === firstLinked)
    : draft.sections[0];
}

function defaultEvidenceSection(draft: Draft | undefined): Section | undefined {
  if (!draft) return undefined;
  return (
    draft.sections.find((section) => section.sectionId === "chronology") ??
    draft.sections.find((section) => section.sectionId === "witnesses") ??
    draft.sections.find((section) => section.sectionId === "body") ??
    draft.sections.find((section) => section.sectionId === "opening") ??
    draft.sections[0]
  );
}

function appendHtml(current: string, next: string): string {
  return `${current.trim()}${current.trim() ? "\n" : ""}${next}`;
}

function displayName(item: EvidenceItem): string {
  return item.filename || labelFor(item.kind);
}

function iconFor(kind: EvidenceItem["kind"]) {
  switch (kind) {
    case "email":
      return Mail;
    case "calendar":
      return CalendarDays;
    case "document":
      return FileText;
    case "screenshot":
      return ImageIcon;
    default:
      return NotebookText;
  }
}

function labelFor(kind: EvidenceItem["kind"]): string {
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

function truncate(value: string, max: number): string {
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
