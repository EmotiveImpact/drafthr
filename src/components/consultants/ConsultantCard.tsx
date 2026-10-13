import { Clock } from "lucide-react";
import type { Consultant } from "@/components/consultants/types";
import {
  AmberStar,
  BTN_OUTLINE,
  BTN_PRIMARY,
  Chip,
  ExpertAvatar,
  VerifiedBadge,
  expertTint,
} from "@/components/consultants/ui";
import { availabilityPill, turnaroundWords, type AvailabilityPill } from "@/components/consultants/market";
import { cn } from "@/lib/utils";

/**
 * The expert card (design `experts` / `mk-market` `.xc`): a 58px tint band
 * edge to edge with the availability pill, a 52px avatar overlapping it, the
 * serif name with the verified badge, credentials, specialty chips, rating,
 * and a footer with the price per review, the turnaround and the action.
 *
 *   mode "book"     Book review (the sidebar's Experts page)
 *   mode "choose"   Profile and Choose (choosing a reviewer for a letter)
 *   mode "preview"  inert (the consultant's own form shows it live)
 *
 * The same expert always gets the same tint (seeded by their profile id).
 */
export function ConsultantCard({
  consultant: c,
  onBook,
  onProfile,
  onChoose,
  mode = "book",
  preview = false,
  dueMs = null,
  picked = false,
  disabledReason,
  profileButtonRef,
  bookButtonRef,
}: {
  consultant: Consultant;
  /** Called with the button pressed, so a sheet can hand focus back to it. */
  onBook?: (opener: HTMLButtonElement) => void;
  onProfile?: (opener: HTMLButtonElement) => void;
  onChoose?: () => void;
  mode?: "book" | "choose" | "preview";
  /** @deprecated use mode="preview" */
  preview?: boolean;
  /** Letter mode: the deadline, so anyone who can't make it is flagged. */
  dueMs?: number | null;
  /** The card whose profile sheet is open. */
  picked?: boolean;
  /** Booking or choosing is not allowed here (viewer, consultant mode). */
  disabledReason?: string;
  profileButtonRef?: (el: HTMLButtonElement | null) => void;
  bookButtonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const inert = preview || mode === "preview";
  const verified = Boolean(c.profileId) && !c.pending;
  const currency = c.currency ?? "£";
  const seed = c.profileId || c.name || c.initials;
  const tint = expertTint(seed);
  const pill = availabilityPill(c, dueMs);

  return (
    <article
      data-expert-id={c.profileId}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[16px] border bg-[var(--ds-surface)] transition-colors duration-[120ms]",
        picked
          ? "border-[var(--ds-ink)] shadow-[inset_0_0_0_1px_var(--ds-ink)]"
          : "border-[var(--ds-line)] hover:border-[var(--ds-line-hover)]",
      )}
    >
      {/* Tint band with the availability pill; the avatar overlaps its foot. */}
      <div className="relative flex h-[58px] shrink-0 items-start justify-end px-3.5 py-3" style={{ background: tint.bg }}>
        <ExpertAvatar
          photoUrl={c.photoUrl}
          name={c.name}
          initials={c.initials}
          seed={seed}
          size={52}
          ring
          className="absolute left-[18px] top-6 text-[17px]"
        />
        <AvailabilityBadge pill={pill} />
      </div>

      <div className="min-w-0 flex-1 px-[18px] pt-7">
        <h3 className="m-0 flex min-w-0 items-center gap-1.5 font-[family-name:var(--font-title)] text-[21px] font-normal leading-[1.25] tracking-[-0.015em] text-[var(--ds-ink)]">
          <span className="min-w-0 truncate">{c.name}</span>
          {verified && <VerifiedBadge size={15} />}
        </h3>
        <p className="m-0 mt-[3px] line-clamp-2 text-[13px] leading-[1.4] text-[var(--ds-muted)]">{c.role}</p>
        {c.specialties.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {c.specialties.slice(0, 3).map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
            {c.specialties.length > 3 && (
              <Chip className="text-[var(--ds-muted)]">+{c.specialties.length - 3}</Chip>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-[var(--ds-subtle)]">
          {c.reviews > 0 ? (
            <>
              <span
                role="img"
                aria-label={`Rated ${c.rating.toFixed(1)} from ${c.reviews} reviews`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--ds-ink)]"
              >
                <AmberStar size={13} />
                <span className="ds-mono">{c.rating.toFixed(1)}</span>
              </span>
              <span>
                {c.reviews} review{c.reviews === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <span>No reviews yet</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--ds-line-2)] py-3 pl-[18px] pr-3.5">
        <div className="min-w-0">
          <div className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)]">
            <span className="ds-mono">
              {currency}
              {c.price}
            </span>
            <span className="text-[12.5px] font-normal text-[var(--ds-muted)]"> per review</span>
          </div>
          <div className="mt-0.5 flex items-center gap-[5px] text-[12px] text-[var(--ds-muted)]">
            <Clock className="size-3" aria-hidden />
            Back within {turnaroundWords(c.sla)}
          </div>
        </div>
        {mode === "choose" ? (
          <div className="flex gap-1.5">
            <button
              ref={profileButtonRef}
              type="button"
              onClick={(e) => onProfile?.(e.currentTarget)}
              aria-label={`${c.name}'s profile`}
              className={cn(BTN_OUTLINE, "h-[34px] text-[13.5px] max-sm:h-10")}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={disabledReason ? undefined : onChoose}
              aria-disabled={disabledReason ? true : undefined}
              title={disabledReason}
              aria-label={`Choose ${c.name}`}
              className={cn(BTN_PRIMARY, "h-[34px] text-[13.5px] max-sm:h-10", disabledReason && "cursor-not-allowed")}
            >
              Choose
            </button>
          </div>
        ) : (
          <button
            ref={bookButtonRef}
            type="button"
            onClick={inert || disabledReason ? undefined : (e) => onBook?.(e.currentTarget)}
            aria-disabled={inert || disabledReason ? true : undefined}
            tabIndex={inert ? -1 : undefined}
            title={disabledReason}
            aria-label={`Book a review with ${c.name}`}
            className={cn(
              BTN_OUTLINE,
              "h-[34px] text-[13.5px] max-sm:h-10",
              inert && "pointer-events-none",
              disabledReason && "cursor-not-allowed",
            )}
          >
            Book review
          </button>
        )}
      </div>
    </article>
  );
}

/** The small white availability pill on a tint band. Always one line: it
 *  keeps clear of the avatar (52px, 18px in) and, if a narrow card still
 *  cannot fit the words, ends in an ellipsis with the full text as its title. */
export function AvailabilityBadge({ pill, className }: { pill: AvailabilityPill; className?: string }) {
  return (
    <span
      title={pill.label}
      className={cn(
        "relative inline-flex min-w-0 max-w-[calc(100%-62px)] items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-[var(--ds-surface)] px-[9px] py-[3px] text-[12px] font-medium leading-[16px]",
        pill.tone === "live" && "text-[var(--ds-green-fg)]",
        pill.tone === "quiet" && "text-[var(--ds-muted)]",
        (pill.tone === "late" || pill.tone === "pending") && "text-[var(--ds-amber-fg)]",
        className,
      )}
    >
      {pill.tone === "live" && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--ds-green-solid)]" />}
      <span className="min-w-0 truncate">{pill.label}</span>
    </span>
  );
}
