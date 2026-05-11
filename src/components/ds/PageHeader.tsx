import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  href?: string;
};

/**
 * Canonical page header — replaces the per-route hand-rolled
 * "back button + eyebrow + heading + lede" stacks.
 *
 * Layout: breadcrumb → serif title → optional lede, with an actions slot
 * on the right (one solid CTA, anything else outline/ghost).
 */
export function PageHeader({
  crumbs = [],
  title,
  lede,
  actions,
  serif = true,
  className,
}: {
  crumbs?: Crumb[];
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  /** @deprecated kept for backward-compat — no longer renders an X close button. */
  closeTo?: string;
  /** Render the title in Source Serif 4 (display). Set false for compact pages. */
  serif?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      <Breadcrumbs crumbs={crumbs} />
      <div className="flex items-start justify-between gap-6 mt-3 flex-wrap">
        <div className="min-w-0">
          <h1
            className={cn(
              "m-0 text-[var(--ds-ink)]",
              serif
                ? "font-[600] text-[32px] leading-[1.08] tracking-[-0.012em]"
                : "font-semibold text-[24px] leading-[1.2]"
            )}
            style={serif ? { fontFamily: "var(--font-serif)" } : undefined}
          >
            {title}
          </h1>
          {lede && (
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--ds-body)] max-w-[60ch]">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav className="flex items-center gap-2 text-[12px] text-[var(--ds-muted)]">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-2 min-w-0">
          {c.href ? (
            <Link to={c.href} className="hover:text-[var(--ds-ink)] truncate">
              {c.label}
            </Link>
          ) : (
            <span
              className={cn(
                "truncate",
                i === crumbs.length - 1 && "text-[var(--ds-ink)] font-medium"
              )}
            >
              {c.label}
            </span>
          )}
          {i < crumbs.length - 1 && (
            <ChevronRight className="size-3 text-[var(--ds-subtle)]" />
          )}
        </span>
      ))}
    </nav>
  );
}
