import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingsStore } from "@/lib/bookings";
import { getSharedDraft, type SharedDraftDTO } from "@/lib/consultantApi";
import { pullInbox, pushBookingMessage, pushBookingRespond } from "@/lib/marketplaceSync";
import { REVIEW_VERDICT_LABELS, firstName, type ReviewVerdict } from "@/lib/journey/reviews";
import { ReviewerWorkspace } from "@/components/journey/review/ReviewerWorkspace";
import { paymentNote } from "@/components/journey/review/actions";
import { fmtShortDate } from "@/components/journey/review/model";
import {
  actAsExpert,
  openExpertReview,
  type ExpertReview,
  type LetterSnapshot,
  type LinkResult,
  type LinkState,
  type ReviewerAction,
} from "@/components/journey/review/trusted-api";
import { LinkPage } from "./TrustedReview";

/**
 * /c/review/:bookingId: the expert's own view of a letter they were booked
 * to review (mock f4). The letter in the centre, "Your review" on the right
 * with HR's ask, the Read, Suggest, Comment switch and Send back.
 *
 * Access is the booking's: the server checks the caller is the consultant
 * on the booking, that it is accepted and paid, and (for the draft itself)
 * the matter-scoped share token. Suggestions and comments go to the review
 * record on the server (api/review-links, expert ops) so they reach HR's
 * letter on their device; Send back also marks the booking delivered with
 * the verdict and note, as Deliver does in the inbox.
 *
 * Falls back to a read-only letter (the shared draft) when the booking has
 * no review record yet, for example a booking made before reviews were
 * linked: the verdict and note still go back as the delivery.
 */
export function SharedDraftReview() {
  const nav = useNavigate();
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const bookings = useBookingsStore((s) => s.bookings);
  const booking = bookings.find((b) => b.id === bookingId);

  const [shared, setShared] = useState<SharedDraftDTO | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [expert, setExpert] = useState<ExpertReview | null>(null);
  const [expertError, setExpertError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const access = !!booking && (booking.status === "accepted" || booking.status === "delivered" || booking.status === "completed");
  const token = booking?.shareToken;

  const loadExpert = useCallback(async () => {
    const res = await openExpertReview(bookingId);
    if (res.ok) {
      setExpert(res.data);
      setExpertError(null);
    } else {
      setExpertError(res.message);
    }
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    if (!booking || !access) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      token
        ? getSharedDraft(token).then((res) => {
            if (cancelled) return;
            if (res.ok) setShared(res.data);
            else setSharedError(res.error);
          })
        : Promise.resolve(),
      loadExpert(),
    ]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, access, token]);

  // HR may send it back for another round, or recall it, while it's open.
  useEffect(() => {
    if (!access) return;
    const t = window.setInterval(() => {
      void loadExpert();
      void pullInbox();
    }, 30000);
    const onFocus = () => void loadExpert();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [access, loadExpert]);

  const fallbackState: LinkState = useMemo(
    () => ({
      status: booking?.status === "accepted" ? "out" : "back",
      approvedAt: null,
      openedAt: null,
      expiresAt: null,
      revokedAt: null,
      rounds: [
        {
          n: 1,
          sentAt: booking?.acceptedAt ?? booking?.bookedAt ?? 0,
          backAt: booking?.deliveredAt,
        },
      ],
      messages: [],
      points: [],
    }),
    [booking?.status, booking?.acceptedAt, booking?.bookedAt, booking?.deliveredAt]
  );
  const [localState, setLocalState] = useState<LinkState | null>(null);

  const messages = useMemo(
    () =>
      (booking?.messages ?? []).map((m) => ({
        id: m.id,
        mine: m.from === "consultant",
        name: m.from === "consultant" ? "You" : firstName(expert?.asker.name) || "HR",
        body: m.text,
        at: m.ts,
      })),
    [booking?.messages, expert?.asker.name]
  );

  if (!booking) {
    return (
      <LinkPage icon={<FileText className="size-5" strokeWidth={1.6} />} title="Booking not found" action={<BackToInbox onClick={() => nav("/c")} />}>
        That booking either doesn't exist or has been withdrawn.
      </LinkPage>
    );
  }

  if (!access) {
    return (
      <LinkPage icon={<Lock className="size-5" strokeWidth={1.6} />} title="Access not yet granted" action={<BackToInbox onClick={() => nav("/c")} />}>
        Draft access opens once you accept the booking and HR has paid for it. Currently the status is <strong>{booking.status}</strong>.
      </LinkPage>
    );
  }

  const refundNote = paymentNote(booking);
  if (refundNote) {
    return (
      <LinkPage icon={<ShieldCheck className="size-5" strokeWidth={1.6} />} title="This booking is paused" action={<BackToInbox onClick={() => nav("/c")} />}>
        {refundNote}
      </LinkPage>
    );
  }

  if (loading) {
    return (
      <LinkPage icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.6} />} title="Fetching the draft…" action={<BackToInbox onClick={() => nav("/c")} />}>
        This takes a moment.
      </LinkPage>
    );
  }

  const letter: LetterSnapshot | null = expert
    ? expert.letter
    : shared
      ? {
          title: shared.booking.matterTitle ?? shared.draft.title ?? booking.matterTitle ?? "Letter",
          letterType: shared.draft.letterType,
          jurisdiction: shared.draft.jurisdiction,
          mode: shared.draft.mode,
          company: "",
          sections: shared.draft.sections,
        }
      : null;

  if (!letter) {
    return (
      <LinkPage icon={<FileText className="size-5" strokeWidth={1.6} />} title="The draft isn't open yet" action={<BackToInbox onClick={() => nav("/c")} />}>
        {sharedError ??
          expertError ??
          "Draft access opens once the booking is paid. If HR has just paid, refresh the inbox to pick up the share link."}
      </LinkPage>
    );
  }

  const state = expert?.state ?? localState ?? fallbackState;
  const linked = !!expert;

  const act = async (a: ReviewerAction): Promise<LinkResult<{ state: LinkState }>> => {
    if (linked) return actAsExpert(bookingId, a);
    if (a.action === "send-back") {
      const now = Date.now();
      const next: LinkState = {
        ...state,
        status: "back",
        rounds: state.rounds.map((r, i) => (i === state.rounds.length - 1 ? { ...r, backAt: now, verdict: a.verdict, note: a.note } : r)),
      };
      return { ok: true, data: { state: next } };
    }
    return {
      ok: false,
      status: 409,
      message: "Suggestions and comments open once HR's letter is linked to this booking. You can still send your verdict and note back.",
    };
  };

  const deliver = async (verdict: ReviewVerdict, note: string) => {
    // The first send-back is the delivery (the inbox, My bookings and HR's
    // letter then agree). Later rounds only go through the review record.
    if (booking.status !== "accepted") return;
    const text = `${REVIEW_VERDICT_LABELS[verdict]}${note ? `\n\n${note}` : ""}`;
    useBookingsStore.getState().deliverBooking(booking.id, text);
    await pushBookingRespond(booking.id, "deliver", { note: text });
  };

  return (
    <ReviewerWorkspace
      modeKey={`booking:${bookingId}`}
      letter={letter}
      state={state}
      asker={{ name: expert?.asker.name || "HR" }}
      me={{ name: booking.consultantName || "You" }}
      ask={expert?.ask ?? shared?.booking.message ?? booking.message ?? null}
      evidence={expert?.evidence ?? []}
      facts={{ letterType: letter.letterType, jurisdiction: letter.jurisdiction, mode: letter.mode }}
      secureLine={booking.shareTokenExpiresAt ? `Secure link, expires ${fmtShortDate(booking.shareTokenExpiresAt)}` : null}
      back={
        <button
          type="button"
          onClick={() => nav("/c")}
          aria-label="Back to inbox"
          className="-ml-1 grid size-8 shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} />
        </button>
      }
      messages={messages}
      onMessage={async (text) => {
        const id = useBookingsStore.getState().appendMessage(booking.id, "consultant", text);
        if (!id) return false;
        return pushBookingMessage(booking.id, "consultant", text);
      }}
      act={act}
      onState={(s) => (linked ? setExpert((prev) => (prev ? { ...prev, state: s } : prev)) : setLocalState(s))}
      afterSendBack={deliver}
    />
  );
}

function BackToInbox({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <ArrowLeft className="size-4" />
      Back to inbox
    </Button>
  );
}
