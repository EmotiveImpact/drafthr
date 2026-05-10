import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "red" | "amber" | "green" | "blue";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-[var(--ds-muted)]",
  red: "bg-[var(--ds-red-fg)]",
  amber: "bg-[var(--ds-amber-fg)]",
  green: "bg-[var(--ds-green-fg)]",
  blue: "bg-[var(--ds-blue-fg)]",
};

const TONE_FG: Record<StatusTone, string> = {
  neutral: "text-[var(--ds-body)]",
  red: "text-[var(--ds-red-fg)]",
  amber: "text-[var(--ds-amber-fg)]",
  green: "text-[var(--ds-green-fg)]",
  blue: "text-[var(--ds-blue-fg)]",
};

/**
 * Inline status indicator: a 8px coloured dot + label. Used in tables,
 * row meta, and dashboard stat cards. Replaces ad-hoc coloured badges
 * for status (badges are reserved for category labels).
 */
export function StatusDot({
  tone,
  children,
  size = "md",
  inheritColor = false,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  size?: "sm" | "md";
  inheritColor?: boolean;
  className?: string;
}) {
  const dim = size === "sm" ? "size-1.5" : "size-2";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 leading-none",
        inheritColor ? TONE_FG[tone] : "text-[var(--ds-body)]",
        size === "sm" ? "text-[12px]" : "text-[14px]",
        className
      )}
    >
      <span className={cn("rounded-full shrink-0", dim, TONE[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}
