import { Check, CircleAlert, CircleCheck } from "lucide-react";
import type { Consultant } from "@/components/consultants/types";
import { SideSheet, SheetClose, SheetCloseButton } from "@/components/consultants/SideSheet";
import { AvailabilityBadge } from "@/components/consultants/ConsultantCard";
import { AmberStar, BTN_LG, BTN_OUTLINE, BTN_PRIMARY, ExpertAvatar, VerifiedBadge, expertTint } from "@/components/consultants/ui";
import {
  availabilityPill,
  canMeet,
  firstNameOf,
  shortDay,
  turnaroundShort,
  turnaroundWords,
} from "@/components/consultants/market";
import { cn } from "@/lib/utils";

/**
 * An expert's profile (design `mk-profile`), opened from "Profile" on a card
 * while choosing a reviewer for a letter. Everything shown is the expert's
 * real listing: stats, about, what they check (their specialties), prices,
 * and whether they can have it back by the letter's deadline. Location,
 * "letters reviewed", "clients come back" and written review quotes are not
 * in the listing, so they are not shown.
 */
export function ProfileSheet({
  consultant: c,
  dueMs,
  onClose,
  onChoose,
  chooseDisabledReason,
  returnFocusTo,
}: {
  consultant: Consultant | null;
  dueMs: number | null;
  onClose: () => void;
  onChoose: (c: Consultant) => void;
  chooseDisabledReason?: string;
  /** The "Profile" button that opened it; focus goes back there on close. */
  returnFocusTo?: HTMLElement | null;
}) {
  const open = !!c;
  return (
    <SideSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      returnFocusTo={returnFocusTo}
      label={c ? `${c.name}'s profile` : "Profile"}
      width={560}
      footer={c ? <Footer c={c} dueMs={dueMs} onChoose={onChoose} disabledReason={chooseDisabledReason} /> : null}
    >
      {c && <Body c={c} dueMs={dueMs} />}
    </SideSheet>
  );
}

function Body({ c, dueMs }: { c: Consultant; dueMs: number | null }) {
  const seed = c.profileId || c.name;
  const tint = expertTint(seed);
  const verified = Boolean(c.profileId) && !c.pending;
  const first = firstNameOf(c.name);
  const stats: { big: React.ReactNode; small: string }[] = [];
  if (c.reviews > 0)
    stats.push({
      big: (
        <>
          <AmberStar size={14} />
          <span className="ds-mono">{c.rating.toFixed(1)}</span>
        </>
      ),
      small: `${c.reviews} review${c.reviews === 1 ? "" : "s"}`,
    });
  else stats.push({ big: "New", small: "no reviews yet" });
  stats.push({ big: <span className="ds-mono">{turnaroundShort(c.sla)}</span>, small: "usual turnaround" });

  return (
    <>
      <div className="relative h-[92px] shrink-0" style={{ background: tint.bg }}>
        <AvailabilityBadge pill={availabilityPill(c, dueMs)} className="absolute left-[22px] top-[18px] max-w-[calc(100%-100px)]" />
        <SheetClose className="absolute right-4 top-4" />
        <ExpertAvatar
          photoUrl={c.photoUrl}
          name={c.name}
          initials={c.initials}
          seed={seed}
          size={64}
          ring
          className="absolute -bottom-[30px] left-[22px] text-[20px]"
        />
      </div>
      <div className="px-6 pb-6 pt-10">
        <h2 className="ds-heading m-0 flex min-w-0 items-center gap-2 text-[28px] leading-[1.1] tracking-[-0.02em]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span>
          {verified && <VerifiedBadge size={18} />}
        </h2>
        <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-[var(--ds-muted)]">
          {[c.role, verified ? "Checked by DraftHR" : null].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: Math.max(2, stats.length) }}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-[10px] bg-[var(--ds-surface-2)] px-[11px] py-[9px]">
              <b className="flex items-center gap-1 text-[15px] font-semibold text-[var(--ds-ink)]">{s.big}</b>
              <span className="text-[12px] text-[var(--ds-muted)]">{s.small}</span>
            </div>
          ))}
        </div>

        {c.bio?.trim() && (
          <Section title="About">
            <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-[var(--ds-body)]">{c.bio.trim()}</p>
          </Section>
        )}

        {c.specialties.length > 0 && (
          <Section title={`What ${first || "they"} checks`}>
            <ul className="m-0 grid list-none grid-cols-1 gap-x-3.5 gap-y-1.5 p-0 sm:grid-cols-2">
              {c.specialties.map((s) => (
                <li key={s} className="flex items-center gap-[7px] text-[13.5px] text-[var(--ds-ink)]">
                  <Check className="size-3.5 shrink-0 text-[var(--ds-green-fg)]" strokeWidth={2} aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
            {c.specialty?.trim() && (
              <p className="m-0 mt-2 text-[13px] leading-[1.5] text-[var(--ds-muted)]">{c.specialty.trim()}</p>
            )}
          </Section>
        )}

        <Section title="Recent reviews">
          <p className="m-0 text-[13px] text-[var(--ds-muted)]">No written reviews yet.</p>
        </Section>

        <Section title="Price">
          <div data-testid="profile-price" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--ds-line)] px-3 py-[9px] text-[13px] text-[var(--ds-muted)]">
              <span>Standard, {turnaroundWords(c.sla)}</span>
              <b className="ds-mono text-[14px] font-semibold text-[var(--ds-ink)]">
                {c.currency ?? "£"}
                {c.price}
              </b>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="m-0 mb-[7px] text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--ds-subtle)]">{title}</h3>
      {children}
    </section>
  );
}

function Footer({
  c,
  dueMs,
  onChoose,
  disabledReason,
}: {
  c: Consultant;
  dueMs: number | null;
  onChoose: (c: Consultant) => void;
  disabledReason?: string;
}) {
  const ok = canMeet(c, dueMs);
  const first = firstNameOf(c.name);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--ds-line)] px-6 py-3.5">
      {dueMs != null && (
        <span
          className={cn(
            "mr-auto inline-flex min-w-0 items-center gap-1.5 text-[12.5px]",
            ok ? "text-[var(--ds-green-fg)]" : "text-[var(--ds-amber-fg)]",
          )}
        >
          {ok ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0" aria-hidden />}
          {ok ? `Can have it back by ${shortDay(dueMs)}` : `Can't have it back by ${shortDay(dueMs)}`}
        </span>
      )}
      <SheetCloseButton asChild>
        <button type="button" className={cn(BTN_OUTLINE, BTN_LG)}>
          Close
        </button>
      </SheetCloseButton>
      <button
        type="button"
        onClick={disabledReason ? undefined : () => onChoose(c)}
        aria-disabled={disabledReason ? true : undefined}
        title={disabledReason}
        className={cn(BTN_PRIMARY, BTN_LG, disabledReason && "cursor-not-allowed")}
      >
        Choose {first}
      </button>
    </div>
  );
}
