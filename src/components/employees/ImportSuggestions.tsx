import { useEffect, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import { Avatar } from "@/components/ds";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deriveEmployeesFromDrafts, type EmployeeSuggestion } from "@/lib/employees";
import type { Draft } from "@/lib/letters/types";

/**
 * Import-from-drafts dialog. Lists every unique person derived from the
 * current draft store and lets the user pick which ones to materialize as
 * Employee records. Already-existing employees (matched by normalized
 * legalName) are filtered out so we don't offer to duplicate them.
 */
export function ImportSuggestions({
  open,
  onOpenChange,
  drafts,
  existingNames,
  onImport,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  drafts: Record<string, Draft>;
  existingNames: Set<string>;
  onImport: (chosen: EmployeeSuggestion[]) => void;
}) {
  const suggestions = useMemo(() => {
    const all = deriveEmployeesFromDrafts(drafts);
    return all.filter(
      (s) => !existingNames.has(s.legalName.trim().toLowerCase().replace(/\s+/g, " "))
    );
  }, [drafts, existingNames]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Default to selecting everything when the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set(suggestions.map((s) => s.legalName)));
    }
  }, [open, suggestions]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const allSelected =
    suggestions.length > 0 && selected.size === suggestions.length;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(suggestions.map((s) => s.legalName)));
  }

  const chosen = suggestions.filter((s) => selected.has(s.legalName));
  const canSubmit = chosen.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-32px)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import employees from drafts</DialogTitle>
          <DialogDescription>
            We scanned your existing letters and grouped them by person.
            Pick the ones you'd like to add to the employee directory.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] py-8 text-center">
            <Users className="size-6 text-[var(--ds-muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--ds-muted)] m-0">
              No new people found in your drafts. Every employee mentioned
              has already been imported.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12.5px] text-[var(--ds-muted)] pb-1">
              <button
                type="button"
                onClick={toggleAll}
                className="font-medium text-[var(--ds-ink)] underline-offset-2 transition hover:underline"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span>
                {selected.size} of {suggestions.length} selected
              </span>
            </div>
            <div className="max-h-[min(360px,45dvh)] overflow-y-auto rounded-[12px] border border-[var(--ds-line)] divide-y divide-[var(--ds-line)]">
              {suggestions.map((s) => {
                const isSelected = selected.has(s.legalName);
                return (
                  <button
                    key={s.legalName}
                    type="button"
                    onClick={() => toggle(s.legalName)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 text-left transition",
                      isSelected
                        ? "bg-[var(--ds-surface-2)]"
                        : "bg-[var(--ds-surface)] hover:bg-[var(--ds-surface-2)]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-5 rounded-[5px] border grid place-items-center transition shrink-0",
                        isSelected
                          ? "bg-[var(--ds-accent)] border-[var(--ds-accent)] text-[var(--ds-on-accent)]"
                          : "border-[var(--ds-line-strong)] bg-[var(--ds-surface)]"
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                    <Avatar name={s.legalName} seed={s.legalName} size="xl" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13.5px] text-[var(--ds-ink)] truncate">
                        {s.legalName}
                      </div>
                      <div className="text-[12px] text-[var(--ds-muted)] truncate">
                        {[s.jobTitle, s.department].filter(Boolean).join(", ") ||
                          "No role on file"}
                      </div>
                    </div>
                    <div className="text-right text-[12px] text-[var(--ds-muted)] shrink-0">
                      {s.draftCount} draft{s.draftCount === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => onImport(chosen)}>
            Create {chosen.length || ""} record{chosen.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
