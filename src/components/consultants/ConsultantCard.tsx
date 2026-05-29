import { ArrowRight, Star } from "lucide-react";
import type { Consultant } from "@/components/editor/review/ConsultTab";
import { cn } from "@/lib/utils";

/**
 * Marketplace consultant card. Matches the DraftHR card recipe
 * (rounded-[14px], --ds-line border, --ds-surface) and button/tag
 * recipes used across the app.
 *
 * A consultant with a `profileId` is a real, server-backed listing and
 * gets a "Live" badge; the 14 hardcoded seed consultants get no badge
 * (they're examples, surfaced honestly by the disclaimer on the index).
 */
export function ConsultantCard({
  consultant: c,
  onBook,
}: {
  consultant: Consultant;
  onBook: () => void;
}) {
  const isLive = Boolean(c.profileId);
  const currency = c.currency ?? "£";

  return (
    <div
      className={cn(
        "relative bg-[var(--ds-surface)] rounded-[14px] flex flex-col gap-2.5 p-5 transition",
        "shadow-[0_1px_2px_rgba(10,11,13,0.04)] hover:shadow-[0_12px_30px_-16px_rgba(10,11,13,0.18)] hover:-translate-y-px",
        c.top
          ? "border-2 border-[var(--ds-ink)]"
          : "border border-[var(--ds-line)]",
      )}
    >
      {/* TOP MATCH ribbon */}
      {c.top && (
        <span className="absolute -top-2.5 left-5 bg-[var(--ds-ink)] text-white text-[9.5px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full">
          ★ Top match
        </span>
      )}

      {/* Photo */}
      <img
        src={c.photoUrl}
        alt=""
        className={cn(
          "size-16 rounded-full object-cover self-center border-[3px] border-white shadow",
          c.top ? "mt-1" : "mt-3.5",
        )}
      />

      {/* Name + role + rating */}
      <div className="text-center">
        <div className="text-[14px] font-semibold text-[var(--ds-ink)]">{c.name}</div>
        <div className="text-[11px] text-[var(--ds-muted)] mt-0.5">{c.role}</div>
        <div className="text-[11px] text-[var(--ds-amber-fg)] mt-1 font-semibold">
          <Star className="size-2.5 inline -mt-0.5 mr-0.5" fill="currentColor" strokeWidth={0} />
          {c.rating.toFixed(1)}{" "}
          <span className="text-[var(--ds-muted)] font-normal">({c.reviews})</span>
        </div>
      </div>

      {/* Specialty quote */}
      <div
        className={cn(
          "text-[11.5px] text-[var(--ds-body)] px-3 py-2 bg-[var(--ds-canvas)] rounded-[8px] leading-snug flex-1",
          c.top && "border-l-2 border-[var(--ds-ink)]",
        )}
      >
        "{c.specialty}"
      </div>

      {/* Specialty tags */}
      {c.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.specialties.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-[var(--ds-line)] bg-white text-[var(--ds-body)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Price + SLA + live status */}
      <div className="flex items-center justify-between pt-2.5 border-t border-[var(--ds-line)]">
        <div>
          <div className="text-[15px] font-semibold text-[var(--ds-ink)]">
            {currency}{c.price}
          </div>
          <div className="text-[10.5px] text-[var(--ds-muted)]">{c.sla} SLA</div>
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ds-green-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ds-green-fg)]">
            <span className="size-1.5 rounded-full bg-[var(--ds-green-fg)]" aria-hidden />
            Live
          </span>
        ) : (
          <span className="text-[10.5px] font-medium text-[var(--ds-subtle)]">Example</span>
        )}
      </div>

      {/* Book CTA */}
      <button
        type="button"
        onClick={onBook}
        className={cn(
          "w-full h-[40px] rounded-[9px] text-[13px] font-semibold transition flex items-center justify-center gap-1.5",
          c.top
            ? "bg-[var(--ds-ink)] text-white shadow-sm hover:-translate-y-px hover:shadow-md"
            : "bg-white text-[var(--ds-ink)] border border-[var(--ds-line)] hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]",
        )}
      >
        Book {c.name.split(" ")[0]}
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
