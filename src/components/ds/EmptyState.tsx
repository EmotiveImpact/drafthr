import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Shared empty-state surface for "no drafts / no comments / no exports /
 * no activity / no deadlines" panels.
 *
 *   • Iconed circle backdrop (slate ring) so the icon has visual weight
 *   • Heading (15–16px medium)
 *   • Supporting copy (12–13px muted, max ~52ch)
 *   • Optional primary CTA (Link or button) and secondary action
 *
 * Use:
 *   <EmptyState
 *     icon={FilePlus}
 *     title="No drafts yet"
 *     body="Pick a letter type to start your first draft."
 *     primary={{ label: "Browse letters", to: "/hr/new" }}
 *   />
 */
export type EmptyStateAction =
  | { label: string; to: string; onClick?: never }
  | { label: string; onClick: () => void; to?: never };

export function EmptyState({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  /** "sm" for inline panel slots, "md" for full route surfaces. */
  size?: "sm" | "md";
  className?: string;
}) {
  const iconBox = size === "sm" ? "size-10" : "size-14";
  const iconSize = size === "sm" ? "size-4" : "size-5";
  const padY = size === "sm" ? "py-8" : "py-14";

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center px-6",
        padY,
        className
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-full bg-[var(--ds-line-2)] border border-[var(--ds-line)] text-[var(--ds-muted)] mb-4",
          iconBox
        )}
      >
        <Icon className={iconSize} />
      </div>
      <h3 className="text-[15px] font-medium text-[var(--ds-ink)] m-0">
        {title}
      </h3>
      {body && (
        <p className="mt-1.5 text-[13px] text-[var(--ds-muted)] m-0 max-w-[52ch] leading-relaxed">
          {body}
        </p>
      )}
      {(primary || secondary) && (
        <div className="mt-5 flex items-center gap-2">
          {primary && <ActionButton action={primary} variant="primary" />}
          {secondary && <ActionButton action={secondary} variant="ghost" />}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "primary" | "ghost";
}) {
  const cls =
    variant === "primary"
      ? "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-[var(--ds-accent)] text-[var(--ds-on-accent)] text-[12.5px] font-medium hover:opacity-90 transition"
      : "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md border border-[var(--ds-line)] text-[var(--ds-body)] text-[12.5px] font-medium hover:bg-[var(--ds-line-2)] transition";

  if (action.to) {
    return (
      <Link to={action.to} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}
