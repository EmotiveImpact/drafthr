import { ChevronDown, CircleCheck, Info, Landmark, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LawCard } from "./lawCard";

/**
 * The law card on the right of the new letter page (mock `.law`): hairline,
 * 16px corners, a landmark kicker, a Newsreader heading, why it matters and
 * the rule rows. On phones it starts collapsed to its heading.
 */
export function LawCardView({ card, className }: { card: LawCard; className?: string }) {
  const body = (
    <>
      <h3 className="ds-title m-0 mt-2.5 text-[22px] leading-[1.15] tracking-[-0.015em]">{card.heading}</h3>
      <p className="m-0 mt-2 text-[13.5px] leading-normal text-[var(--ds-muted)]">{card.intro}</p>
      {card.rows.length > 0 && (
        <ul className="m-0 mt-3.5 flex list-none flex-col p-0" data-testid="law-rules">
          {card.rows.map((r) => {
            const Icon = r.state === "met" ? CircleCheck : r.state === "add" ? TriangleAlert : Info;
            return (
              <li
                key={r.id}
                data-rule-state={r.state}
                title={r.description}
                className="flex gap-2.5 border-t border-[var(--ds-line-2)] py-2.5 text-[13.5px] leading-[1.4] text-[var(--ds-ink)]"
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-[15px] shrink-0",
                    r.state === "met"
                      ? "text-[var(--ds-green-fg)]"
                      : r.state === "add"
                        ? "text-[var(--ds-amber-fg)]"
                        : "text-[var(--ds-blue-fg)]"
                  )}
                />
                <div className="min-w-0">
                  {r.label}
                  <small className="mt-0.5 block text-[12.5px] text-[var(--ds-muted)]">{r.note}</small>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {card.footnote && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--ds-line-2)] pt-3 text-[12.5px] text-[var(--ds-muted)]">
          <Info aria-hidden className="size-[13px] shrink-0" />
          {card.footnote}
        </div>
      )}
    </>
  );

  const kicker = (
    <span className="flex items-center gap-2 text-[12px] font-medium text-[var(--ds-muted)]">
      <Landmark aria-hidden className="size-3.5" />
      {card.kicker}
    </span>
  );

  return (
    <>
      {/* Desktop: the full card. */}
      <section
        aria-label={card.kicker}
        data-testid="law-card"
        className={cn("hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 xl:block", className)}
      >
        {kicker}
        {body}
      </section>
      {/* Narrower screens: collapsed to its heading. */}
      <details className="group rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-4 xl:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            {kicker}
            <span className="mt-1 block text-[14px] font-medium text-[var(--ds-ink)]">
              {card.rows.length > 0
                ? `${card.rows.length} ${card.rows.length === 1 ? "point" : "points"} this letter must cover`
                : "No specific legal steps"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-[var(--ds-subtle)] transition-transform duration-[180ms] group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="pb-1">{body}</div>
      </details>
    </>
  );
}
