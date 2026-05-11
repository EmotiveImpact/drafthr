import type { Draft } from "@/lib/letters/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToneOverride } from "./ToneOverride";
import { WithoutPrejudiceToggle } from "./WithoutPrejudiceToggle";
import { useDraftStore } from "@/lib/store";
import { Settings2 } from "lucide-react";

/**
 * Apple-minimal change: collapse Tone + Without-Prejudice into a single
 * "Document" popover so the secondary toolbar reads cleanly. The full
 * controls live one click away — same components, same handlers.
 */
export function DocumentPopover({ draft }: { draft: Draft }) {
  const setWithoutPrejudice = useDraftStore((s) => s.setWithoutPrejudice);
  const hasWP = draft.mode === "employee";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[11px] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
          aria-label="Document settings"
        >
          <Settings2 className="size-3.5" />
          <span>Document</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-3 space-y-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ds-muted)]">
            Tone
          </p>
          <div className="-mx-2">
            <ToneOverride draft={draft} />
          </div>
        </div>
        {hasWP && (
          <div className="space-y-1 pt-2 border-t border-[var(--ds-line-2)]">
            <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ds-muted)]">
              Privilege
            </p>
            <WithoutPrejudiceToggle
              draft={draft}
              onChange={(v) => setWithoutPrejudice(draft.id, v)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
