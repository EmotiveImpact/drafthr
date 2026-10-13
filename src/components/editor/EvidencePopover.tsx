import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Draft, EvidenceItem, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Paperclip, Image as ImageIcon, Mail, NotebookText, CalendarDays, Plus, ExternalLink, X } from "lucide-react";
import { Link } from "react-router-dom";

const KIND_ICON: Record<EvidenceItem["kind"], typeof FileText> = {
  email: Mail,
  calendar: CalendarDays,
  document: FileText,
  screenshot: ImageIcon,
  note: NotebookText,
};

const KIND_LABEL: Record<EvidenceItem["kind"], string> = {
  email: "Email",
  calendar: "Calendar",
  document: "Document",
  screenshot: "Screenshot",
  note: "Note",
};
const MAX_INLINE_EVIDENCE_BYTES = 10 * 1024 * 1024;

function kindFromMime(mime?: string): EvidenceItem["kind"] {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "screenshot";
  if (mime === "message/rfc822" || mime === "text/plain") return "email";
  return "document";
}

async function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Inline evidence affordance per section. Replaces the previous "click 📎 →
 * navigate to /evidence" detour. Lets the user:
 *  - drop / pick a file directly onto the section
 *  - add a quick note
 *  - see linked evidence + remove items
 *  - "Open full binder →" jump to the dedicated /evidence route for power
 *    use (verbatim toggles, multi-section linking, etc.)
 *
 * Linked evidence still lives in draft.evidence[]; the popover just creates
 * items pre-linked to this section.
 */
export function EvidencePopover({
  draft,
  section,
  linkedEvidence,
  open,
  onOpenChange,
  trigger,
}: {
  draft: Draft;
  section: Section;
  linkedEvidence: EvidenceItem[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: React.ReactNode;
}) {
  const setEvidence = useDraftStore((s) => s.setEvidence);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const addFile = async (file: File) => {
    if (file.size > MAX_INLINE_EVIDENCE_BYTES) {
      toast.error(`${file.name} is larger than 10 MB`, {
        description: "Use a smaller file, or summarise it as a note in the evidence drawer.",
      });
      return;
    }
    const dataUrl = (await readAsDataUrl(file)) ?? undefined;
    const item: EvidenceItem = {
      id: uid(),
      kind: kindFromMime(file.type),
      filename: file.name,
      mimeType: file.type || undefined,
      fileDataUrl: dataUrl,
      sectionIds: [section.id],
      content: "",
      uploadedAt: Date.now(),
      includeVerbatim: false,
    };
    setEvidence(draft.id, [...(draft.evidence ?? []), item]);
  };

  const addNote = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    const item: EvidenceItem = {
      id: uid(),
      kind: "note",
      sectionIds: [section.id],
      content: trimmed,
      uploadedAt: Date.now(),
      includeVerbatim: false,
    };
    setEvidence(draft.id, [...(draft.evidence ?? []), item]);
    setNote("");
  };

  const removeItem = (id: string) => {
    setEvidence(
      draft.id,
      (draft.evidence ?? []).filter((e) => e.id !== id)
    );
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    for (const f of files) await addFile(f);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 pt-3 pb-2 border-b border-[var(--ds-line-2)]">
          <div className="flex items-center gap-2">
            <Paperclip className="size-3.5 text-[var(--ds-muted)]" />
            <span className="text-[12px] font-medium text-[var(--ds-ink)]">
              Evidence for {section.title}
            </span>
            <span className="ml-auto text-[10px] text-[var(--ds-muted)] tabular-nums">
              {linkedEvidence.length} item{linkedEvidence.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Drop / pick zone */}
        <div className="p-3 border-b border-[var(--ds-line-2)]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={
              "block rounded-md border border-dashed text-center text-[11.5px] cursor-pointer transition " +
              (dragOver
                ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)] text-[var(--ds-ink)]"
                : "border-[var(--ds-line)] text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)]")
            }
          >
            <span className="block py-3 px-2">
              Drop a file here, or click to pick
              <span className="block text-[10px] mt-0.5 opacity-70">
                Original quality preserved · embeds inline in the export pack
              </span>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                for (const f of files) await addFile(f);
              }}
            />
          </label>
        </div>

        {/* Quick note */}
        <div className="p-3 border-b border-[var(--ds-line-2)] space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)]">
            Quick note
          </p>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder="e.g. 'Manager confirmed verbally on 14 April'"
            className="w-full text-[12px] rounded-md border border-[var(--ds-line)] bg-white px-2 py-1.5 outline-none focus:border-[var(--ds-ink)] resize-none"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={!note.trim()}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--ds-body)] hover:text-[var(--ds-ink)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="size-3" /> Add note
          </button>
        </div>

        {/* Existing items */}
        {linkedEvidence.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto">
            {linkedEvidence.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2 px-3 py-2 text-[12px] hover:bg-[var(--ds-line-2)] group"
                >
                  <Icon className="size-3.5 mt-0.5 text-[var(--ds-muted)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--ds-ink)] truncate">
                      {item.filename || `${KIND_LABEL[item.kind]}`}
                    </div>
                    {item.content && (
                      <div className="text-[11px] text-[var(--ds-muted)] line-clamp-2 mt-0.5">
                        {item.content}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)] shrink-0"
                    aria-label="Remove evidence"
                    title="Remove evidence"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Link
          to={`/editor/${draft.id}/evidence?section=${section.id}`}
          className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] border-t border-[var(--ds-line-2)]"
          onClick={() => onOpenChange(false)}
        >
          <span>Open full evidence binder</span>
          <ExternalLink className="size-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
