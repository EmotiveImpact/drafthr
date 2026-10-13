/**
 * Small matter parts shared by the matters list and the matter page: the
 * coloured initial tile, the next-deadline cell, the law chip, the avatar
 * stack and the delete confirmation.
 */
import { Scale } from "lucide-react";
import { toast } from "sonner";
import type { Matter } from "@/lib/letters/types";
import { matterInitial } from "@/lib/matters";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { ConfirmDialog } from "@/components/letters/dialogs";
import { Initials } from "@/components/letters/parts";
import { MATTER_SOLID, relativeDays, shortDay, type DeadlineItem, type MatterPerson } from "./model";

export function MatterMark({ matter, size = 32, italic, className }: { matter: Matter; size?: number; italic?: boolean; className?: string }) {
  const [bg, fg] = MATTER_SOLID[matter.color] ?? MATTER_SOLID.slate;
  return (
    <span
      aria-hidden
      className={cn("ds-title grid shrink-0 place-items-center leading-none", italic && "italic", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 11 : 8,
        background: bg,
        color: fg,
        fontSize: size >= 40 ? 28 : 18,
      }}
    >
      {matterInitial(matter)}
    </span>
  );
}

export function LawChip({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center gap-1 whitespace-nowrap rounded-[5px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-1.5 align-middle text-[11px] font-normal text-[var(--ds-muted)]",
        className
      )}
    >
      <Scale aria-hidden className="size-[11px]" />
      {children}
    </span>
  );
}

/** "Outcome letter" over "Fri 16 Oct · in 4 days" (amber when close, red when late or a legal limit). */
export function DeadlineCell({ item }: { item?: DeadlineItem }) {
  if (!item?.iso) return <span className="text-[13px] text-[var(--ds-faint)]">No deadline</span>;
  const rel = relativeDays(item.iso);
  const law = item.kind === "tribunal";
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 text-[14px] text-[var(--ds-ink)]">
        <span className="truncate">{item.title}</span>
        {item.law && <LawChip>{item.law}</LawChip>}
      </div>
      <div className="mt-px truncate text-[12.5px] text-[var(--ds-muted)]">
        {shortDay(item.iso)} ·{" "}
        <span className={cn(law || rel.tone === "late" ? "text-[var(--ds-red-fg)]" : rel.tone === "soon" ? "text-[var(--ds-amber-fg)]" : undefined)}>
          {rel.text}
        </span>
      </div>
    </div>
  );
}

export function PeopleStack({ people, size = 26, max = 3, ring = true }: { people: MatterPerson[]; size?: number; max?: number; ring?: boolean }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <Initials key={`${p.name}-${i}`} name={p.name} size={size} ring={ring} className={i > 0 ? "-ml-1.5" : undefined} title={p.name} />
      ))}
      {more > 0 && (
        <span
          className="-ml-1.5 inline-grid place-items-center rounded-full bg-[var(--ds-chip)] text-[11px] font-semibold text-[var(--ds-muted)] ring-2 ring-[var(--ds-surface)]"
          style={{ width: size, height: size }}
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/** In-app "Delete matter" confirmation; letters stay but leave the matter. */
export function DeleteMatterDialog({
  matter,
  letterCount,
  open,
  onOpenChange,
  onDeleted,
}: {
  matter: Matter;
  letterCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void;
}) {
  const deleteMatter = useDraftStore((s) => s.deleteMatter);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete matter"
      body={`Delete the matter "${matter.name}"? Its ${letterCount === 1 ? "1 letter" : `${letterCount} letters`} will stay but leave the matter. This cannot be undone.`}
      confirmLabel="Delete matter"
      destructive
      onConfirm={() => {
        deleteMatter(matter.id);
        toast(`Deleted "${matter.name}"`);
        onDeleted?.();
      }}
    />
  );
}
