import { useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { type Booking, type BookingMessage } from "@/lib/bookings";
import { pushBookingMessage } from "@/lib/marketplaceSync";

/**
 * Per-booking chat thread. Same component used by:
 *   - ConsultantInbox (perspective: 'consultant' — sends as the consultant)
 *   - MyBookings (perspective: 'requester' — sends as HR)
 *
 * Shows only the accepted server thread. Failed sends retain the text for retry.
 */
export function BookingThread({
  booking,
  perspective,
}: {
  booking: Booking;
  perspective: "requester" | "consultant";
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const messageRef = useRef<{ text: string; id: string } | null>(null);
  const messages = booking.messages ?? [];

  // The other party gets the "From them" treatment.
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    if (messageRef.current?.text !== text) messageRef.current = { text, id: crypto.randomUUID() };
    let ok: boolean;
    try {
      ok = await pushBookingMessage(booking.id, perspective, text, messageRef.current.id);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    if (ok) { setDraft(""); messageRef.current = null; }
  };

  return (
    <details className="mt-3 group rounded-md border border-[var(--ds-line)] open:bg-[var(--ds-surface-2)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="size-3.5" aria-hidden />
          Thread {messages.length > 0 && <span className="font-normal">({messages.length})</span>}
        </span>
        <span aria-hidden className="text-[14px] text-[var(--ds-muted)] group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3">
        {messages.length === 0 ? (
          <p className="py-3 text-center text-[12px] italic text-[var(--ds-muted)]">
            No messages yet — say hello.
          </p>
        ) : (
          <ul className="space-y-2 py-2">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                mine={m.from === perspective}
              />
            ))}
          </ul>
        )}
        <form onSubmit={onSubmit} className="mt-2 flex gap-2">
          <input
            type="text"
            disabled={sending}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              perspective === "consultant"
                ? "Reply to HR..."
                : "Reply to the consultant..."
            }
            aria-label="Message"
            maxLength={4000}
            className="flex-1 h-9 rounded-[6px] border border-[var(--ds-line)] bg-white px-3 text-[12.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            <Send className="size-3.5" aria-hidden />
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </details>
  );
}

function MessageBubble({ msg, mine }: { msg: BookingMessage; mine: boolean }) {
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-[8px] px-3 py-2 text-[12.5px] leading-snug ${
          mine
            ? "bg-[var(--ds-ink)] text-white"
            : "bg-white border border-[var(--ds-line)] text-[var(--ds-ink)]"
        }`}
      >
        <p>{msg.text}</p>
        <p className={`mt-1 text-[10.5px] ${mine ? "text-white/60" : "text-[var(--ds-muted)]"}`}>
          {new Date(msg.ts).toLocaleString()}
        </p>
      </div>
    </li>
  );
}
