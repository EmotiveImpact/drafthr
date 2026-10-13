/**
 * Small shared parts for the list pages (Letters, Matters, Employees, Bulk,
 * the matter and employee pages): the drawn paper icon, initials avatars,
 * tick boxes, filter chips, menus that fade, a disabled-with-reason wrapper
 * and helpers to download a file or set the document title.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColor, avatarInitials, avatarInk } from "@/components/ds";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { shortOrgName } from "@/components/AppSidebar";
import { tintStyle, type Tint } from "./letterView";

/* ─── Menus ──────────────────────────────────────────────────────────── */

/**
 * Extra classes for DropdownMenuContent: menus fade and rise about 4px in
 * 180ms and close faster; with reduced motion they only fade.
 */
export const MENU_MOTION =
  "duration-[160ms] data-[state=closed]:duration-[110ms] motion-reduce:data-[side=bottom]:slide-in-from-top-0 motion-reduce:data-[side=top]:slide-in-from-bottom-0 motion-reduce:data-[side=left]:slide-in-from-right-0 motion-reduce:data-[side=right]:slide-in-from-left-0";

/* ─── Paper icon ─────────────────────────────────────────────────────── */

/**
 * The stacked paper drawing from the letters list (f9-letters `.pic`): a
 * white front sheet with a dog-ear, a type mark and faint lines, over a grey
 * back sheet tilted behind it.
 */
export function PaperIcon({ tint, className }: { tint: Tint; className?: string }) {
  return (
    <span aria-hidden data-slot="paper-icon" className={cn("relative mr-0.5 block h-[44px] w-[36px] shrink-0", className)} style={tintStyle(tint)}>
      <span className="absolute inset-y-0 left-0 right-1 translate-x-[5px] -translate-y-[3px] rotate-[4deg] rounded-[4px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface-2)]" />
      <span className="absolute inset-y-0 left-0 right-1 flex flex-col gap-[3px] overflow-hidden rounded-[4px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-[5px] pt-[7px] shadow-[var(--ds-shadow-s)]">
        <span className="mb-0.5 size-[7px] shrink-0 rounded-[1.5px] bg-[var(--tint-ink)] opacity-90" />
        {[100, 100, 80, 100, 64].map((w, i) => (
          <i key={i} className="block h-[1.5px] shrink-0 rounded-[1px] bg-[var(--ds-line-strong)]" style={{ width: `${w}%` }} />
        ))}
        <span className="absolute -right-px -top-px size-[9px] rounded-bl-[2px] bg-[linear-gradient(225deg,var(--ds-surface)_50%,var(--ds-line)_50%)]" />
      </span>
    </span>
  );
}

/** Flat paper (employee page letters, 34 by 42): a page with faint lines and the type mark. */
export function FlatPaper({ tint, className }: { tint: Tint; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[42px] w-[34px] shrink-0 flex-col gap-[3px] rounded-[5px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-1.5 pt-[7px] shadow-[var(--ds-shadow-s)]",
        className
      )}
      style={tintStyle(tint)}
    >
      <span className="mb-px size-[6px] rounded-[1.5px] bg-[var(--tint-ink)] opacity-90" />
      <i className="block h-0.5 w-[60%] rounded-sm bg-[var(--ds-line-strong)]" />
      <i className="block h-0.5 w-full rounded-sm bg-[var(--ds-line)]" />
      <i className="block h-0.5 w-full rounded-sm bg-[var(--ds-line)]" />
      <i className="block h-0.5 w-[70%] rounded-sm bg-[var(--ds-line)]" />
    </span>
  );
}

/**
 * The letter art tile from the matter page (shell.mjs `artTile` paper): a
 * pastel panel with a tilted sheet that lifts a little on hover.
 */
export function PaperArt({ tint, height = 132, className }: { tint: Tint; height?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden rounded-[11px] bg-[var(--tint)]", className)}
      style={{ ...tintStyle(tint), height }}
    >
      <span className="absolute bottom-[-26px] left-1/2 flex h-[128px] w-[112px] -translate-x-1/2 rotate-[-2.5deg] flex-col gap-[5px] rounded-[3px] bg-[var(--ds-surface)] px-[13px] pt-4 shadow-[var(--ds-shadow-m)] transition-transform duration-200 group-hover/tile:-translate-y-[5px] group-hover/tile:rotate-[-1deg] motion-reduce:transition-none">
        <span className="absolute right-0 top-0 size-4 rounded-bl-[2px] bg-[linear-gradient(225deg,var(--tint)_50%,var(--ds-line)_50%)]" />
        <span className="mb-[3px] size-[9px] rounded-[2px] bg-[var(--tint-ink)] opacity-85" />
        <span className="mb-[3px] block h-1 w-[58%] rounded-[2px] bg-[var(--ds-ink)] opacity-50" />
        {[94, 100, 82, 0, 100, 90, 64].map((w, i) =>
          w ? (
            <i key={i} className="block h-1 rounded-[2px] bg-[var(--ds-line)]" style={{ width: `${w}%` }} />
          ) : (
            <b key={i} className="block h-1" />
          )
        )}
      </span>
    </div>
  );
}

/* ─── Avatars ────────────────────────────────────────────────────────── */

/** Initials in a soft tint picked from the seed, at any size. */
export function Initials({
  name,
  seed,
  size = 28,
  className,
  title,
  ring,
}: {
  name: string;
  seed?: string;
  size?: number;
  className?: string;
  title?: string;
  /** White ring for stacks. */
  ring?: boolean;
}) {
  const s = seed ?? name;
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none",
        ring && "ring-2 ring-[var(--ds-surface)]",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.39 * 2) / 2,
        background: avatarColor(s),
        color: avatarInk(s),
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}

/* ─── Tick box ───────────────────────────────────────────────────────── */

/** 16px tick box (letters mock `.cb`): grey ring, near-black with a tick when on, a minus when mixed. */
export function TickBox({
  checked,
  onChange,
  label,
  className,
  size = 16,
}: {
  checked: boolean | "mixed";
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
  size?: number;
}) {
  const on = checked === true || checked === "mixed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-tick
      onClick={(e) => {
        e.stopPropagation();
        onChange(checked !== true);
      }}
      className={cn(
        "relative z-[1] grid shrink-0 place-items-center rounded-[4.5px] border-[1.5px] outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
        on
          ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
          : "border-[var(--ds-line-hover)] bg-[var(--ds-surface)] hover:border-[var(--ds-faint)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      {checked === "mixed" ? (
        <Minus className="size-[11px]" strokeWidth={2.6} aria-hidden />
      ) : checked ? (
        <Check className="size-3" strokeWidth={2.4} aria-hidden />
      ) : null}
    </button>
  );
}

/* ─── Filter chip ────────────────────────────────────────────────────── */

/**
 * Filter chip trigger (f9-letters `.fl`): dashed and muted at rest, solid
 * with a light fill and the value in ink once set.
 */
export const FilterChipTrigger = ({
  label,
  value,
  open,
  ...rest
}: { label: string; value?: string; open?: boolean } & React.ComponentProps<"button">) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] border pl-3 pr-2.5 text-[13.5px] text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
      value
        ? "border-solid border-[var(--ds-line)] bg-[var(--ds-surface-2)] hover:bg-[var(--ds-surface-3)]"
        : "border-dashed border-[var(--ds-line-strong)] bg-[var(--ds-surface)] hover:bg-[var(--ds-surface-2)]",
      open && "bg-[var(--ds-surface-2)]",
      rest.className
    )}
  >
    {label}
    {value && <b className="max-w-[120px] truncate font-medium text-[var(--ds-ink)]">{value}</b>}
    <ChevronDown aria-hidden className="size-3.5 shrink-0 text-[var(--ds-faint)]" />
  </button>
);

/* ─── Disabled with a reason ─────────────────────────────────────────── */

/** Wrap a disabled control so its reason shows on hover and keyboard focus. */
export function WithReason({ reason, children, className }: { reason?: string | null; children: ReactNode; className?: string }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={reason} className={cn("inline-flex rounded-[9px] outline-none focus-visible:shadow-[var(--ds-focus-ring)]", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/* ─── Files ──────────────────────────────────────────────────────────── */

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** One CSV line, quoting where needed. */
export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const v = c == null ? "" : String(c);
      return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(",");
}

export function todayStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ─── Workspace name ─────────────────────────────────────────────────── */

/** The workspace or company name as the sidebar shows it ("Harbour Foods"). */
export function useOrgName(): string {
  const { activeTenant } = useAuth();
  const legal = useProfileStore((s) => s.profile.employer.legalName);
  return shortOrgName(activeTenant?.name || legal?.trim() || "Your workspace");
}

/* ─── Document title ─────────────────────────────────────────────────── */

/**
 * Set "<title> · DraftHR". Runs after the layout's own per-route title so
 * the page's name wins.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const t = window.setTimeout(() => {
      document.title = `${title} · DraftHR`;
    }, 0);
    return () => window.clearTimeout(t);
  }, [title]);
}

/* ─── Sliding underline ──────────────────────────────────────────────── */

/** Measure the selected tab so the underline can slide to it. */
export function useIndicator<T extends HTMLElement>(activeKey: string) {
  const listRef = useRef<T>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!el) return setBox(null);
      setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [activeKey]);
  return { listRef, box };
}
