import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  draft: Draft;
  activeSectionId: string | null;
  onSelect: (id: string) => void;
};

export function SectionsList({ draft, activeSectionId, onSelect }: Props) {
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-0.5">
        <div className="px-2 py-1.5 text-[11px] font-semibold text-[var(--ds-muted)]">
          Sections
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
