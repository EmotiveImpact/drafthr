import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertCircle, FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDraftStore } from "@/lib/store";
import { letterCatalogByMode, type LetterTypeMeta } from "@/lib/letters/catalog";
import type { Jurisdiction, LetterTypeId, Mode } from "@/lib/letters/types";
import { Field, KitDialogContent, KitDialogFooter, Segmented, Spinner } from "@/components/wizard/kit";
import { cn } from "@/lib/utils";
import {
  UPLOAD_ACCEPT,
  formatBytes,
  nameFromFile,
  readTemplateFile,
  uploadKind,
  uploadTargetSection,
  validateUpload,
} from "./uploadTemplate";

type Picked = {
  file: File;
  progress: number;
  html: string | null;
  error: string | null;
};

/** Best guess at the base letter from the file name, else the first one. */
function guessBase(fileName: string, catalog: LetterTypeMeta[]): LetterTypeId | "" {
  const n = fileName.toLowerCase();
  const hit = catalog.find(
    (l) => n.includes(l.id.replace(/_/g, " ")) || n.includes(l.id) || n.includes(l.shortTitle.toLowerCase())
  );
  return hit?.id ?? "";
}

/**
 * "Upload template": read a file the team already uses (plain text,
 * Markdown, HTML or Word) into a firm template, saved in this workspace
 * under Your templates.
 */
export function UploadTemplateModal({
  open,
  onOpenChange,
  mode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  onSaved?: (templateId: string) => void;
}) {
  const createCustomTemplate = useDraftStore((s) => s.createCustomTemplate);
  const defaultJurisdiction = "UK" as Jurisdiction;
  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState<LetterTypeId | "">("");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(defaultJurisdiction);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setPicked(null);
    setRejection(null);
    setName("");
    setBase("");
    setJurisdiction(defaultJurisdiction);
    setSaving(false);
  }, [open, defaultJurisdiction]);

  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = validateUpload(file);
    if (problem) {
      setRejection(problem);
      setPicked(null);
      return;
    }
    setRejection(null);
    setPicked({ file, progress: 0, html: null, error: null });
    if (!name.trim()) setName(nameFromFile(file.name));
    if (!base) setBase(guessBase(file.name, catalog) || (catalog[0]?.id ?? ""));
    // Read once for real progress, then parse the text out of it.
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (!e.lengthComputable) return;
      setPicked((p) => (p && p.file === file ? { ...p, progress: Math.min(0.9, e.loaded / e.total) } : p));
    };
    reader.onerror = () =>
      setPicked((p) => (p && p.file === file ? { ...p, error: "We couldn't read this file. Try again." } : p));
    reader.onload = () => {
      void readTemplateFile(file).then(
        (html) => setPicked((p) => (p && p.file === file ? { ...p, progress: 1, html } : p)),
        (err: unknown) =>
          setPicked((p) =>
            p && p.file === file
              ? { ...p, progress: 1, error: err instanceof Error ? err.message : "We couldn't read this file." }
              : p
          )
      );
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  };

  const error = rejection ?? picked?.error ?? null;
  const ready = Boolean(picked?.html) && name.trim().length > 0 && base !== "";

  const onUpload = () => {
    if (!ready || !picked?.html || !base) return;
    setSaving(true);
    const meta = catalog.find((l) => l.id === base)!;
    const id = createCustomTemplate({
      name: name.trim(),
      description: `Uploaded from ${picked.file.name}.`,
      baseLetterType: base,
      mode,
      jurisdiction,
      sectionHtml: { [uploadTargetSection(meta)]: picked.html },
      answers: {},
    });
    toast.success(`Saved "${name.trim()}" to Your templates`, {
      description: "Find it under Templates, Your templates, to start a new letter from it.",
    });
    onOpenChange(false);
    onSaved?.(id);
  };

  const kind = picked ? uploadKind(picked.file.name) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KitDialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload template</DialogTitle>
          <DialogDescription>
            Bring in wording your team already uses. It is saved in your workspace under Your templates.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              aria-label="Choose a template file"
              data-testid="upload-template-input"
              onChange={(e) => {
                take(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              aria-describedby="upload-rule"
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-[14px] border border-dashed px-5 py-6 text-center transition-colors duration-[120ms]",
                error
                  ? "border-[var(--ds-red-line)] bg-[var(--ds-red-soft)]"
                  : dragging
                    ? "border-[var(--ds-ink)] bg-[var(--ds-surface-2)]"
                    : "border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)]"
              )}
            >
              <span className="grid size-10 place-items-center rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)]">
                <FileUp className="size-[18px]" aria-hidden />
              </span>
              <span className="text-[14.5px] font-medium text-[var(--ds-ink)]">Drop a template here, or choose a file</span>
              <span id="upload-rule" className="text-[13px] text-[var(--ds-muted)]">
                Plain text, Markdown, HTML or Word (.docx), up to 1 MB
              </span>
            </button>
            {error && (
              <p role="alert" className="m-0 mt-2 flex items-start gap-1.5 text-[12.5px] text-[var(--ds-red-fg)]">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>

          {picked && !picked.error && (
            <div className="flex items-center gap-3 rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--ds-red-soft)] text-[10.5px] font-semibold uppercase text-[var(--ds-red-fg)]">
                {kind === "docx" ? "DOC" : kind === "markdown" ? "MD" : kind === "html" ? "HTML" : "TXT"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{picked.file.name}</div>
                <div className="text-[12.5px] text-[var(--ds-subtle)]">
                  {formatBytes(picked.file.size)} · {picked.html ? "ready" : "reading"}
                </div>
              </div>
              <span
                aria-hidden
                className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--ds-surface-3)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${Math.round(picked.progress * 100)}%` }}
                />
              </span>
            </div>
          )}

          <Field label="Name" htmlFor="upload-tpl-name" required>
            <Input
              id="upload-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard probation outcome"
              maxLength={120}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Base letter type" htmlFor="upload-tpl-base" help="Sets the sections and checks.">
              <Select value={base || undefined} onValueChange={(v) => setBase(v as LetterTypeId)}>
                <SelectTrigger id="upload-tpl-base" className="w-full">
                  <SelectValue placeholder="Pick a letter type" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.shortTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Jurisdiction default">
              <Segmented
                label="Jurisdiction default"
                value={jurisdiction}
                onChange={setJurisdiction}
                options={[
                  { value: "UK", label: "UK" },
                  { value: "US", label: "US" },
                ]}
              />
            </Field>
          </div>
        </div>

        <KitDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onUpload} disabled={!ready || saving}>
            {saving && <Spinner />}
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}
