import { Clock, Star } from "lucide-react";
import type { Consultant } from "@/components/consultants/types";
import { BTN_OUTLINE, BTN_PRIMARY, Chip, ExpertAvatar, tintFor, tintVars } from "@/components/consultants/ui";
import { cn } from "@/lib/utils";

/**
 * Marketplace consultant card, design option 6B: a white card with a
 * pastel top holding the photo or initials, then name, title, rate,
 * turnaround, rating and "Book a review".
 *
 * A consultant with a `profileId` is a real, server-backed listing and
 * gets a "Live" badge. The signed-in consultant's own unpublished card
 * shows "Pending review" instead.
 *
 * `preview` renders the card inert (the consultant profile form shows it
 * as a live preview of what HR teams will see).
 */
export function ConsultantCard({
  consultant: c,
  onBook,
  preview = false,
}: {
  consultant: Consultant;
  onBook: () => void;
  preview?: boolean;
}) {
  const isLive = Boolean(c.profileId) && !c.pending;
  const currency = c.currency ?? "£";
  const tint = tintFor(c.profileId || c.name || c.initials);
  const { bg, ink } = tintVars(tint);

  return (
    <article
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border bg-[var(--ds-surface)] transition duration-200",
        "hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]",
        c.top ? "border-[var(--ds-ink)]" : "border-[var(--ds-line)]",
      )}
    >
      {/* Tinted top with the photo or initials */}
      <div
        className="relative mx-1.5 mt-1.5 grid h-[128px] place-items-center overflow-hidden rounded-[calc(var(--ds-r-l)-5px)]"
        style={{ background: bg }}
      >
        <ExpertAvatar
          photoUrl={c.photoUrl}
          name={c.name}
          initials={c.initials}
          seed={c.profileId || c.name}
          size={76}
          ring
          className="transition-transform duration-200 group-hover:-translate-y-1"
        />
        <span className="absolute left-2.5 top-2.5">
          {c.top ? (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-[var(--ds-accent)] px-2 text-[11px] font-medium text-[var(--ds-on-accent)]">
              <Star className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
              Top match
            </span>
          ) : isLive ? (
            <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[var(--ds-surface)]/85 px-2 text-[11px] font-medium text-[var(--ds-green-fg)]">
              <span className="size-1.5 rounded-full bg-[var(--ds-green-fg)]" aria-hidden />
              Live
            </span>
          ) : c.pending ? (
            <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--ds-surface)]/85 px-2 text-[11px] font-medium text-[var(--ds-amber-fg)]">
              Pending review
            </span>
          ) : (
            <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--ds-surface)]/85 px-2 text-[11px] font-medium text-[var(--ds-muted)]">
              Example
            </span>
          )}
        </span>
        <span
          className="absolute right-2.5 top-2.5 inline-flex h-[22px] items-center gap-1 rounded-full bg-[var(--ds-surface)]/85 px-2 text-[11.5px] font-medium"
          style={{ color: ink }}
          aria-label={`Rated ${c.rating.toFixed(1)} from ${c.reviews} reviews`}
        >
          <Star className="size-3 text-[var(--ds-amber-dot)]" fill="currentColor" strokeWidth={0} aria-hidden />
          <span className="ds-mono text-[var(--ds-ink)]">{c.rating.toFixed(1)}</span>
          <span className="text-[var(--ds-muted)]">({c.reviews})</span>
        </span>
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 pb-4 pt-3.5">
        <h3 className="m-0 truncate text-[14px] font-medium text-[var(--ds-ink)]">{c.name}</h3>
        <p className="m-0 truncate text-[12.5px] text-[var(--ds-muted)]">{c.role}</p>
        {c.specialty && (
          <p className="m-0 mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--ds-body)]">
            {c.specialty}
          </p>
        )}

        {c.specialties.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {c.specialties.map((tag, i) => (
              <Chip key={tag} tint={i === 0 ? tint : undefined}>
                {tag}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <div className="min-w-0">
            <div className="ds-mono text-[15px] font-medium leading-none text-[var(--ds-ink)]">
              {currency}
              {c.price}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-[var(--ds-muted)]">
              <Clock className="size-3" aria-hidden />
              {c.sla} turnaround
            </div>
          </div>
          <button
            type="button"
            onClick={preview ? undefined : onBook}
            aria-disabled={preview || undefined}
            tabIndex={preview ? -1 : undefined}
            aria-label={`Book a review with ${c.name}`}
            className={cn(c.top ? BTN_PRIMARY : BTN_OUTLINE, "h-9 px-3.5", preview && "pointer-events-none")}
          >
            Book a review
          </button>
        </div>
      </div>
    </article>
  );
}
