import { ArrowRight, Star } from "lucide-react";
import type { Consultant } from "@/components/editor/review/ConsultTab";
import { cn } from "@/lib/utils";

/** Prominent consultant card for the marketplace canvas. */
export function ConsultantCard({
  consultant: c,
  onBook,
}: {
  consultant: Consultant;
  onBook: () => void;
}) {
  return (
    <div
      className={cn(
        "relative bg-[var(--ds-surface)] rounded-xl flex flex-col gap-2 p-3.5",
        c.top
          ? "border-2 border-[var(--ds-ink)]"
          : "border border-[var(--ds-line)]",
      )}
    >
      {/* TOP MATCH ribbon */}
      {c.top && (
        <span className="absolute -top-2.5 left-3.5 bg-[var(--ds-ink)] text-white text-[9.5px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded">
          ★ Top match
        </span>
      )}

      {/* Photo */}
      <img
        src={c.photoUrl}
        alt={c.name}
        className={cn(
          "size-16 rounded-full object-cover self-center border-[3px] border-white shadow",
          c.top ? "mt-1" : "mt-3.5",
        )}
      />

      {/* Name + role + rating */}
      <div className="text-center">
        <div className="text-[13.5px] font-bold text-[var(--ds-ink)]">{c.name}</div>
        <div className="text-[10.5px] text-[var(--ds-muted)] mt-0.5">{c.role}</div>
        <div className="text-[10.5px] text-[var(--ds-amber-fg,#d97706)] mt-0.5 font-semibold">
          <Star className="size-2.5 inline -mt-0.5 mr-0.5" fill="currentColor" strokeWidth={0} />
          {c.rating.toFixed(1)}{" "}
          <span className="text-[var(--ds-muted)] font-normal">({c.reviews})</span>
        </div>
      </div>

      {/* Specialty quote */}
      <div
        className={cn(
          "text-[10.5px] text-[var(--ds-body,var(--ds-ink))] px-2 py-2 bg-[var(--ds-canvas)] rounded-md leading-snug flex-1",
          c.top && "border-l-2 border-[var(--ds-violet-fg,#7c3aed)]",
        )}
      >
        "{c.specialty}"
      </div>

      {/* Specialty tags */}
      {c.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.specialties.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ds-line-2)] text-[var(--ds-muted)] uppercase tracking-wide"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Price + SLA + online status */}
      <div className="flex items-center justify-between pt-1.5 border-t border-[var(--ds-line-2)]">
        <div>
          <div className="text-[14px] font-bold text-[var(--ds-ink)]">£{c.price}</div>
          <div className="text-[10px] text-[var(--ds-muted)]">{c.sla} SLA</div>
        </div>
        <div
          className={cn(
            "text-[10px] font-semibold",
            c.top || c.initials === "RS"
              ? "text-[var(--ds-green-fg)]"
              : "text-[var(--ds-muted)]",
          )}
        >
          {c.top || c.initials === "RS" ? "● Online now" : "● Last seen 2h ago"}
        </div>
      </div>

      {/* Book CTA */}
      <button
        type="button"
        onClick={onBook}
        className={cn(
          "w-full py-2 rounded-md text-[12px] font-bold transition flex items-center justify-center gap-1.5",
          c.top
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        Book {c.name.split(" ")[0]}
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
