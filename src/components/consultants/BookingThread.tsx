import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageSquare } from "lucide-react";
import { useBookingsStore, type Booking, type BookingMessage } from "@/lib/bookings";
import { pushBookingMessage } from "@/lib/marketplaceSync";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { BTN_GHOST } from "@/components/consultants/ui";
import { cn } from "@/lib/utils";

/**
 * Per-booking chat thread. Same component used by:
 *   - ConsultantInbox (perspective: 'consultant' — sends as the consultant)
 *   - MyBookings (perspective: 'requester' — sends as HR)
 *
 * Renders a "Messages" button on the booking row; the thread opens in a
 * 14B-style side panel with the 3A composer at the bottom.
 *
 * Local-first: writes to useBookingsStore and mirrors to the server.
 */
export function BookingThread({
  booking,
  perspective,
  title,
  subtitle,
}: {
  booking: Booking;
  perspective: "requester" | "consultant";
  /** Panel heading, e.g. the other party's name or the letter title. */
  title?: string;
  subtitle?: string;
}) {
  const appendMessage = useBookingsStore((s) => s.appendMessage);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const messages = booking.messages ?? [];
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length]);

  // The other party gets the "From them" treatment.
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
    // Dual-write: mirror to the server. On success, the server returns
    // the canonical thread which replaces our local copy (picking up
    // anything the other party sent in the meantime). On failure the sync
    // layer already toasts + re-pulls; remove the optimistic bubble so the
    // UI stops claiming a message was delivered that the counterpart (who
    // only sees the server thread) never received.
    const ok = await pushBookingMessage(booking.id, perspective, text);
    if (!ok && optimisticId) {
      useBookingsStore.setState((state) => ({
        bookings: state.bookings.map((b) =>
          b.id === booking.id
            ? { ...b, messages: (b.messages ?? []).filter((m) => m.id !== optimisticId) }
            : b,
        ),
      }));
    }
  };

  const otherParty = perspective === "consultant" ? "HR" : "Specialist";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className={BTN_GHOST}>
          <MessageSquare className="size-3.5" aria-hidden />
          Messages
          {messages.length > 0 && (
            <span className="ds-mono text-[11.5px] text-[var(--ds-faint)]">{messages.length}</span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 text-[var(--ds-ink)] shadow-[var(--ds-shadow-l)] sm:max-w-[440px]"
      >
        <SheetHeader className="gap-1 border-b border-[var(--ds-line)] px-5 pb-4 pt-5 text-left">
          <SheetTitle className="pr-8 text-[15px] font-medium leading-snug text-[var(--ds-ink)]">
            {title ?? "Messages"}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ds-muted)]">
              <StatusBadge status={booking.status} />
              {subtitle && <span className="min-w-0 truncate">{subtitle}</span>}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center">
              <p className="m-0 text-center text-[13px] text-[var(--ds-muted)]">
                No messages yet. Say hello.
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} mine={m.from === perspective} theirLabel={otherParty} />
              ))}
            </ul>
          )}
          <div ref={endRef} />
        </div>

        {/* 3A composer: soft box, text area, dark square send button */}
        <form onSubmit={onSubmit} className="px-4 pb-4 pt-1">
          <div className="flex flex-col gap-2 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3.5 pb-2.5 pt-3 transition focus-within:border-[var(--ds-line-strong)] focus-within:shadow-[var(--ds-shadow-s)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                perspective === "consultant"
                  ? "Reply to HR..."
                  : "Reply to the consultant..."
              }
              aria-label="Message"
              maxLength={4000}
              rows={2}
              className="block max-h-[132px] min-h-[44px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[22px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)] focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--ds-faint)]">Enter to send</span>
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send"
                className="grid size-8 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)] disabled:opacity-30"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({
  msg,
  mine,
  theirLabel,
}: {
  msg: BookingMessage;
  mine: boolean;
  theirLabel: string;
}) {
  return (
    <li className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-[var(--ds-r-m)] px-3 py-2 text-[13.5px] leading-snug",
          mine
            ? "bg-[var(--ds-surface-3)] text-[var(--ds-ink)]"
            : "border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)]",
        )}
      >
        {msg.text}
      </div>
      <p className="m-0 px-1 text-[11px] text-[var(--ds-muted)]">
        {mine ? "You" : theirLabel}, {new Date(msg.ts).toLocaleString()}
      </p>
    </li>
  );
}
