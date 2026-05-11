import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  draft: Draft;
  activeSectionId: string | null;
  onSelect: (id: string) => void;
};

export function SectionsList({ draft, activeSectionId, onSelect }: Props) {
  const total = draft.sections.length;
  const ready = draft.sections.filter((s) => s.status === "ready").length;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-3 space-y-0.5">
        {/* Apple-minimal: header shows progress count next to "Sections" so the
         * user always knows how close the letter is to done without opening the
         * preview. */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--ds-muted)] uppercase tracking-[0.08em]">
            Sections
          </span>
          <span
            className="text-[10px] font-medium text-[var(--ds-muted)] tabular-nums"
            title={`${ready} of ${total} sections marked ready`}
          >
            {ready}/{total}
          </span>
        </div>
        {draft.sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-colors",
              activeSectionId === s.id
                ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)] font-medium"
                : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
            )}
          >
            <span className="inline-grid place-items-center size-5 rounded-md bg-[var(--ds-line-2)] text-[10px] font-medium text-[var(--ds-muted)] shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 truncate">{s.title}</span>
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                s.status === "ready" && "bg-[var(--ds-green-fg)]",
                s.status === "edited" && "bg-[var(--ds-amber-fg)]",
                s.status === "streaming" && "bg-[var(--ds-ink)] animate-pulse",
                s.status === "empty" && "bg-[var(--ds-line)]"
              )}
            />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
