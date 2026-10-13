import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CircleAlert, CreditCard, FilePlus2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Consultant } from "@/components/consultants/types";
import { SideSheet, SheetClose, SheetCloseButton } from "@/components/consultants/SideSheet";
import {
  AmberStar,
  BTN_LG,
  BTN_OUTLINE,
  BTN_PRIMARY,
  ExpertAvatar,
  PaperThumb,
  VerifiedBadge,
  expertTint,
} from "@/components/consultants/ui";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { LetterPicker } from "@/components/consultants/LetterPicker";
import { letterMeta, openReviewNote, useLetterFacts } from "@/components/consultants/letters";
import { APPEAL_NEEDS, NEEDS, bookExpertFromMarketplace, type BookResult } from "@/components/consultants/booking";
import { useMe } from "@/components/journey/review/actions";
import { VAT_RATE_CHARGED, bookingTotals, firstNameOf, money, turnaroundWords } from "@/components/consultants/market";
import { useDraftStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * "Book a review" (design `mk-book`, superseding `booking`): the right sheet
 * opened from "Book review" on a card. Which letter, what you need, the
 * turnaround, the price, when you pay, and a preview of the row that will
 * appear once the expert accepts. Sending creates the booking through the
 * existing flow and puts the letter into Review (booking.ts).
 *
 * A letter that has already been sent is locked, so for it the sheet books
 * help with an appeal instead ("Ask <expert>" from What's next): the expert
 * reads the letter and advises by message, and the letter stays sent.
 *
 * Only the expert's standard rate exists (profiles have one price and one
 * turnaround), so only Standard shows. No VAT is added at checkout, so the
 * total is the fee.
 */
export function BookingSheet({
  consultant,
  draftId,
  onDraftChange,
  onClose,
  onBooked,
  returnFocusTo,
}: {
  /** The expert to book; null closes the sheet. */
  consultant: Consultant | null;
  /** The letter in context ("" for none). */
  draftId: string;
  /** The person picked another letter in the sheet. */
  onDraftChange: (id: string) => void;
  onClose: () => void;
  onBooked?: (result: Extract<BookResult, { ok: true }>, consultant: Consultant) => void;
  /** The "Book review" button that opened it; focus goes back there on close. */
  returnFocusTo?: HTMLElement | null;
}) {
  const open = !!consultant;
  const [needs, setNeeds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  // Keep the last expert so the sheet does not empty while it closes.
  const [shown, setShown] = useState<Consultant | null>(consultant);
  useEffect(() => {
    if (consultant) setShown(consultant);
  }, [consultant]);

  // Reopening starts clean.
  useEffect(() => {
    if (open) {
      setNeeds([]);
      setNote("");
      setSending(false);
    }
  }, [open, consultant?.profileId]);

  const c = consultant ?? shown;
  const letter = useLetterFacts(draftId || null);
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const me = useMe();

  if (!c) return null;
  const first = firstNameOf(c.name) || "The expert";
  // A sent letter: appeal help, not a review of the letter (SEND-X35).
  const appeal = !!letter?.sent;
  const needOptions: readonly string[] = appeal ? APPEAL_NEEDS : NEEDS;
  const employeeFirst = firstNameOf(letter?.employee ?? "") || "they";
  const symbol = c.currency ?? "£";
  const totals = bookingTotals(c.price);
  const seed = c.profileId || c.name;
  const tint = expertTint(seed);
  const verified = Boolean(c.profileId) && !c.pending;

  const send = async () => {
    if (sending) return;
    setSending(true);
    const res = await bookExpertFromMarketplace({
      consultant: c,
      draft: draft ?? null,
      needs: needs.filter((n) => needOptions.includes(n)),
      note,
      asker: me,
    });
    setSending(false);
    if (!res.ok) {
      toast.error("Couldn't send your booking request. Please try again.");
      return;
    }
    onBooked?.(res, c);
    onClose();
  };

  const toggle = (n: string) => setNeeds((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n]));

  return (
    <>
      <SideSheet
        open={open}
        onOpenChange={(o) => !o && !sending && onClose()}
        onEscapeBlocked={sending}
        returnFocusTo={returnFocusTo}
        label={appeal ? "Get help with an appeal" : "Book a review"}
        description={appeal ? `Book ${c.name} to help you prepare for an appeal.` : `Book a review with ${c.name}.`}
        width={540}
        header={
          <div className="flex items-start justify-between gap-4 px-4 pt-[22px] sm:px-[26px]">
            <div className="min-w-0">
              <h2 className="ds-heading m-0 text-[28px] leading-[1.1] tracking-[-0.02em]">
                {appeal ? "Get help with an appeal" : "Book a review"}
              </h2>
              <p className="m-0 mt-[5px] text-[13.5px] text-[var(--ds-muted)]">
                {appeal
                  ? `${first} helps you prepare. The letter stays as it was sent.`
                  : "They suggest changes in the letter. You decide what to keep."}
              </p>
            </div>
            <SheetClose outlined />
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--ds-line)] px-4 py-3.5 sm:flex-nowrap sm:px-[26px]">
            <span className="mr-auto min-w-0 basis-full text-[12.5px] leading-[1.35] text-[var(--ds-subtle)] sm:basis-auto">Message {first} from My bookings</span>
            <SheetCloseButton asChild>
              <button type="button" disabled={sending} className={cn(BTN_OUTLINE, BTN_LG)}>
                Cancel
              </button>
            </SheetCloseButton>
            <button type="button" onClick={send} disabled={sending} className={cn(BTN_PRIMARY, BTN_LG)}>
              {sending ? "Sending…" : "Send booking request"}
            </button>
          </div>
        }
      >
        <div className="px-4 pb-6 sm:px-[26px]">
          {/* The expert, in their tint */}
          <div className="mt-4 flex items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ background: tint.bg }}>
            <ExpertAvatar photoUrl={c.photoUrl} name={c.name} initials={c.initials} seed={seed} size={40} ring className="border-0 text-[14px]" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-[5px] text-[14.5px] font-medium text-[var(--ds-ink)]">
                <span className="truncate">{c.name}</span>
                {verified && <VerifiedBadge size={14} />}
              </div>
              <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{c.role}</div>
            </div>
            {c.reviews > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[var(--ds-ink)]">
                <AmberStar size={13} />
                <span className="ds-mono">{c.rating.toFixed(1)}</span>
                <span className="font-normal text-[var(--ds-muted)]">({c.reviews})</span>
              </span>
            )}
          </div>

          {/* Which letter? */}
          <Q label="Which letter?">
            {letter ? (
              <div className="flex items-center gap-3 rounded-[12px] border border-[var(--ds-line)] px-3 py-2.5">
                <PaperThumb />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{letter.title}</div>
                  <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{letterMeta(letter)}</div>
                </div>
                <button type="button" onClick={() => setPicking(true)} className={cn(BTN_OUTLINE, "h-[30px] rounded-[7px] px-2.5")}>
                  Change
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-[var(--ds-line-strong)] px-3 py-2.5">
                <p className="m-0 min-w-0 flex-1 text-[13.5px] text-[var(--ds-muted)]">No letter attached.</p>
                <button type="button" onClick={() => setPicking(true)} className={cn(BTN_OUTLINE, "h-[30px] rounded-[7px] px-2.5")}>
                  Choose a letter
                </button>
                <Link to="/hr/new" className={cn(BTN_OUTLINE, "h-[30px] rounded-[7px] px-2.5")}>
                  <FilePlus2 className="size-3.5" aria-hidden />
                  New letter
                </Link>
              </div>
            )}
            {letter ? (
              <p className="m-0 mt-[7px] flex items-start gap-1.5 text-[12px] leading-[1.45] text-[var(--ds-subtle)]">
                <Lock className="mt-[2px] size-3 shrink-0" aria-hidden />
                {appeal
                  ? `This letter has been sent, so it stays locked. ${first} can read it and the files you share, and advises you by message.`
                  : `${first} can suggest and comment on this letter and the files you share. Editing pauses until it's back.`}
              </p>
            ) : null}
            {letter?.activeReview && !appeal && (
              <p className="m-0 mt-2 flex items-start gap-1.5 rounded-[9px] bg-[var(--ds-amber-soft)] px-3 py-2 text-[12.5px] leading-[1.45] text-[var(--ds-amber-fg)]">
                <CircleAlert className="mt-[2px] size-3.5 shrink-0" aria-hidden />
                {openReviewNote(letter.activeReview, "long")}
              </p>
            )}
          </Q>

          {/* What do you need? */}
          <Q label="What do you need?">
            <div className="flex flex-wrap gap-2" role="group" aria-label="What do you need?">
              {needOptions.map((n) => {
                const on = needs.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(n)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-full border pl-[9px] pr-3 text-[13px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                      on
                        ? "border-[var(--ds-ink)] bg-[var(--ds-blue-soft)] font-medium text-[var(--ds-ink)] shadow-[inset_0_0_0_0.5px_var(--ds-ink)]"
                        : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-[15px] place-items-center rounded-[4px] border-[1.5px]",
                        on ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]" : "border-[var(--ds-line-strong)]",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={2.4} />}
                    </span>
                    {n}
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="What should they look at?"
              placeholder={
                appeal
                  ? `What should ${first} help with? For example: what ${employeeFirst} might appeal on, and how to run the hearing.`
                  : `What should ${first} look at? For example: is the appeal section fair, and is anything missing?`
              }
              maxLength={3500}
              rows={2}
              className="mt-[9px] block min-h-16 w-full resize-y rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[13px] py-[11px] text-[13.5px] leading-[1.5] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] focus:border-[var(--ds-line-hover)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            />
          </Q>

          {/* Turnaround: only the standard rate exists */}
          <Q label="Turnaround">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Turnaround">
              <div
                role="radio"
                aria-checked
                tabIndex={0}
                className="flex items-start gap-2.5 rounded-[12px] border border-[var(--ds-ink)] px-[13px] py-[9px] leading-[1.4] shadow-[inset_0_0_0_0.5px_var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded-full border-[5px] border-[var(--ds-ink)]" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-[var(--ds-ink)]">Standard</div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">Back within {turnaroundWords(c.sla)}</div>
                </div>
                <span className="ds-mono ml-auto text-[13.5px] font-medium text-[var(--ds-ink)]">
                  {symbol}
                  {c.price}
                </span>
              </div>
            </div>
          </Q>

          {/* Summary */}
          <div className="mt-[17px] rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-[11px]">
            <div className="flex justify-between text-[13.5px] leading-5 text-[var(--ds-muted)]">
              <span>{appeal ? "Expert fee, standard" : "Review fee, standard"}</span>
              <b className="ds-mono font-medium text-[var(--ds-ink)]">{money(totals.fee, symbol)}</b>
            </div>
            <div className="flex justify-between text-[13.5px] leading-5 text-[var(--ds-muted)]">
              <span>{VAT_RATE_CHARGED > 0 ? `VAT at ${Math.round(VAT_RATE_CHARGED * 100)}%` : "VAT"}</span>
              <b className="font-medium text-[var(--ds-ink)]">{VAT_RATE_CHARGED > 0 ? money(totals.vat, symbol) : "Not added"}</b>
            </div>
            <div className="mt-[7px] flex items-baseline justify-between border-t border-[var(--ds-line)] pt-[7px] text-[13.5px] font-medium leading-5 text-[var(--ds-ink)]">
              <span>Total</span>
              <b className="ds-mono text-[15px] font-semibold">{money(totals.total, symbol)}</b>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2.5 text-[13px] leading-[1.45] text-[var(--ds-body)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
            <p className="m-0">
              <b className="font-medium text-[var(--ds-ink)]">You'll pay when the expert accepts.</b> Nothing is charged now. If {first} declines, the
              request closes and you pay nothing.
            </p>
          </div>

          {/* What it will look like */}
          <div data-testid="booking-preview" className="mt-4 border-t border-[var(--ds-line-2)] pt-3" aria-hidden>
            <p className="m-0 mb-2 text-[12px] text-[var(--ds-subtle)]">
              {letter && !appeal
                ? `Once ${first} accepts, the letter moves to Review and shows here too`
                : `Once ${first} accepts, it shows in My bookings like this`}
            </p>
            <div className="pointer-events-none flex select-none flex-wrap items-center gap-x-[11px] gap-y-2 rounded-[12px] border border-dashed border-[var(--ds-line-strong)] py-[9px] pl-3 pr-2.5">
              <ExpertAvatar photoUrl={c.photoUrl} name={c.name} initials={c.initials} seed={seed} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--ds-ink)]">{letter?.title ?? "Review with no letter"}</div>
                <div className="truncate text-[12px] text-[var(--ds-muted)]">
                  {c.name} · {money(totals.total, symbol)}
                </div>
              </div>
              <StatusBadge status="accepted" />
              <span className={cn(BTN_PRIMARY, "h-8 px-[11px]")}>
                <CreditCard className="size-3.5" aria-hidden />
                Pay for review
              </span>
            </div>
          </div>
        </div>
      </SideSheet>
      <LetterPicker open={picking} onOpenChange={setPicking} selectedId={draftId} onPick={(l) => onDraftChange(l.id)} />
    </>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-[17px]">
      <div className="mb-[7px] text-[13px] font-medium leading-[18px] text-[var(--ds-ink)]">{label}</div>
      {children}
    </div>
  );
}
