import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Bell,
  Check,
  CornerUpLeft,
  Eye,
  MessageSquare,
  MessageSquareReply,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ds/Avatar";
import { Pill } from "@/components/ds/Pill";
import { ExpertAvatar } from "@/components/consultants/ui";
import { PersonCard, CheckList, CheckRow, type PersonTimelineItem } from "@/components/journey/ui";
import type { Booking } from "@/lib/bookings";
import { useBookingsStore } from "@/lib/bookings";
import { startBookingCheckout, getStripeConnectStatus } from "@/lib/consultantApi";
import { pushBookingRespond } from "@/lib/marketplaceSync";
import { useDraftStore } from "@/lib/store";
import type { Draft } from "@/lib/letters/types";
import {
  REVIEW_VERDICT_ASKER_LABELS,
  currentRound,
  firstName,
  useReviewStore,
  type ReviewRequest,
  type ReviewVerdict,
} from "@/lib/journey/reviews";
import {
  acceptAllPoints,
  acceptPoint,
  bookingPrice,
  isAwaitingPayment,
  messageTheReviewer,
  paymentNote,
  rejectPoint,
  resolvePoint,
  type Me,
} from "./actions";
import {
  backLine,
  evidenceSharedWith,
  fmtDateTime,
  fmtDayTime,
  fmtTime,
  openPoints,
  plural,
  reviewPoints,
  shareableEvidence,
  summariseRound,
  type ReviewPoint,
} from "./model";
import { useReviewUI } from "./review-ui";

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

export function SectionHeading({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-1 flex items-center justify-between gap-3", className)}>
      <h3 className="m-0 text-[12px] font-medium tracking-[0.06em] text-[var(--ds-subtle)] uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function GreyHint({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p className={cn("m-0 flex items-start gap-2 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]", className)}>
      <span aria-hidden className="mt-px shrink-0 text-[var(--ds-subtle)]">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

/** The reviewer's avatar: an expert's photo or tint, else initials. */
export function ReviewerAvatar({ review, size = 36 }: { review: ReviewRequest; size?: number }) {
  if (review.kind === "expert") {
    return (
      <ExpertAvatar
        name={review.reviewer.name}
        seed={review.reviewer.consultantId ?? review.reviewer.name}
        size={size}
      />
    );
  }
  return (
    <Avatar
      size={size >= 36 ? "2xl" : size >= 24 ? "md" : "sm"}
      name={review.reviewer.name}
      seed={review.reviewer.email ?? review.reviewer.name}
    />
  );
}

function scrollToPoint(p: { sectionId?: string; markIds?: string[]; id: string }) {
  const sel = [
    ...(p.markIds ?? []).map((m) => `[data-suggestion-id="${CSS.escape(m)}"]`),
    `[data-comment-id="${CSS.escape(p.id)}"]`,
    p.sectionId ? `[data-section-id="${CSS.escape(p.sectionId)}"]` : "",
    p.sectionId ? `[data-section-anchor="${CSS.escape(p.sectionId)}"]` : "",
  ]
    .filter(Boolean)
    .join(",");
  const el = sel ? document.querySelector<HTMLElement>(sel) : null;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ------------------------------------------------------------------ */
/*  The reviewer card while it's out (f3)                              */
/* ------------------------------------------------------------------ */

export function reviewerSubline(review: ReviewRequest): string {
  if (review.kind === "expert") {
    const role = (review.reviewer.role ?? "").trim();
    if (/DraftHR expert/i.test(role)) return role;
    return `${role ? `${role} · ` : ""}DraftHR expert`;
  }
  if (review.kind === "team") return `${review.reviewer.role || "Teammate"} · your team`;
  return `${review.reviewer.email || "Someone you trust"} · secure link`;
}

function eventAt(review: ReviewRequest, kind: string, since = 0): number | undefined {
  return review.events?.find((e) => e.kind === kind && e.at >= since)?.at;
}

/** The live timeline, from what really happened. */
export function timelineFor(
  review: ReviewRequest,
  booking: Booking | undefined,
  filesShared: number,
  now = Date.now()
): PersonTimelineItem[] {
  const who = firstName(review.reviewer.name) || "The reviewer";
  const round = currentRound(review);
  const since = round?.sentAt ?? review.createdAt;
  const due = review.dueAt ? Date.parse(review.dueAt) : NaN;
  const late = Number.isFinite(due) && now > due;
  const backItem: PersonTimelineItem = {
    id: "back",
    label: late ? <span className="text-[var(--ds-amber-fg)]">Back to you, late</span> : "Back to you",
    time: Number.isFinite(due) ? `${late ? "was due" : "by"} ${fmtDayTime(due)}` : undefined,
    state: "todo",
  };
  const items: PersonTimelineItem[] = [];
  if (round && round.n > 1) {
    items.push({ id: "again", label: "Sent back with your question", time: fmtTime(round.sentAt), state: "done" });
  }
  const reading = filesShared > 0 ? `Reviewing the letter and ${plural(filesShared, "file")}` : "Reviewing the letter";

  if (review.kind === "expert") {
    if (!round || round.n === 1) {
      const price = bookingPrice(booking, review);
      const requested = booking?.bookedAt ?? review.createdAt;
      const accepted = booking?.acceptedAt ?? eventAt(review, "accepted");
      const paid = booking?.paymentStatus === "paid" ? (eventAt(review, "paid") ?? accepted) : undefined;
      if (paid && accepted && Math.abs(paid - requested) < 10 * 60000) {
        items.push({ id: "booked", label: `Booked and paid${price ? `, ${price}` : ""}`, time: fmtTime(requested), state: "done" });
      } else {
        items.push({ id: "requested", label: "Booking requested", time: fmtTime(requested), state: "done" });
      }
      if (!accepted) {
        items.push({ id: "accept", label: `Waiting for ${who} to accept`, time: "now", state: "now" });
        items.push({ id: "reading", label: reading, state: "todo" });
        items.push(backItem);
        return items;
      }
      items.push({ id: "accepted", label: `${who} accepted`, time: fmtTime(accepted), state: "done" });
      if (!paid) {
        items.push({ id: "pay", label: "Waiting for payment", time: "now", state: "now" });
        items.push({ id: "reading", label: reading, state: "todo" });
        items.push(backItem);
        return items;
      }
      if (!(paid && Math.abs(paid - requested) < 10 * 60000)) {
        items.push({ id: "paid", label: `Paid${price ? `, ${price}` : ""}`, time: fmtTime(paid), state: "done" });
      }
    }
    items.push({ id: "reading", label: reading, time: "now", state: "now" });
    items.push(backItem);
    return items;
  }

  const opened = eventAt(review, "opened", since) ?? (round?.n === 1 ? review.openedAt : undefined);
  if (!round || round.n === 1) {
    items.push(
      review.kind === "trusted"
        ? { id: "sent", label: `Link sent to ${review.reviewer.email ?? who}`, time: fmtTime(review.createdAt), state: "done" }
        : { id: "sent", label: `Sent to ${who}`, time: fmtTime(review.createdAt), state: "done" }
    );
  }
  if (opened) {
    items.push({
      id: "opened",
      label: review.kind === "trusted" ? "Opened the link" : `${who} opened it`,
      time: fmtTime(opened),
      state: "done",
    });
    items.push({ id: "reading", label: "Reviewing", time: "now", state: "now" });
  } else {
    items.push({
      id: "open",
      label: review.kind === "trusted" ? `Waiting for ${who} to open the link` : `Waiting for ${who} to open it`,
      time: "now",
      state: "now",
    });
  }
  items.push(backItem);
  return items;
}

export function OutCard({
  review,
  booking,
  draft,
  paymentsOn,
}: {
  review: ReviewRequest;
  booking: Booking | undefined;
  draft: Draft;
  paymentsOn: boolean | null;
}) {
  const who = firstName(review.reviewer.name) || "the reviewer";
  const round = currentRound(review);
  // Only what was shared: the files when evidence was shared, the hearing
  // notes only when those were (REVIEW-57).
  const files = evidenceSharedWith(draft.evidence, review.share).length;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);
  const timeline = useMemo(() => timelineFor(review, booking, files, now), [review, booking, files, now]);
  const opened = !!(eventAt(review, "opened", round?.sentAt ?? 0) ?? (round?.n === 1 && review.openedAt));
  const notAccepted = review.kind === "expert" && !(booking?.acceptedAt || eventAt(review, "accepted"));
  const awaitingPay = review.kind === "expert" && isAwaitingPayment(booking);
  const pill =
    review.kind === "expert"
      ? notAccepted
        ? { tone: "grey" as const, label: "Waiting to accept" }
        : awaitingPay
          ? { tone: "amber" as const, label: "Waiting for payment" }
          : { tone: "lilac" as const, label: "Reading now" }
      : opened
        ? { tone: "lilac" as const, label: "Reading now" }
        : { tone: "grey" as const, label: "Not opened yet" };
  const due = review.dueAt ? Date.parse(review.dueAt) : NaN;
  const late = Number.isFinite(due) && now > due;
  const note = paymentNote(booking);
  const price = bookingPrice(booking, review);
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    if (!booking) return;
    setPaying(true);
    const r = await startBookingCheckout(booking.id);
    if (r.ok) window.location.assign(r.data.url);
    else {
      toast.error(r.error || "Couldn't start checkout");
      setPaying(false);
    }
  };

  // The sub-line wraps in full (the mock wraps it to two lines), never cut
  // mid-word beside the pill (REVIEW-X14).
  return (
    <PersonCard
      name={review.reviewer.name || "Reviewer"}
      role={<span className="block whitespace-normal break-words">{reviewerSubline(review)}</span>}
      seed={review.reviewer.consultantId ?? review.reviewer.email ?? review.reviewer.name}
      pill={pill}
      timeline={timeline}
      className="[&_[data-slot=pill]]:self-start"
    >
      {awaitingPay && (
        <div className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-[var(--ds-amber-soft)] px-3 py-2 text-[13px] text-[var(--ds-amber-fg)]">
          <span className="min-w-0 flex-1">
            {paymentsOn === false
              ? "Awaiting payment. Online payment isn't available yet, so the specialist can't start on this booking."
              : `Pay ${price ?? "the fee"} to start`}
          </span>
          {paymentsOn === false ? (
            <Link to="/bookings" className="shrink-0 font-medium text-[var(--ds-ink)] underline underline-offset-[3px]">
              My bookings
            </Link>
          ) : (
            <Button size="sm" onClick={() => void pay()} disabled={paying || !booking} className="h-8">
              Pay
            </Button>
          )}
        </div>
      )}
      {booking?.paymentStatus === "processing" && booking.status === "accepted" && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">
          Payment processing. Bank payments such as Direct Debit can take a few working days to clear; the specialist starts once it does.
        </p>
      )}
      {note && <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-[var(--ds-amber-fg)]">{note}</p>}
      {late && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-[var(--ds-amber-fg)]">
          {review.kind === "expert"
            ? `${who} is late. It was due back ${fmtDayTime(due)}, so you're refunded if it doesn't come back.`
            : `${who} is late. It was due back ${fmtDayTime(due)}. Send a message, or recall it.`}
        </p>
      )}
      {review.kind === "trusted" && review.trustedLinkUrl && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]" data-testid="review-copy-link">
          {review.linkEmailed === false ? "The email didn't send. " : "The link went by email. "}
          <button
            type="button"
            className="font-medium text-[var(--ds-ink)] underline underline-offset-[3px]"
            onClick={() => void navigator.clipboard.writeText(review.trustedLinkUrl!).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy the link"))}
          >
            Copy link
          </button>
          {review.linkEmailed === false ? " to send it yourself." : " to send it another way."}
        </p>
      )}
    </PersonCard>
  );
}

/** Is Stripe set up for the marketplace (Pay shows only when it is)? */
export function usePaymentsOn(enabled: boolean): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getStripeConnectStatus().then((r) => {
      if (!cancelled) setOn(r.ok ? r.data.configured : false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return on;
}

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */

type ThreadMessage = { id: string; mine: boolean; name: string; body: string; at: number };

/** The thread as the person who asked sees it. */
export function askerThread(review: ReviewRequest, booking: Booking | undefined): ThreadMessage[] {
  if (review.kind === "expert") {
    return (booking?.messages ?? []).map((m) => ({
      id: m.id,
      mine: m.from === "requester",
      name: m.from === "requester" ? "You" : firstName(review.reviewer.name),
      body: m.text,
      at: m.ts,
    }));
  }
  return (review.messages ?? []).map((m) => ({
    id: m.id,
    mine: m.from === "asker",
    name: m.from === "asker" ? "You" : firstName(m.name || review.reviewer.name),
    body: m.body,
    at: m.at,
  }));
}

export function MessageThread({
  messages,
  them,
  me,
  placeholder,
  onSend,
  focusKey,
  className,
  closed,
}: {
  messages: ThreadMessage[];
  them: { name: string; seed?: string; avatar?: ReactNode };
  me: Me;
  placeholder: string;
  onSend: (text: string) => Promise<boolean> | boolean;
  /** Change it to focus the reply box. */
  focusKey?: number;
  className?: string;
  /** The review has ended: the thread is read only, with this line in
   *  place of the message box (the server takes no more messages). */
  closed?: string;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusKey) return;
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    inputRef.current?.focus({ preventScroll: true });
  }, [focusKey]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const ok = await onSend(t);
    if (!ok) setText(t);
  };
  return (
    <div className={cn("flex flex-col", className)} data-testid="review-thread">
      {messages.length > 0 && (
        <ol className="m-0 flex list-none flex-col p-0" aria-label="Messages">
          {messages.map((m) => (
            <li key={m.id} className={cn("mt-3 flex gap-2.5 text-[13px] first:mt-0", m.mine && "flex-row-reverse")}>
              {m.mine ? (
                <Avatar size="md" name={me.name} seed={me.email ?? me.name} />
              ) : (
                (them.avatar ?? <Avatar size="md" name={them.name} seed={them.seed ?? them.name} />)
              )}
              <div
                className={cn(
                  "min-w-0 max-w-[85%] px-[11px] py-2 leading-[1.45] break-words whitespace-pre-wrap text-[var(--ds-body)]",
                  m.mine
                    ? "rounded-[12px_4px_12px_12px] bg-[var(--ds-blue-soft)]"
                    : "rounded-[4px_12px_12px_12px] bg-[var(--ds-surface-2)]"
                )}
              >
                {m.body}
                <em className="mt-[3px] block text-[11.5px] text-[var(--ds-subtle)] not-italic">
                  {m.mine ? "You" : m.name} · {fmtTime(m.at)}
                </em>
              </div>
            </li>
          ))}
        </ol>
      )}
      {closed ? (
        <p className={cn("m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]", messages.length > 0 && "mt-2.5")} data-testid="review-thread-closed">
          {closed}
        </p>
      ) : (
        <form
          className={cn(
            "flex h-[38px] items-center gap-2 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pr-1 pl-2.5 focus-within:border-[var(--ds-line-strong)]",
            messages.length > 0 && "mt-2.5"
          )}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            data-testid="review-reply"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)]"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!text.trim()}
            className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-faint)]"
          >
            <ArrowUp className="size-4" strokeWidth={1.8} />
          </button>
        </form>
      )}
    </div>
  );
}

/** The asker's thread with the reviewer, with the reply box. */
export function AskerMessages({ review, booking, me, draftId }: { review: ReviewRequest; booking?: Booking; me: Me; draftId: string }) {
  const replyFocus = useReviewUI((s) => (s.replyFocus?.draftId === draftId ? s.replyFocus.n : 0));
  const msgs = useMemo(() => askerThread(review, booking), [review, booking]);
  return (
    <MessageThread
      messages={msgs}
      them={{ name: review.reviewer.name, avatar: <ReviewerAvatar review={review} size={24} /> }}
      me={me}
      placeholder={`Reply to ${firstName(review.reviewer.name) || "the reviewer"}`}
      onSend={(t) => messageTheReviewer(review, t, me)}
      focusKey={replyFocus}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Back to you (f5)                                                   */
/* ------------------------------------------------------------------ */

const VERDICT_TONE: Record<ReviewVerdict, "green" | "amber"> = {
  ready: "green",
  "ready-with-changes": "green",
  rethink: "amber",
};

export function BackCard({ review }: { review: ReviewRequest }) {
  const round = currentRound(review);
  return (
    <PersonCard
      name={review.reviewer.name || "Reviewer"}
      role={round?.backAt ? backLine(round.backAt, review.dueAt) : "Sent back"}
      seed={review.reviewer.consultantId ?? review.reviewer.email ?? review.reviewer.name}
    >
      {round?.verdict && (
        <div className="mt-3">
          <Pill tone={VERDICT_TONE[round.verdict]}>{REVIEW_VERDICT_ASKER_LABELS[round.verdict]}</Pill>
        </div>
      )}
      {round?.note && (
        <blockquote className="m-0 mt-2.5 border-l-2 border-[var(--ds-lilac-quote)] pl-2.5 text-[13px] leading-[1.5] whitespace-pre-wrap text-[var(--ds-body)]">
          {round.note}
        </blockquote>
      )}
    </PersonCard>
  );
}

export function PointsList({
  review,
  draft,
  canDecide,
  me,
}: {
  review: ReviewRequest;
  draft: Draft;
  canDecide: boolean;
  me: Me;
}) {
  const points = useMemo(() => reviewPoints(draft, review), [draft, review]);
  const open = openPoints(points);
  // Accept all takes what is in the letter; a held suggestion isn't yet.
  const openSuggestions = open.filter((p) => p.kind === "suggestion" && !p.held).length;
  const [replyTo, setReplyTo] = useState<string | null>(null);
  if (points.length === 0) {
    return (
      <p className="m-0 text-[13px] text-[var(--ds-muted)]">
        {firstName(review.reviewer.name) || "The reviewer"} didn't suggest any changes.
      </p>
    );
  }
  return (
    <div data-testid="review-points">
      <SectionHeading
        right={
          canDecide && openSuggestions > 0 ? (
            <button
              type="button"
              onClick={() => acceptAllPoints(review)}
              className="text-[13px] font-medium text-[var(--ds-ink)] hover:underline hover:underline-offset-[3px]"
            >
              Accept all
            </button>
          ) : null
        }
      >
        {open.length > 0 ? `${open.length} to decide` : "All decided"}
      </SectionHeading>
      <ul className="m-0 mt-2 list-none p-0">
        {points.map((p) => (
          <PointRow
            key={p.id}
            point={p}
            review={review}
            canDecide={canDecide}
            onReply={() => setReplyTo(replyTo === p.id ? null : p.id)}
            replying={replyTo === p.id}
            me={me}
            onReplied={() => setReplyTo(null)}
          />
        ))}
      </ul>
    </div>
  );
}

function PointRow({
  point: p,
  review,
  canDecide,
  onReply,
  replying,
  onReplied,
  me,
}: {
  point: ReviewPoint;
  review: ReviewRequest;
  canDecide: boolean;
  onReply: () => void;
  replying: boolean;
  onReplied: () => void;
  me: Me;
}) {
  const done = p.state !== "open";
  const [reply, setReply] = useState("");
  const sendReply = () => {
    const body = reply.trim();
    if (!body) return;
    const c = useDraftStore.getState().drafts[review.draftId]?.comments?.find((x) => x.id === p.id);
    useDraftStore.getState().addComment(review.draftId, {
      sectionId: c?.sectionId ?? p.sectionId ?? "",
      parentId: p.id,
      authorId: me.email || me.name,
      authorName: me.name,
      authorEmail: me.email,
      body,
    });
    // The reviewer outside the app reads it in the thread next round.
    if (review.kind !== "team") void messageTheReviewer(review, `On "${p.title}": ${body}`, me);
    setReply("");
    onReplied();
    toast("Reply added");
  };
  const btn =
    "grid size-7 shrink-0 place-items-center rounded-[7px] border transition-colors duration-[120ms] disabled:opacity-40";
  return (
    <li className="border-t border-[var(--ds-line-2)] py-2.5 first:border-t" data-point-id={p.id} data-state={p.state}>
      <div className="flex items-start gap-2.5 text-[13px] text-[var(--ds-ink)]">
        <span
          aria-hidden
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-[6px] text-[11px] font-semibold",
            p.kind === "suggestion"
              ? "bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)]"
              : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
          )}
        >
          {p.kind === "suggestion" ? p.n : <MessageSquare className="size-3" strokeWidth={2} />}
        </span>
        <button
          type="button"
          onClick={() => scrollToPoint(p)}
          className="min-w-0 flex-1 text-left"
          aria-label={`Show in the letter: ${p.title}`}
        >
          <span className={cn("block leading-[1.35]", done && "text-[var(--ds-subtle)]")}>{p.title}</span>
          <span className="mt-px block text-[12px] text-[var(--ds-subtle)]">
            {p.kind === "comment" ? "Comment" : (p.where ?? "Suggested change")}
          </span>
          {/* Not in the letter yet (REVIEW-X24): say why, and what to do. */}
          {!done && p.held && (
            <span className="mt-1 block text-[12px] leading-[1.4] text-[var(--ds-amber-fg)]" data-testid="review-point-held">
              {p.held === "busy"
                ? "Not in the letter yet. Decide DraftHR's edit in this part first."
                : "This part is no longer in the letter, so it can only be left out."}
            </span>
          )}
        </button>
        {done ? (
          <span
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] whitespace-nowrap",
              p.state === "accepted" || p.state === "resolved" ? "text-[var(--ds-green-fg)]" : "text-[var(--ds-muted)]"
            )}
          >
            {p.state === "rejected" ? <X className="size-3" /> : <Check className="size-3" />}
            {p.state === "accepted" ? "Accepted" : p.state === "rejected" ? "Rejected" : "Resolved"}
          </span>
        ) : p.kind === "suggestion" ? (
          <span className="ml-auto flex shrink-0 gap-1">
            <button
              type="button"
              disabled={!canDecide || !!p.held}
              onClick={() => acceptPoint(review, p)}
              aria-label={`Accept: ${p.title}`}
              title={p.held ? "Not in the letter yet" : "Accept"}
              className={cn(btn, "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]")}
            >
              <Check className="size-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              disabled={!canDecide}
              onClick={() => rejectPoint(review, p)}
              aria-label={p.held ? `Leave out: ${p.title}` : `Reject: ${p.title}`}
              title={p.held ? "Leave out" : "Reject"}
              className={cn(btn, "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]")}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </span>
        ) : (
          <span className="ml-auto flex shrink-0 gap-1">
            <button
              type="button"
              disabled={!canDecide}
              onClick={onReply}
              aria-label={`Reply: ${p.title}`}
              aria-expanded={replying}
              title="Reply"
              className={cn(btn, "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]")}
            >
              <CornerUpLeft className="size-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              disabled={!canDecide}
              onClick={() => resolvePoint(review, p)}
              aria-label={`Resolve: ${p.title}`}
              title="Resolve"
              className={cn(btn, "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]")}
            >
              <Check className="size-3.5" strokeWidth={2} />
            </button>
          </span>
        )}
      </div>
      {replying && (
        <form
          className="mt-2 ml-[30px] flex h-[34px] items-center gap-2 rounded-[9px] border border-[var(--ds-line)] pr-1 pl-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            sendReply();
          }}
        >
          <input
            autoFocus
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply to ${firstName(review.reviewer.name) || "the reviewer"}`}
            aria-label={`Reply to the comment: ${p.title}`}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--ds-subtle)]"
          />
          <button type="submit" disabled={!reply.trim()} aria-label="Send reply" className="grid size-6 place-items-center rounded-[6px] disabled:text-[var(--ds-faint)]">
            <ArrowUp className="size-3.5" />
          </button>
        </form>
      )}
    </li>
  );
}

export function BackFooter({
  onSendBack,
  onFinish,
  disabled,
  reason,
}: {
  onSendBack: () => void;
  onFinish: () => void;
  disabled?: boolean;
  reason?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1" title={disabled ? reason : undefined}>
      <Button variant="outline" onClick={onSendBack} disabled={disabled} className="h-10 text-[13.5px]">
        <MessageSquareReply className="size-[15px]" strokeWidth={1.7} />
        Send back
      </Button>
      <Button onClick={onFinish} disabled={disabled} className="h-10 text-[13.5px]" data-testid="review-finish">
        <Check className="size-[15px]" strokeWidth={2} />
        Finish review
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rounds (rv-done)                                                   */
/* ------------------------------------------------------------------ */

export function RoundsList({ draft, review }: { draft: Draft; review: ReviewRequest }) {
  const who = firstName(review.reviewer.name) || "The reviewer";
  const rounds = review.rounds.map((r) => summariseRound(draft, review, r));
  return (
    <div data-testid="review-rounds">
      {rounds.map((r, i) => {
        const next = rounds[i + 1];
        const lines: { icon: ReactNode; text: ReactNode; tone?: "green" }[] = [];
        if (r.backAt) {
          const counts = [r.changes ? plural(r.changes, "change") : "", r.comments ? plural(r.comments, "comment") : ""]
            .filter(Boolean)
            .join(" and ");
          lines.push({
            icon: review.kind === "expert" ? <ReviewerAvatar review={review} size={18} /> : <MessageSquare className="size-3.5" />,
            text: counts
              ? `${who}: ${counts}${r.verdict ? `. ${REVIEW_VERDICT_ASKER_LABELS[r.verdict]}` : ""}`
              : r.note
                ? `${who}: "${r.note}"`
                : `${who}: ${r.verdict ? REVIEW_VERDICT_ASKER_LABELS[r.verdict] : "no changes"}`,
          });
          const did: string[] = [];
          if (r.accepted) did.push(`accepted ${plural(r.accepted, "change")}`);
          if (r.resolved) did.push(`resolved ${r.resolved === 1 ? "the comment" : `${r.resolved} comments`}`);
          if (did.length) lines.push({ icon: <Check className="size-3.5" />, text: `You ${did.join(" and ")}`, tone: "green" });
          for (const t of r.keptTitles) lines.push({ icon: <X className="size-3.5" />, text: `You kept your own wording on "${t}"` });
        } else if (review.status === "out" && i === rounds.length - 1) {
          lines.push({ icon: <Eye className="size-3.5" />, text: `With ${who} now` });
        }
        if (next?.question) lines.push({ icon: <CornerUpLeft className="size-3.5" />, text: `You sent it back: "${next.question}"` });
        if (i === rounds.length - 1 && review.status === "finished")
          lines.push({ icon: <Check className="size-3.5" />, text: "You finished the review", tone: "green" });
        if (i === rounds.length - 1 && review.status === "recalled")
          lines.push({ icon: <CornerUpLeft className="size-3.5" />, text: review.declinedAt ? `${who} declined` : "You recalled it" });
        return (
          <section key={r.n} className="border-t border-[var(--ds-line-2)] py-3">
            <h4 className="m-0 mb-2 flex items-center gap-2 text-[12px] font-medium tracking-[0.06em] text-[var(--ds-subtle)] uppercase">
              Round {r.n}
              <span className="ml-auto font-normal tracking-normal normal-case">
                {fmtDateTime(r.sentAt)}
                {r.backAt ? ` to ${sameDay(r.sentAt, r.backAt) ? fmtTime(r.backAt) : fmtDateTime(r.backAt)}` : ""}
              </span>
            </h4>
            <ul className="m-0 list-none p-0">
              {lines.map((l, j) => (
                <li key={j} className="flex items-start gap-2 py-[3px] text-[13px] text-[var(--ds-body)]">
                  <span
                    aria-hidden
                    className={cn("mt-[2px] shrink-0", l.tone === "green" ? "text-[var(--ds-green-solid)]" : "text-[var(--ds-subtle)]")}
                  >
                    {l.icon}
                  </span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/* ------------------------------------------------------------------ */
/*  Rate an expert (rv-done)                                           */
/* ------------------------------------------------------------------ */

export function RateExpertCard({ review }: { review: ReviewRequest }) {
  const bookings = useBookingsStore((s) => s.bookings);
  const booking = review.bookingId ? bookings.find((b) => b.id === review.bookingId) : undefined;
  const [hover, setHover] = useState(0);
  const [thanks, setThanks] = useState(false);
  const rated = review.rating ?? booking?.rating;
  if (review.kind !== "expert" || review.status !== "finished") return null;
  if (rated && !thanks) return null;
  const who = firstName(review.reviewer.name) || "the expert";
  const rate = async (n: number) => {
    useReviewStore.getState().updateReview(review.id, { rating: n });
    setThanks(true);
    if (booking) {
      useBookingsStore.getState().completeBooking(booking.id, n);
      const ok = await pushBookingRespond(booking.id, "complete", { rating: n });
      if (!ok) useReviewStore.getState().updateReview(review.id, { rating: undefined });
    }
  };
  return (
    <section className="rounded-[14px] border border-[var(--ds-line)] px-4 py-3.5" data-testid="rate-expert">
      {thanks ? (
        <p className="m-0 flex items-center gap-2 text-[13.5px] text-[var(--ds-ink)]">
          <Check className="size-4 text-[var(--ds-green-solid)]" />
          Thanks. Your rating helps other teams choose an expert.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Star aria-hidden className="size-[15px] shrink-0 text-[var(--ds-muted)]" strokeWidth={1.6} />
          <div className="min-w-0 flex-1">
            <b className="block text-[14px] font-medium text-[var(--ds-ink)]">Rate {who}'s review</b>
            <span className="block text-[12px] text-[var(--ds-muted)]">Helps other teams choose an expert</span>
          </div>
          <div role="radiogroup" aria-label={`Rate ${who}'s review`} className="flex shrink-0 gap-0.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={false}
                aria-label={`${n} out of 5`}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onClick={() => void rate(n)}
                className="grid size-[22px] place-items-center rounded-[5px] text-[var(--ds-amber-dot)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <Star className="size-[15px]" strokeWidth={1.6} fill={n <= hover ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Ready for review (f2)                                              */
/* ------------------------------------------------------------------ */

export function ReadyChecklist({ draft, checksTotal, checksPassing }: { draft: Draft; checksTotal: number; checksPassing: number }) {
  // Edits accepted while drafting: the decisions the letter's timeline
  // records (Edits tab, margin cards), or the versions an accept leaves.
  const versioned = draft.sections.reduce((n, s) => n + (s.versions ?? []).filter((v) => v.id.endsWith("-prev")).length, 0);
  const decided = (draft.timeline ?? []).filter((t) => t.kind === "sections_updated" && t.meta?.decision === "accepted").length;
  const accepted = Math.max(versioned, decided);
  // The files a reviewer can be given, counted as the dialog counts them
  // ("Share evidence, 3 files"); hearing notes are shared separately.
  const { files, hearingNotes } = shareableEvidence(draft.evidence);
  const evidence = files.length;
  return (
    <CheckList label="Ready for review">
      <CheckRow state="ok" note={accepted > 0 ? `${plural(accepted, "edit")} accepted` : undefined}>
        Draft finished
      </CheckRow>
      <CheckRow state={checksPassing === checksTotal ? "ok" : "need"}>
        {checksPassing === checksTotal ? `All ${checksTotal} checks pass` : `${checksPassing} of ${checksTotal} checks pass`}
      </CheckRow>
      {evidence > 0 ? (
        <CheckRow state="ok" note={hearingNotes.length > 0 ? "and hearing notes" : undefined}>
          {plural(evidence, "evidence file")} linked
        </CheckRow>
      ) : hearingNotes.length > 0 ? (
        <CheckRow state="ok">Hearing notes linked</CheckRow>
      ) : (
        <CheckRow state="wait">No evidence linked</CheckRow>
      )}
    </CheckList>
  );
}

export function BellHint({ expert }: { expert: boolean }) {
  return (
    <GreyHint icon={<Bell className="size-3.5" strokeWidth={1.6} />}>
      We'll let you know the moment it's back. You can recall it at any time.
      {expert ? " Once a review has started, the fee isn't refunded." : ""}
    </GreyHint>
  );
}
