import { cn } from "@/lib/utils";

const PALETTE = [
  "var(--ds-av-1)",
  "var(--ds-av-2)",
  "var(--ds-av-3)",
  "var(--ds-av-4)",
  "var(--ds-av-5)",
  "var(--ds-av-6)",
  "var(--ds-av-7)",
  "var(--ds-av-8)",
];

const SIZES = {
  sm: { px: 20, font: 9 },
  md: { px: 24, font: 10 },
  lg: { px: 28, font: 11 },
  xl: { px: 32, font: 12 },
} as const;

export type AvatarSize = keyof typeof SIZES;

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

export function avatarColor(seed: string): string {
  return PALETTE[hashHue(seed)];
}

export function avatarInitials(name: string | undefined, fallback?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  return "?";
}

/**
 * Single source of truth for avatars. One palette, one size scale, one
 * radius (full circle), one font. Anywhere you need an avatar, use this.
 */
export function Avatar({
  seed,
  initials,
  name,
  email,
  size = "lg",
  className,
  title,
}: {
  /** Stable string used to pick a colour. Usually email or id. */
  seed?: string;
  /** Pre-computed initials. If omitted, derived from name + email. */
  initials?: string;
  name?: string;
  email?: string;
  size?: AvatarSize;
  className?: string;
  title?: string;
}) {
  const dims = SIZES[size];
  const computedSeed = seed ?? email ?? name ?? "?";
  const computedInitials = initials ?? avatarInitials(name, email);
  return (
    <span
      title={title}
      className={cn(
        "inline-grid place-items-center rounded-full font-semibold leading-none shrink-0",
        className
      )}
      style={{
        width: dims.px,
        height: dims.px,
        fontSize: dims.font,
        background: avatarColor(computedSeed),
        color: "var(--ds-av-fg)",
      }}
    >
      {computedInitials}
    </span>
  );
}

/**
 * Overlapped avatar stack with `+N` overflow chip. Used in editor topbars
 * and collaborator rows.
 */
export function AvatarStack({
  people,
  max = 3,
  size = "lg",
}: {
  people: Array<{ seed?: string; name?: string; email?: string; initials?: string; title?: string }>;
  max?: number;
  size?: AvatarSize;
}) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  const dims = SIZES[size];
  return (
    <div className="inline-flex items-center">
      {visible.map((p, i) => (
        <Avatar
          key={p.seed ?? p.email ?? p.name ?? i}
          seed={p.seed}
          name={p.name}
          email={p.email}
          initials={p.initials}
          title={p.title ?? p.name}
          size={size}
          className={cn(
            "ring-2 ring-[var(--ds-surface)]",
            i > 0 && "-ml-2"
          )}
        />
      ))}
      {overflow > 0 && (
        <span
          className="inline-grid place-items-center rounded-full bg-[var(--ds-line)] text-[var(--ds-body)] font-semibold leading-none -ml-2 ring-2 ring-[var(--ds-surface)]"
          style={{ width: dims.px, height: dims.px, fontSize: dims.font }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
