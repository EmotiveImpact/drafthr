import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small presentational pieces shared by the marketplace and consultant
 * screens (design options 6B, 13B and 7B). No data or business logic here.
 */

const TINTS = ["lavender", "peach", "mint", "sky", "rose", "butter"] as const;
export type Tint = (typeof TINTS)[number];

/** Stable pastel tint for an expert, picked from their id or name. */
export function tintFor(seed: string): Tint {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

export function tintVars(t: Tint): { bg: string; ink: string } {
  return { bg: `var(--ds-tint-${t})`, ink: `var(--ds-tint-${t}-ink)` };
}

export function initialsOf(name: string | undefined, fallback = "?"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const out = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return out || fallback;
}

/**
 * Expert photo, falling back to initials on a pastel tint when there is no
 * photo or it fails to load.
 */
export function ExpertAvatar({
  photoUrl,
  name,
  initials,
  seed,
  size = 40,
  ring = false,
  className,
}: {
  photoUrl?: string | null;
  name?: string;
  initials?: string;
  seed?: string;
  size?: number;
  /** White ring, for avatars sitting on a tinted card top. */
  ring?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const t = tintVars(tintFor(seed || name || initials || "?"));
  const box = cn(
    "shrink-0 rounded-full",
    ring && "ring-4 ring-[var(--ds-surface)]/70 shadow-[var(--ds-shadow-m)]",
    className,
  );
  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn(box, "object-cover bg-[var(--ds-surface-2)]")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(box, "grid place-items-center font-medium tracking-[0.02em]")}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        background: ring ? "var(--ds-surface)" : t.bg,
        color: t.ink,
      }}
    >
      {initials || initialsOf(name)}
    </span>
  );
}

/** 13B paper thumbnail: a small drawn letter page, for letter-led rows. */
export function PaperThumb({ tint = "sky", className }: { tint?: Tint; className?: string }) {
  const { ink } = tintVars(tint);
  return (
    <span aria-hidden className={cn("relative block h-10 w-8 shrink-0", className)}>
      <span className="absolute inset-0 translate-x-[4px] -translate-y-[3px] rotate-[4deg] rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)]" />
      <span className="absolute inset-0 flex flex-col gap-[3px] overflow-hidden rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-[5px] pt-[7px] shadow-[var(--ds-shadow-s)]">
        <span className="mb-px block size-[6px] rounded-[1.5px]" style={{ background: ink }} />
        <span className="block h-[2px] w-full rounded-[1px] bg-[var(--ds-line-strong)]" />
        <span className="block h-[2px] w-full rounded-[1px] bg-[var(--ds-line)]" />
        <span className="block h-[2px] w-4/5 rounded-[1px] bg-[var(--ds-line)]" />
        <span className="block h-[2px] w-full rounded-[1px] bg-[var(--ds-line)]" />
      </span>
    </span>
  );
}

/** Small pill used for tags and meta facts on cards and rows. */
export function Chip({
  children,
  tint,
  className,
}: {
  children: ReactNode;
  tint?: Tint;
  className?: string;
}) {
  const t = tint ? tintVars(tint) : null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[var(--ds-r-s)] px-[7px] text-[11.5px] font-medium",
        !t && "bg-[var(--ds-chip)] text-[var(--ds-body)]",
        className,
      )}
      style={t ? { background: t.bg, color: t.ink } : undefined}
    >
      {children}
    </span>
  );
}

/* ─── Button recipes (Harvey: near-black primary, quiet outline) ─────── */

export const BTN_PRIMARY =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)] focus-visible:ring-offset-2";

export const BTN_OUTLINE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[12.5px] font-medium text-[var(--ds-ink)] transition hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-surface-2)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)] focus-visible:ring-offset-2";

export const BTN_GHOST =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--ds-r-s)] px-2.5 text-[12.5px] font-medium text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]";

/** White field on a soft card, matching the 3A box focus treatment. */
export const FIELD =
  "w-full rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] transition focus:border-[var(--ds-line-strong)] focus:shadow-[var(--ds-shadow-s)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]/25";

/** 13B-style list: rows separated by inset hairlines, soft hover. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col [&>*+*]:before:absolute [&>*+*]:before:inset-x-3.5 [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-[var(--ds-line)] [&>*+*]:before:content-['']",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One 13B row. `attention` tints the row like the prototype's waiting letter. */
export function Row({
  children,
  attention = false,
  className,
  ...rest
}: {
  children: ReactNode;
  attention?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...rest}
      className={cn(
        "relative rounded-[var(--ds-r-m)] px-3.5 py-3.5 transition-colors",
        attention ? "bg-[var(--ds-amber-bg)]/55 before:!border-transparent [&+*]:before:!border-transparent" : "hover:bg-[var(--ds-surface-2)]/70",
        className,
      )}
    >
      {children}
    </article>
  );
}

/** A note set under a row's title: soft, quiet, optionally toned. */
export function RowNote({
  children,
  tone = "neutral",
  label,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber";
  label?: string;
  className?: string;
}) {
  const tones = {
    neutral: "bg-[var(--ds-surface-2)] text-[var(--ds-body)]",
    green: "bg-[var(--ds-green-bg)] text-[var(--ds-ink)]",
    red: "bg-[var(--ds-red-bg)] text-[var(--ds-ink)]",
    amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-ink)]",
  } as const;
  const labelTone = {
    neutral: "text-[var(--ds-ink)]",
    green: "text-[var(--ds-green-fg)]",
    red: "text-[var(--ds-red-fg)]",
    amber: "text-[var(--ds-amber-fg)]",
  } as const;
  return (
    <div className={cn("rounded-[var(--ds-r-s)] px-3 py-2 text-[12.5px] leading-snug", tones[tone], className)}>
      {label && <p className={cn("mb-0.5 text-[11.5px] font-medium", labelTone[tone])}>{label}</p>}
      {children}
    </div>
  );
}
