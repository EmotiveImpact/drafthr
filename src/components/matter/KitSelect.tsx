import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Radix Select cannot hold an empty value, so "nothing chosen" travels as this. */
const NONE = "__none__";

export type KitOption = { value: string; label: string };

/**
 * The kit select (rounded trigger, kit chevron, floating menu) for the matter
 * forms, with the plain `value` / `onChange` of a native select. An empty
 * string means "nothing chosen" and shows `emptyLabel` as the first option.
 */
export function KitSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  ariaLabel,
  compact,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: KitOption[];
  /** Label for the empty choice, listed first ("Not set", "No time"). */
  emptyLabel?: string;
  ariaLabel?: string;
  /** 36px tall and 14px text, to sit beside the compact inputs and date picker. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <Select value={value === "" ? NONE : value} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("w-full min-w-0", compact && "text-[14px] data-[size=default]:h-9", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-[min(var(--radix-select-content-available-height),32rem)] min-w-[var(--radix-select-trigger-width)]">
        {emptyLabel != null && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
