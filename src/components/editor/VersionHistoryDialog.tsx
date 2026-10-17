import { useEffect, useState } from "react";
import type { Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  section: Section | null;
  onRestore: (html: string) => void;
};

/**
 * Saved versions of one section: pick a version on the left to read it,
 * then restore it. Restoring keeps the current text as a version (the
 * caller pushes it before replacing the section).
 */
export function VersionHistoryDialog({ open, onClose, section, onRestore }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSelected(null);
  }, [open, section?.id]);
  if (!section) return null;
  const versions = [...section.versions].reverse();
  const sel = versions.find((v) => v.id === selected) ?? versions[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[800px]">
        <div className="border-b border-[var(--ds-line-2)] px-6 pb-4 pt-5 pr-14">
          <DialogTitle className="text-[22px]">Version history, {section.title}</DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px]">
            Earlier drafts of this section. Choose a version to read it, then restore it. The current text is kept as a version.
          </DialogDescription>
        </div>
        {versions.length === 0 ? (
          <p className="m-0 px-6 py-10 text-center text-[13.5px] text-[var(--ds-muted)]">No saved versions of this section yet.</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 sm:h-[420px] sm:grid-cols-[210px_1fr]">
            <div className="min-h-0 overflow-auto rounded-[12px] border border-[var(--ds-line)] p-1.5 max-sm:max-h-[160px]" role="listbox" aria-label="Versions">
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  role="option"
                  aria-selected={sel?.id === v.id}
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                    sel?.id === v.id
                      ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]"
                      : "text-[var(--ds-body)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)]"
                  )}
                >
                  <span className="ds-mono text-[12px] text-[var(--ds-muted)]">v{versions.length - i}</span>
                  <span className="min-w-0 truncate">
                    {new Date(v.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
            <div className="min-h-0 overflow-auto rounded-[12px] border border-[var(--ds-line)]">
              <div
                className="prose prose-sm max-w-none p-4 font-serif text-[14.5px] text-[var(--ds-body)] [&_p]:my-2 [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(sel?.html ?? "") }}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-[var(--ds-line-2)] px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!sel}
            onClick={() => {
              if (sel) onRestore(sel.html);
            }}
          >
            Restore this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
