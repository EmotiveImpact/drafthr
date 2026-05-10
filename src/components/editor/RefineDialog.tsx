import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRESETS = [
  "More formal",
  "More conciliatory",
  "Shorter",
  "Cite statute explicitly",
  "Add specific clause",
  "Drop the regret",
];

/**
 * Modal version of the per-section Refine popover. Used in Preview mode
 * (and any other surface that doesn't have a Regenerate button to anchor
 * the popover off). Same UX as RefinePopover; same submit semantics.
 */
export function RefineDialog({
  open,
  onOpenChange,
  sectionTitle,
  onRefineRegenerate,
  onPlainRegenerate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  sectionTitle?: string;
  onRefineRegenerate: (instruction: string) => void;
  onPlainRegenerate: () => void;
}) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) setBody("");
  }, [open]);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onRefineRegenerate(text);
    onOpenChange(false);
  };

  const addChip = (chip: string) => {
    setBody((b) => (b.trim() ? `${b.trim()}; ${chip.toLowerCase()}` : chip));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-4 text-[13px]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--ds-muted)]" />
              <Dialog.Title className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
                Refine {sectionTitle ?? "section"}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-[12px] text-[var(--ds-muted)] mb-3 leading-relaxed">
            Tell the model what to change. Wizard answers and section constraints still apply.
          </Dialog.Description>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. tighten the second paragraph, drop the regret line, cite s.95(1)(c) ERA explicitly"
            rows={4}
            className="w-full text-[13px] px-3 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => addChip(p)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
              >
                + {p}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                onPlainRegenerate();
                onOpenChange(false);
              }}
            >
              Plain regenerate
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px]"
                disabled={!body.trim()}
                onClick={submit}
              >
                Regenerate with refinement
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-[var(--ds-subtle)] mt-2">⌘ + Enter to submit</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
