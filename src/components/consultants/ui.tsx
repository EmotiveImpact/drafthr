import { useState, type ReactNode } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small presentational pieces shared by the marketplace and consultant
 * screens (experts, mk-market, mk-profile, mk-book, bookings). No data or
 * business logic here.
 */

/* ─── Tints ───────────────────────────────────────────────────────────── */

const TINTS = ["lavender", "peach", "mint", "sky", "rose", "butter"] as const;
export type Tint = (typeof TINTS)[number];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable pastel tint for a paper thumbnail, picked from an id or name. */
export function tintFor(seed: string): Tint {
  return TINTS[hash(seed) % TINTS.length];
}

export function tintVars(t: Tint): { bg: string; ink: string } {
  return { bg: `var(--ds-tint-${t})`, ink: `var(--ds-tint-${t}-ink)` };
}

/**
 * The expert's own soft tint (the card's band, the profile sheet's header,
 * the booking sheet's strip and the My bookings avatar). Stable per expert:
 * the same seed (their profile id) always gives the same tint. Cool avatar
 * tones from the tokens, as in the mocks (blue, sand, sage, lilac, rose,
 * stone).
 */
const EXPERT_TINTS = [1, 3, 5, 4, 2, 6] as const;
export function expertTint(seed: string): { bg: string; ink: string } {
  const n = EXPERT_TINTS[hash(seed || "?") % EXPERT_TINTS.length];
  return { bg: `var(--ds-av-${n})`, ink: `var(--ds-av-${n}-fg)` };
}

export function initialsOf(name: string | undefined, fallback = "?"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const out = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return out || fallback;
}

/**
 * Expert photo, falling back to initials when there is no photo or it fails
 * to load. `ring` is the avatar that sits on a tint band: a white border, a
 * faint shadow, and initials in the tint's ink on white.
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
  /** White ring, for avatars sitting on a tinted band. */
  ring?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const t = expertTint(seed || name || initials || "?");
  const box = cn(
    "shrink-0 rounded-full",
    ring && "border-[3px] border-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]",
    className,
  );
  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn(box, "bg-[var(--ds-surface-2)] object-cover")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(box, "grid place-items-center font-semibold leading-none")}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.33)),
        background: ring ? "var(--ds-surface)" : t.bg,
        color: t.ink,
      }}
    >
      {initials || initialsOf(name)}
    </span>
  );
}

/** The blue verified badge after an expert's name. */
export function VerifiedBadge({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <BadgeCheck
      role="img"
      aria-label="Checked by DraftHR"
      className={cn("shrink-0 text-[var(--ds-blue-fg)]", className)}
      style={{ width: size, height: size }}
      strokeWidth={1.8}
    />
  );
}

/** An amber filled star. */
export function AmberStar({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <Star
      aria-hidden
      className={cn("shrink-0 text-[var(--ds-amber-dot)]", className)}
      style={{ width: size, height: size }}
      fill="currentColor"
      strokeWidth={0}
    />
  );
}

/** Five read-only stars, filled up to `value`. */
export function StarRow({ value, size = 13, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-px", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          style={{ width: size, height: size }}
          className={n <= value ? "text-[var(--ds-amber-dot)]" : "text-[var(--ds-faint)]"}
          fill={n <= value ? "currentColor" : "none"}
          strokeWidth={n <= value ? 0 : 1.5}
        />
      ))}
    </span>
  );
}

/** A small drawn letter page, for letter-led rows and cards. */
export function PaperThumb({ tint, className }: { tint?: Tint; className?: string }) {
  const ink = tint ? tintVars(tint).ink : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[38px] w-[30px] shrink-0 flex-col gap-[3px] rounded-[5px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[5px] py-[6px]",
        className,
      )}
    >
      <i className="block h-[2px] w-3/5 rounded-[2px] bg-[var(--ds-line-strong)]" style={ink ? { background: ink, opacity: 0.55 } : undefined} />
      <i className="block h-[2px] rounded-[2px] bg-[var(--ds-line)]" />
      <i className="block h-[2px] rounded-[2px] bg-[var(--ds-line)]" />
      <i className="block h-[2px] rounded-[2px] bg-[var(--ds-line)]" />
      <i className="block h-[2px] w-4/5 rounded-[2px] bg-[var(--ds-line)]" />
    </span>
  );
}

/** Specialty chip on a card (12px, grey fill, 6px corners). */
export function Chip({ children, className }: { children: ReactNode; tint?: Tint; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate whitespace-nowrap rounded-[6px] bg-[var(--ds-surface-2)] px-2 py-[3px] text-[12px] leading-[16px] text-[var(--ds-body)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─── Button recipes (kit.html: near-black primary, quiet outline) ──────
 * Press is one shade darker; nothing moves or scales. */

const BTN_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] [&_svg]:shrink-0";

/** Near-black, 32px (small). Use `h-[34px]`, `h-[38px]` for the bigger sizes. */
export const BTN_PRIMARY =
  `${BTN_BASE} h-8 rounded-[8px] bg-[var(--ds-accent)] px-3 text-[13px] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]`;

export const BTN_OUTLINE =
  `${BTN_BASE} h-8 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] text-[var(--ds-ink)] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]`;

export const BTN_GHOST =
  `${BTN_BASE} h-8 rounded-[8px] px-2.5 text-[13px] text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]`;

/** The 38px page-level size (band actions, sheet footers). */
export const BTN_LG = "h-[38px] rounded-[9px] px-[14px] text-[14.5px]";

/** White field with a hairline border and a visible focus ring. */
export const FIELD =
  "w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] focus:border-[var(--ds-line-hover)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

/* ─── Row cards (bookings, inbox, admin queue) ───────────────────────── */

/** A stack of row cards, 10px apart. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2.5", className)}>{children}</div>;
}

/** One row card: hairline border, 14px corners. `attention` is the soft
 *  amber "needs you" tint; `selected` the open-in-panel state. */
export function Row({
  children,
  attention = false,
  selected = false,
  className,
  ...rest
}: {
  children: ReactNode;
  attention?: boolean;
  selected?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...rest}
      data-selected={selected || undefined}
      className={cn(
        "relative min-w-0 rounded-[14px] border px-4 py-3.5 transition-colors duration-[120ms]",
        selected
          ? "border-[var(--ds-line-hover)] bg-[var(--ds-hover)] shadow-[inset_3px_0_0_var(--ds-blue-fg)]"
          : attention
            ? "border-[var(--ds-amber-chip-bd)] bg-[var(--ds-amber-chip)]"
            : "border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-line-strong)]",
        className,
      )}
    >
      {children}
    </article>
  );
}

/** A note under a row's title: soft, quiet, optionally toned. */
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
    green: "bg-[var(--ds-green-soft)] text-[var(--ds-ink)]",
    red: "bg-[var(--ds-red-bg)] text-[var(--ds-ink)]",
    amber: "bg-[var(--ds-amber-soft)] text-[var(--ds-ink)]",
  } as const;
  const labelTone = {
    neutral: "text-[var(--ds-ink)]",
    green: "text-[var(--ds-green-fg)]",
    red: "text-[var(--ds-red-fg)]",
    amber: "text-[var(--ds-amber-fg)]",
  } as const;
  return (
    <div className={cn("rounded-[9px] px-3 py-2 text-[12.5px] leading-snug", tones[tone], className)}>
      {label && <p className={cn("m-0 mb-0.5 text-[12px] font-medium", labelTone[tone])}>{label}</p>}
      {/* Notes are typed text: keep their line breaks (a delivered review is
       * the verdict, a blank line, then the note) and break long words. */}
      <div className="whitespace-pre-line break-words">{children}</div>
    </div>
  );
}

/** A quiet line with a small leading icon (row notes in the mocks). */
export function NoteLine({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-[var(--ds-body)] [&>svg]:mt-[2px] [&>svg]:size-[13px] [&>svg]:shrink-0 [&>svg]:text-[var(--ds-subtle)]",
        className,
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Soft grey panel for loading failures and empty states. */
export function EmptyPanel({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-[16px] bg-[var(--ds-surface-2)] px-6 py-14 text-center", className)}>
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] [&>svg]:size-5">
        {icon}
      </span>
      <p className="m-0 text-[14.5px] font-medium text-[var(--ds-ink)]">{title}</p>
      {body && <p className="m-0 mt-1 max-w-[56ch] text-[13.5px] leading-relaxed text-[var(--ds-muted)]">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
