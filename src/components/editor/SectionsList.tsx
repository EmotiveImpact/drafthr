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
      <div className="p-3 space-y-1">
        <div className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Sections
        </div>
        {draft.sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-sm text-xs flex items-center gap-2 hover:bg-accent",
              activeSectionId === s.id && "bg-accent"
            )}
          >
            <span className="inline-block size-5 rounded-full bg-muted text-[10px] font-medium grid place-items-center text-muted-foreground">
              {i + 1}
            </span>
            <span className="flex-1 truncate">{s.title}</span>
            <span
              className={cn(
                "size-1.5 rounded-full",
                s.status === "ready" && "bg-green-500",
                s.status === "edited" && "bg-amber-500",
                s.status === "streaming" && "bg-primary animate-pulse",
                s.status === "empty" && "bg-muted"
              )}
            />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
