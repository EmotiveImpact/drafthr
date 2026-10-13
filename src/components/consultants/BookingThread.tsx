import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, FileText, MessageSquare, X } from "lucide-react";
import { useBookingsStore, type Booking, type BookingMessage } from "@/lib/bookings";
import { pushBookingMessage } from "@/lib/marketplaceSync";
import { useProfileStore } from "@/lib/profile";
import { SideSheet } from "@/components/consultants/SideSheet";
import { BTN_GHOST, ExpertAvatar } from "@/components/consultants/ui";
import { clock, firstNameOf, shortDate } from "@/components/consultants/market";
import { cn } from "@/lib/utils";

/**
 * A booking's message thread (design `bookings`, `.th`). One panel, used:
 *   - inline on My bookings at desktop width (the 360px column on the right)
 *   - as a full-screen sheet on phones, and from the consultant inbox's
 *     "Messages" button (BookingThread below).
 *
 * The booking's real events (requested, accepted, delivered, completed) sit
 * between the messages as centred grey lines, in time order. Your messages
 * are right-aligned grey bubbles; theirs are plain text. Enter sends,
 * Shift+Enter makes a new line, 4000 characters at most.
 *
 * Local-first: writes to useBookingsStore and mirrors to the server; if the
 * server refuses, the optimistic bubble is removed again.
 */
export function BookingThreadPanel({
  booking,
  perspective,
  otherName,
  otherRole,
  otherPhotoUrl,
  otherSeed,
  letterTitle,
  letterHref,
  onClose,
  closeButton,
  footerExtra,
  className,
}: {
  booking: Booking;
  perspective: "requester" | "consultant";
  /** The other party: the expert (requester side) or the HR person who
   *  booked, "HR" when the server did not name them (consultant side). */
  otherName: string;
  otherRole?: string;
  otherPhotoUrl?: string;
  otherSeed?: string;
  letterTitle?: string;
  /** Opens the letter, when it is on this device. */
  letterHref?: string;
  /** Inline panel: closes it. */
  onClose?: () => void;
  /** Sheet: its own close button (a Radix Close). */
  closeButton?: ReactNode;
  /** Under the composer (for example "Raise a dispute"). */
  footerExtra?: ReactNode;
  className?: string;
}) {
  const appendMessage = useBookingsStore((s) => s.appendMessage);
  const myName = useProfileStore((s) => s.profile.personal?.preferredName || s.profile.personal?.legalName || "You");
  const [draft, setDraft] = useState("");
  const messages = booking.messages ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Newest message in view on open and whenever one arrives.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [booking.id, messages.length]);

  // A prefilled message (Raise a dispute) lands in the box, ready to edit.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const d = (e as CustomEvent<{ bookingId: string; text: string }>).detail;
      if (d?.bookingId !== booking.id) return;
      setDraft(d.text);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("drafthr:thread-prefill", onPrefill);
    return () => window.removeEventListener("drafthr:thread-prefill", onPrefill);
  }, [booking.id]);

  const items = useMemo(() => threadItems(booking, perspective), [booking, perspective]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Optimistic: append locally for instant feedback. Keep the minted id so
    // a failure removes exactly THIS bubble — a whole-thread snapshot restore
    // would clobber a second message sent while this one was in flight, and
    // would race the failure path's re-pull (server truth must win).
    const optimisticId = appendMessage(booking.id, perspective, text);
    setDraft("");
    // Dual-write: mirror to the server. On failure the sync layer already
    // toasts and re-pulls; remove the optimistic bubble so the UI stops
    // claiming a message was delivered that the other side never received.
    const ok = await pushBookingMessage(booking.id, perspective, text);
    if (!ok && optimisticId) {
      useBookingsStore.setState((state) => ({
        bookings: state.bookings.map((b) =>
          b.id === booking.id ? { ...b, messages: (b.messages ?? []).filter((m) => m.id !== optimisticId) } : b,
        ),
      }));
    }
  };

  const first = firstNameOf(otherName) || otherName;

  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-col bg-[var(--ds-surface)]", className)}>
      <div className="border-b border-[var(--ds-line-2)] px-5 pb-3.5 pt-[18px]">
        <div className="flex items-center gap-2.5">
          <ExpertAvatar photoUrl={otherPhotoUrl} name={otherName} seed={otherSeed || otherName} size={32} className="text-[11.5px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-medium leading-[1.3] text-[var(--ds-ink)]">{otherName}</div>
            {otherRole && <div className="mt-px truncate text-[12.5px] leading-[1.3] text-[var(--ds-muted)]">{otherRole}</div>}
          </div>
          {closeButton ??
            (onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            ))}
        </div>
        {letterTitle &&
          (letterHref ? (
            <Link
              to={letterHref}
              className="mt-3 inline-flex max-w-full items-center gap-[7px] rounded-[8px] bg-[var(--ds-surface-2)] px-2.5 py-[5px] text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <FileText className="size-[13px] shrink-0 text-[var(--ds-muted)]" aria-hidden />
              <span className="truncate">{letterTitle}</span>
            </Link>
          ) : (
            <span className="mt-3 inline-flex max-w-full items-center gap-[7px] rounded-[8px] bg-[var(--ds-surface-2)] px-2.5 py-[5px] text-[12.5px] text-[var(--ds-ink)]">
              <FileText className="size-[13px] shrink-0 text-[var(--ds-muted)]" aria-hidden />
              <span className="truncate">{letterTitle}</span>
            </span>
          ))}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0" aria-label="Messages">
          {items.map((it) =>
            it.kind === "event" ? (
              <li key={it.key} className="flex items-center gap-2 text-[12px] text-[var(--ds-subtle)]">
                <span aria-hidden className="h-px flex-1 bg-[var(--ds-line-2)]" />
                <span className="shrink-0">{it.label}</span>
                <span aria-hidden className="h-px flex-1 bg-[var(--ds-line-2)]" />
              </li>
            ) : (
              <MessageItem
                key={it.key}
                msg={it.msg}
                mine={it.msg.from === perspective}
                myName={myName}
                theirName={otherName}
              />
            ),
          )}
        </ul>
        {messages.length === 0 && !booking.message?.trim() && (
          <p className="m-0 mt-6 text-center text-[13px] text-[var(--ds-muted)]">No messages yet. Say hello.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 px-4 pb-4 pt-1">
        <div className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pb-2.5 pl-3.5 pr-3 pt-3 shadow-[var(--ds-shadow-s)] transition-colors duration-[120ms] focus-within:border-[var(--ds-line-strong)]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Message ${first}`}
            aria-label="Message"
            maxLength={4000}
            rows={2}
            className="block max-h-[132px] min-h-[44px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[22px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-[var(--ds-subtle)]">Enter to send, Shift and Enter for a new line</span>
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] disabled:opacity-30 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        {footerExtra}
      </form>
    </div>
  );
}

type ThreadItem =
  | { kind: "event"; key: string; ts: number; label: string }
  | { kind: "msg"; key: string; ts: number; msg: BookingMessage };

/** "14:20" today, "10 Oct, 14:20" before. */
function when(ts: number): string {
  const d = new Date(ts);
  const n = new Date();
  const today = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return today ? clock(ts) : `${shortDate(ts)}, ${clock(ts)}`;
}

/** The booking's real events and its messages, in time order. */
function threadItems(b: Booking, perspective: "requester" | "consultant"): ThreadItem[] {
  const out: ThreadItem[] = [];
  const ev = (key: string, ts: number | undefined, label: string) => {
    if (ts) out.push({ kind: "event", key, ts, label: `${label} · ${when(ts)}` });
  };
  ev("booked", b.bookedAt, "Booking requested");
  // The request itself is the first thing HR said.
  if (b.message?.trim()) out.push({ kind: "msg", key: "request", ts: b.bookedAt, msg: { id: "request", from: "requester", text: b.message.trim(), ts: b.bookedAt } });
  ev("accepted", b.acceptedAt, "Accepted");
  ev("delivered", b.deliveredAt, "Delivered");
  // The expert sees who closed it: the HR person by name when the server
  // sent it ("Completed by Ruth Adeyemi"), else "the HR team".
  ev("completed", b.completedAt, perspective === "requester" ? "Completed" : `Completed by ${b.requesterName?.trim() || "the HR team"}`);
  for (const m of b.messages ?? []) out.push({ kind: "msg", key: m.id, ts: m.ts, msg: m });
  // Time order; at the same moment keep the order above (requested, then
  // the request, then accepted, and so on).
  return out.map((it, i) => ({ it, i })).sort((a, b2) => a.it.ts - b2.it.ts || a.i - b2.i).map((x) => x.it);
}

function MessageItem({ msg, mine, myName, theirName }: { msg: BookingMessage; mine: boolean; myName: string; theirName: string }) {
  return (
    <li className={cn("flex flex-col", mine ? "max-w-[86%] items-end self-end" : "items-start")}>
      <div className={cn("mb-1 text-[12px] text-[var(--ds-subtle)]", mine && "text-right")}>
        {mine ? myName : <b className="font-medium text-[var(--ds-ink)]">{theirName}</b>} · {when(msg.ts)}
      </div>
      <div
        className={cn(
          "whitespace-pre-wrap text-[13.5px] leading-[1.5] [overflow-wrap:anywhere]",
          mine ? "rounded-[12px] bg-[var(--ds-surface-2)] px-3 py-[9px] text-[var(--ds-ink)]" : "text-[var(--ds-body)]",
        )}
      >
        {msg.text}
      </div>
    </li>
  );
}

/**
 * The "Messages" button and its sheet, for rows that have no inline panel
 * (the consultant inbox). The thread is the same panel as on My bookings.
 */
export function BookingThread({
  booking,
  perspective,
  title,
  subtitle,
  testId,
}: {
  booking: Booking;
  perspective: "requester" | "consultant";
  /** The other party's name. */
  title?: string;
  /** The letter or matter title. */
  subtitle?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = booking.messages?.length ?? 0;
  const other =
    title?.trim() ||
    (perspective === "consultant" ? booking.requesterName?.trim() || "HR" : booking.consultantName?.trim() || "Specialist");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_GHOST} data-testid={testId}>
        <MessageSquare className="size-3.5" aria-hidden />
        Messages
        {count > 0 && <span className="ds-mono text-[11.5px] text-[var(--ds-subtle)]">{count}</span>}
      </button>
      <SideSheet open={open} onOpenChange={setOpen} label={`Messages with ${other}`} width={440}>
        <BookingThreadPanel
          booking={booking}
          perspective={perspective}
          otherName={other}
          otherSeed={perspective === "consultant" ? "hr" : booking.consultantProfileId}
          letterTitle={subtitle}
          onClose={() => setOpen(false)}
          className="h-full"
        />
      </SideSheet>
    </>
  );
}
