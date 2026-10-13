import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, CircleSlash, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadText, Initials } from "@/components/letters/parts";
import type { EmployeeFormValues } from "./EmployeeForm";
import { employeeCsvTemplate, readEmployeesCsv, UNREADABLE, type ImportPreview } from "./importCsv";

/**
 * "Import CSV" on the employee directory: download a template, drop or pick a
 * file, see what will be created (and what is skipped, and why), then import.
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  existingNames,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingNames: string[];
  onImport: (people: EmployeeFormValues[]) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFileName(null);
      setPreview(null);
    }
  }, [open]);

  const read = (file: File | null | undefined) => {
    if (!file) return;
    setFileName(file.name);
    file
      .text()
      .then((text) => setPreview(readEmployeesCsv(text, existingNames)))
      .catch(() => setPreview({ rows: [], error: UNREADABLE }));
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    read(e.dataTransfer.files?.[0]);
  };

  const good = preview?.rows.filter((r) => !r.skip && r.values) ?? [];
  const skipped = (preview?.rows.length ?? 0) - good.length;

  const doImport = () => {
    onImport(good.map((r) => r.values!));
    toast.success(`${good.length} ${good.length === 1 ? "employee" : "employees"} imported, ${skipped} skipped`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-32px)] max-w-[600px] flex-col">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            One person per row, with a <code className="ds-mono text-[12px]">legal_name</code> (or <code className="ds-mono text-[12px]">name</code>) column. Optional:{" "}
            <code className="ds-mono text-[12px]">email</code>, <code className="ds-mono text-[12px]">job_title</code>, <code className="ds-mono text-[12px]">department</code>,{" "}
            <code className="ds-mono text-[12px]">start_date</code>, <code className="ds-mono text-[12px]">status</code>, <code className="ds-mono text-[12px]">manager</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center rounded-[14px] border border-dashed px-5 py-7 text-center transition-colors duration-[120ms]",
              over ? "border-[var(--ds-ink)] bg-[var(--ds-surface-3)]" : "border-[var(--ds-line-strong)] bg-[var(--ds-surface-2)]"
            )}
          >
            <Upload aria-hidden className="size-5 text-[var(--ds-muted)]" />
            <p className="m-0 mt-2.5 text-[14px] font-medium text-[var(--ds-ink)]">Drag a CSV file here</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
                <FileSpreadsheet />
                Choose file
              </Button>
              <Button variant="ghost" size="sm" onClick={() => downloadText("drafthr-employees-template.csv", employeeCsvTemplate())}>
                <Download />
                Download template
              </Button>
            </div>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="CSV file"
              onChange={(e) => {
                read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {fileName && <p className="m-0 mt-3 text-[12.5px] text-[var(--ds-muted)]">{fileName}</p>}
          </div>

          {preview?.error && (
            <p role="alert" className="m-0 mt-3 rounded-[10px] bg-[var(--ds-red-bg)] px-3.5 py-2.5 text-[13px] text-[var(--ds-red-fg)]">
              {preview.error}
            </p>
          )}

          {preview && !preview.error && (
            <div className="mt-4">
              <p className="m-0 mb-2 text-[13px] text-[var(--ds-muted)]" aria-live="polite">
                <b className="font-medium text-[var(--ds-ink)]">{good.length}</b> to import
                {skipped > 0 && (
                  <>
                    , <b className="font-medium text-[var(--ds-ink)]">{skipped}</b> skipped
                  </>
                )}
              </p>
              <ul className="m-0 list-none rounded-[12px] border border-[var(--ds-line)] p-0">
                {preview.rows.map((r) => (
                  <li key={r.line} className="flex items-start gap-3 border-t border-[var(--ds-line-2)] px-3 py-2.5 first:border-t-0">
                    {r.name ? (
                      <Initials name={r.name} seed={r.name} size={28} />
                    ) : (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ds-surface-2)] text-[var(--ds-faint)]">
                        <CircleSlash className="size-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[13.5px]", r.skip ? "text-[var(--ds-subtle)] line-through" : "font-medium text-[var(--ds-ink)]")}>
                        {r.name || `Row ${r.line}`}
                      </div>
                      {r.values && (
                        <div className="truncate text-[12px] text-[var(--ds-muted)]">
                          {[r.values.jobTitle, r.values.department, r.values.email].filter(Boolean).join(" · ") || "No details"}
                        </div>
                      )}
                      {r.warnings.map((w) => (
                        <div key={w} className={cn("mt-0.5 flex items-start gap-1.5 text-[12px]", r.skip ? "text-[var(--ds-subtle)]" : "text-[var(--ds-amber-fg)]")}>
                          <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                    <span className="ds-mono shrink-0 text-[11.5px] text-[var(--ds-faint)]">Row {r.line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={good.length === 0} onClick={doImport}>
            Import {good.length || ""} {good.length === 1 ? "employee" : "employees"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
