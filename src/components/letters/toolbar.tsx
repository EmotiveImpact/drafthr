/**
 * Toolbar parts for the list pages: the search field, filter chips with a
 * menu of real values, the sort menu, pagers, the floating bulk bar and the
 * quiet "no match" box.
 */
import { useEffect, useState, type ComponentType, type ReactNode, type UIEvent } from "react";
import { ArrowDownUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FilterChipTrigger, MENU_MOTION, WithReason } from "./parts";

/* ─── Search ─────────────────────────────────────────────────────────── */

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  /** md: 36px, radius 9 (letters, employees). lg: 38px, radius 10 (matters). */
  size?: "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 items-center border border-[var(--ds-line)] bg-[var(--ds-surface)] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-[var(--ds-line-strong)] focus-within:shadow-[var(--ds-focus-ring)]",
        size === "lg" ? "h-[38px] rounded-[10px]" : "h-9 rounded-[9px]",
        className
      )}
    >
      <Search aria-hidden className="pointer-events-none absolute left-3 size-[15px] text-[var(--ds-subtle)]" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent pl-9 pr-8 text-[13.5px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 grid size-6 place-items-center rounded-[6px] text-[var(--ds-subtle)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ─── Filter chip with a menu ────────────────────────────────────────── */

export type FilterOption = { value: string; label: string; count?: number };

/**
 * A filter chip (f9-letters `.fl`) opening a menu of real values. `value` is
 * the chosen option's value or null for no filter.
 */
export function FilterMenu({
  label,
  options,
  value,
  onChange,
  emptyText = "Nothing to filter by yet",
  variant = "chip",
  allLabel,
  icon: Icon,
}: {
  label: string;
  options: FilterOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  emptyText?: string;
  /** chip: dashed until set (letters). button: solid hairline with the value in ink (matters, employees). */
  variant?: "chip" | "button";
  /** Shown as the value of a "button" filter when nothing is chosen ("All", "Anyone"). */
  allLabel?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  const cue = useScrollCue();
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {variant === "chip" ? (
          <FilterChipTrigger label={label} value={chosen?.label} open={open} aria-label={chosen ? `${label}: ${chosen.label}` : `Filter by ${label.toLowerCase()}`} />
        ) : (
          <SolidFilterButton label={label} value={chosen?.label ?? allLabel ?? "All"} set={!!chosen} icon={Icon} />
        )}
      </DropdownMenuTrigger>
      {/* The whole menu shows every option when there is room; when the window is
          too short it scrolls as one and a fade with a chevron says there is more. */}
      <DropdownMenuContent ref={cue.ref} onScroll={cue.onScroll} collisionPadding={16} align="start" className={cn("w-60", MENU_MOTION)}>
        <DropdownMenuLabel className="text-[12px] font-medium text-[var(--ds-subtle)]">{label}</DropdownMenuLabel>
        {allLabel && (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <span className="flex-1 truncate">{allLabel}</span>
            {!chosen && <Check className="size-4 text-[var(--ds-ink)]" />}
          </DropdownMenuItem>
        )}
        {options.length === 0 && <div className="px-2.5 py-2 text-[13px] text-[var(--ds-subtle)]">{emptyText}</div>}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value === value ? null : o.value)}>
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className="ds-mono text-[12px] text-[var(--ds-subtle)]">{o.count}</span>}
            {o.value === value && <Check className="size-4 text-[var(--ds-ink)]" />}
          </DropdownMenuItem>
        ))}
        {chosen && !allLabel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>
              <X />
              Clear {label.toLowerCase()} filter
            </DropdownMenuItem>
          </>
        )}
        {cue.more && <ScrollCue />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Tracks whether a scrolling menu has more below what shows. `ref` measures
 * when the menu opens (and on resize); `onScroll` keeps it current.
 */
function useScrollCue() {
  const [more, setMore] = useState(false);
  const measure = (el: HTMLElement) => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  const ref = (el: HTMLDivElement | null) => {
    if (!el) return;
    const frame = requestAnimationFrame(() => measure(el));
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure(el));
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  };
  return { more, ref, onScroll: (e: UIEvent<HTMLDivElement>) => measure(e.currentTarget) };
}

/** A fade and a chevron pinned to the bottom of a menu that scrolls. */
function ScrollCue() {
  return (
    <div
      aria-hidden
      data-scroll-cue
      className="pointer-events-none sticky -bottom-1.5 -mx-1.5 -mb-1.5 -mt-10 grid h-10 place-items-end justify-center bg-gradient-to-t from-[var(--ds-surface)] from-40% to-transparent pb-1"
    >
      <ChevronDown className="size-4 text-[var(--ds-subtle)]" />
    </div>
  );
}

/** Solid filter button (matters `.fbtn`, employees `.chipf`): "Type **All**". */
export const SolidFilterButton = ({
  label,
  value,
  set,
  icon: Icon,
  chevron = true,
  ...rest
}: {
  label: string;
  value?: string;
  set?: boolean;
  icon?: ComponentType<{ className?: string }>;
  chevron?: boolean;
} & React.ComponentProps<"button">) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "inline-flex h-[38px] min-w-0 max-w-full items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-[var(--ds-line)] px-3 text-[13.5px] text-[var(--ds-body)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)]",
      set ? "bg-[var(--ds-surface-2)]" : "bg-[var(--ds-surface)]",
      rest.className
    )}
  >
    {Icon && <Icon className="size-[15px] shrink-0 text-[var(--ds-subtle)]" />}
    {label}
    {value && <b className="truncate font-medium text-[var(--ds-ink)]">{value}</b>}
    {chevron && <ChevronDown aria-hidden className="size-3.5 shrink-0 text-[var(--ds-faint)]" />}
  </button>
);

/* ─── Sort ───────────────────────────────────────────────────────────── */

export function SortMenu<K extends string>({
  options,
  value,
  onChange,
  variant = "text",
  prefix = "Sort by",
  buttonLabel = "",
}: {
  options: { value: K; label: string }[];
  value: K;
  onChange: (v: K) => void;
  /** Muted label before the value on the button variant ("Sort" on employees). */
  buttonLabel?: string;
  /** text: "Sort by Last updated" plain (letters, employees). button: hairline button (matters). */
  variant?: "text" | "button";
  prefix?: string;
}) {
  const chosen = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "button" ? (
          <SolidFilterButton label={buttonLabel} value={chosen.label} icon={ArrowUpDown} aria-label={`Sort by ${chosen.label}`} />
        ) : (
          <button
            type="button"
            aria-label={`${prefix} ${chosen.label}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2 text-[13.5px] text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)]"
          >
            <ArrowDownUp aria-hidden className="size-[14px] text-[var(--ds-subtle)]" />
            {prefix}
            <b className="font-medium text-[var(--ds-ink)]">{chosen.label}</b>
            <ChevronDown aria-hidden className="size-3.5 text-[var(--ds-faint)]" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16} align="end" className={cn("w-52", MENU_MOTION)}>
        <DropdownMenuLabel className="text-[12px] font-medium text-[var(--ds-subtle)]">Sort by</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <span className="flex-1">{o.label}</span>
            {o.value === value && <Check className="size-4 text-[var(--ds-ink)]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Pagers ─────────────────────────────────────────────────────────── */

const PG =
  "grid size-[30px] place-items-center rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-body)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-40";

/** Two arrow buttons (f9-letters `.pg`). */
export function ArrowPager({
  page,
  pages,
  onPage,
  noun = "page",
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  noun?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Previous ${noun}`} className={PG} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-[15px]" />
      </button>
      <button type="button" aria-label={`Next ${noun}`} className={PG} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight className="size-[15px]" />
      </button>
    </div>
  );
}

/** Previous, numbered pages and next (employees `.pg`). */
export function NumberPager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const nums = pageNumbers(page, Math.max(1, pages));
  return (
    <nav aria-label="Pages" className="flex items-center gap-1.5">
      <button type="button" aria-label="Previous page" className={PG} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-[15px]" />
      </button>
      {nums.map((n, i) =>
        n === -1 ? (
          <span key={`gap-${i}`} className="px-1 text-[13px] text-[var(--ds-muted)]">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            aria-label={`Page ${n + 1}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={cn(PG, "ds-mono", n === page && "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-ink)]")}
          >
            {n + 1}
          </button>
        )
      )}
      <button type="button" aria-label="Next page" className={PG} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight className="size-[15px]" />
      </button>
    </nav>
  );
}

function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out = new Set([0, pages - 1, page - 1, page, page + 1].filter((n) => n >= 0 && n < pages));
  const sorted = [...out].sort((a, b) => a - b);
  const res: number[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) res.push(-1);
    res.push(n);
  });
  return res;
}

/** Keep a page index in range as the list changes. */
export function usePage(total: number, size: number, resetKey: string) {
  const pages = Math.max(1, Math.ceil(total / size));
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const safe = Math.min(page, pages - 1);
  return { page: safe, pages, setPage };
}

/* ─── Bulk bar ───────────────────────────────────────────────────────── */

export type BulkAction = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Why it cannot be used; disables the action and shows on hover or focus. */
  disabledReason?: string | null;
};

/**
 * The floating dark bar for ticked rows (letters mock `.bulk`): "<n> selected",
 * the actions, a divider and an X that clears the selection. It sits sticky at
 * the bottom of the content so the footer stays reachable above it.
 */
export function BulkBar({ count, actions, onClear, noun = "selected" }: { count: number; actions: BulkAction[]; onClear: () => void; noun?: string }) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center md:bottom-6">
      <div
        role="toolbar"
        aria-label="Actions for selected rows"
        className="pointer-events-auto flex max-w-full animate-in items-center gap-0.5 rounded-[12px] bg-[var(--ds-ink)] py-1.5 pl-4 pr-1.5 text-[13.5px] text-[var(--ds-on-accent)] shadow-[var(--ds-shadow-l)] fade-in-0 duration-[180ms]"
      >
        <span className="ds-mono mr-2.5 whitespace-nowrap font-medium" aria-live="polite">
          {count} {noun}
        </span>
        {actions.map((a) => (
          <WithReason key={a.id} reason={a.disabledReason}>
            <button
              type="button"
              onClick={a.onClick}
              disabled={!!a.disabledReason}
              aria-label={a.label}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 py-[7px] text-[13.5px] text-[color-mix(in_srgb,var(--ds-on-accent)_90%,var(--ds-ink))] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-bar-hover)] active:bg-[var(--ds-bar-press)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:opacity-45 [--ds-bar-hover:color-mix(in_srgb,var(--ds-on-accent)_12%,transparent)] [--ds-bar-press:color-mix(in_srgb,var(--ds-on-accent)_18%,transparent)]"
            >
              <a.icon className="size-[15px] text-[color-mix(in_srgb,var(--ds-on-accent)_62%,var(--ds-ink))]" />
              <span className="hidden sm:inline">{a.label}</span>
            </button>
          </WithReason>
        ))}
        <span aria-hidden className="mx-1.5 h-5 w-px bg-[color-mix(in_srgb,var(--ds-on-accent)_18%,transparent)]" />
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="grid size-[30px] place-items-center rounded-[8px] text-[color-mix(in_srgb,var(--ds-on-accent)_62%,var(--ds-ink))] outline-none transition-colors duration-[120ms] hover:bg-[color-mix(in_srgb,var(--ds-on-accent)_12%,transparent)] hover:text-[var(--ds-on-accent)] focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── No match ───────────────────────────────────────────────────────── */

export function NoMatch({ children, onClear, clearLabel = "Clear filters" }: { children: ReactNode; onClear?: () => void; clearLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[12px] bg-[var(--ds-surface-2)] px-6 py-10 text-center text-[14px] text-[var(--ds-muted)]">
      <p className="m-0">{children}</p>
      {onClear && (
        <Button variant="outline" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
