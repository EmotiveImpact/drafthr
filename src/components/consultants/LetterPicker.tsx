import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, FilePlus2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaperThumb } from "@/components/consultants/ui";
import { useBookableLetters, type LetterFacts } from "@/components/consultants/letters";
import { cn } from "@/lib/utils";

/**
 * Pick which letter a booking carries (mk-book "Change", the strip's
 * "Change letter"). Your real letters, newest first, searchable by title or
 * employee. Sent letters are not offered; a letter already out for review is
 * marked, because booking it would take it back from its current reviewer.
 * Esc closes without changing the choice.
 */
export function LetterPicker({
  open,
  onOpenChange,
  selectedId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: string | null;
  onPick: (letter: LetterFacts) => void;
}) {
  const letters = useBookableLetters();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return letters;
    return letters.filter((l) => l.title.toLowerCase().includes(s) || l.employee.toLowerCase().includes(s));
  }, [letters, q]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQ("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-32px))] flex-col gap-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="gap-1 px-6 pb-3 pt-5 text-left">
          <DialogTitle className="ds-heading text-[22px] font-normal">Which letter?</DialogTitle>
          <DialogDescription className="text-[13.5px] text-[var(--ds-muted)]">
            The expert suggests changes and comments in the letter you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-subtle)]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by letter or employee"
              aria-label="Search letters"
              className="h-[38px] w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-[38px] pr-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-line-hover)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--ds-line-2)] px-3 py-2">
          {letters.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="m-0 text-[14px] text-[var(--ds-ink)]">No letters to send yet.</p>
              <Link
                to="/hr/new"
                className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--ds-ink)] underline decoration-[var(--ds-faint)] underline-offset-[3px]"
              >
                <FilePlus2 className="size-4" aria-hidden />
                Start a new letter
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <p className="m-0 px-3 py-8 text-center text-[13.5px] text-[var(--ds-muted)]">No letters match "{q.trim()}".</p>
          ) : (
            <ul role="listbox" aria-label="Letters" className="m-0 flex list-none flex-col gap-0.5 p-0">
              {shown.map((l) => {
                const on = l.id === selectedId;
                return (
                  <li key={l.id} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(l);
                        setQ("");
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                        on && "bg-[var(--ds-surface-2)]",
                      )}
                    >
                      <PaperThumb />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-[var(--ds-ink)]">{l.title}</span>
                        <span className="block truncate text-[12.5px] text-[var(--ds-muted)]">
                          {l.activeReview
                            ? `Out for review with ${l.activeReview.reviewer.name || "a reviewer"}. Booking takes it back from them.`
                            : l.status}
                        </span>
                      </span>
                      {on && <Check className="size-4 shrink-0 text-[var(--ds-ink)]" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
