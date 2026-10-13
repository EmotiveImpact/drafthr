import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ReviewDialog } from "@/components/editor/ReviewDialog";
import { useJourneyUI } from "@/components/journey/ui-store";
import { useDraftStore } from "@/lib/store";
import { isOwnLetter } from "@/lib/journey/stage";
import { useBookingsStore } from "@/lib/bookings";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { currentRound, firstName, useReviewStore, type ReviewRequest } from "@/lib/journey/reviews";
import { ReviewerPicker } from "./review/ReviewerPicker";
import { RoundsList } from "./review/parts";
import { requestApproval, useReturnFocus, useReviewUI } from "./review/review-ui";
import { bookingFor, finishReview, isAskerOf, recallReview, sendBackToReviewer, useMe } from "./review/actions";
import { useAssignedReviews, useReviewSync } from "./review/sync";
import { TeammateComposerHost } from "./review/teammate";
import { openPoints, plural, reviewPoints } from "./review/model";

/**
 * Hosts the review loop's dialogs: "Who should review this letter?" (opened
 * through useJourneyUI().openReviewPicker), the Recall and Finish review
 * confirmations, the "Send back to <name>" composer, the rounds history and
 * the approval picker for "Skip review" when there is no usual approver,
 * and a teammate reviewer's suggestion and comment boxes (V1).
 * Also: the return from the marketplace (`?review=expert&expert=<id>`), the
 * "sent it back" toast, and keeping the open review in step with the server.
 *
 * Mounted by JourneyPanel and may be mounted again by the letter screen;
 * only the first mounted copy renders, so nothing opens twice.
 */

/* One live host at a time. */
let owners: string[] = [];
const listeners = new Set<() => void>();
const ownerStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get: () => owners[0] ?? null,
  claim(id: string) {
    owners = [...owners, id];
    listeners.forEach((l) => l());
  },
  release(id: string) {
    owners = owners.filter((o) => o !== id);
    listeners.forEach((l) => l());
  },
};

export function ReviewDialogsHost() {
  const id = useId();
  useEffect(() => {
    ownerStore.claim(id);
    return () => ownerStore.release(id);
  }, [id]);
  const owner = useSyncExternalStore(ownerStore.subscribe, ownerStore.get, ownerStore.get);
  if (owner !== id) return null;
  return <HostBody />;
}

function HostBody() {
  const picker = useJourneyUI((s) => s.reviewPicker);
  const closePicker = useJourneyUI((s) => s.closeReviewPicker);
  const pickerDraft = useDraftStore((s) => (picker ? s.drafts[picker.draftId] : undefined));
  const pickerAllowed = !!pickerDraft && !pickerDraft.isTemplateSource;
  const me = useMe();

  return (
    <>
      {picker && pickerAllowed && (
        <ReviewerPicker
          key={`${picker.draftId}:${picker.preset?.kind ?? ""}:${picker.preset?.expertId ?? ""}:${picker.preset?.from ?? ""}`}
          draftId={picker.draftId}
          preset={picker.preset}
          onClose={closePicker}
        />
      )}
      <RecallConfirm />
      <FinishConfirm />
      <SendBackComposer />
      <RoundsHistory />
      <ApprovalPicker />
      <MarketplaceReturn />
      <RouteDraftWatcher />
      <TeammateComposerHost me={me} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  The open review on a draft                                         */
/* ------------------------------------------------------------------ */

function useOpenReview(draftId: string | null): ReviewRequest | null {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => {
    if (!draftId) return null;
    return (
      Object.values(requests)
        .filter((r) => r.draftId === draftId && (r.status === "out" || r.status === "back"))
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  }, [requests, draftId]);
}

function useLatestFor(draftId: string | null): ReviewRequest | null {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => {
    if (!draftId) return null;
    return (
      Object.values(requests)
        .filter((r) => r.draftId === draftId && r.status !== "recalled")
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  }, [requests, draftId]);
}

/* ------------------------------------------------------------------ */
/*  Recall                                                             */
/* ------------------------------------------------------------------ */

function RecallConfirm() {
  const draftId = useReviewUI((s) => s.recallFor);
  const set = useReviewUI((s) => s.set);
  const review = useOpenReview(draftId);
  const bookings = useBookingsStore((s) => s.bookings);
  const booking = bookingFor(review, bookings);
  const [busy, setBusy] = useState(false);
  const me = useMe();
  // Only the person who asked can recall it (REVIEW-100).
  const mine = !!review && isAskerOf(review, me);
  const open = !!draftId && !!review && review.status === "out" && mine;
  const close = () => set({ recallFor: null });
  const returnFocus = useReturnFocus(open);

  useEffect(() => {
    // Nothing to recall (it came back meanwhile): close quietly.
    if (draftId && (!review || review.status !== "out" || !mine)) set({ recallFor: null });
  }, [draftId, review, mine, set]);

  if (!open || !review) return null;
  const who = firstName(review.reviewer.name) || "the reviewer";
  const started = review.kind === "expert" && (booking?.paymentStatus === "paid" || !!booking?.acceptedAt);
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[440px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] p-6 sm:max-w-[440px]" data-testid="review-recall-confirm" onCloseAutoFocus={returnFocus}>
        <DialogTitle className="text-[20px]">Recall it from {who}?</DialogTitle>
        <DialogDescription className="mt-2 text-[13.5px] leading-[1.5] text-[var(--ds-muted)]">
          {review.kind === "trusted"
            ? `${who}'s secure link stops working at once and you can edit the letter again.`
            : review.kind === "expert"
              ? `${who} can no longer open the letter and you can edit it again.`
              : `${who} can no longer suggest changes or send it back, and you can edit the letter again. Any suggestions ${who} made in this round are withdrawn; comments stay.`}
          {started ? " Once a review has started, the fee isn't refunded." : ""}
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await recallReview(review);
              } finally {
                setBusy(false);
                close();
              }
            }}
          >
            {busy ? "Recalling…" : "Recall"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Finish review                                                      */
/* ------------------------------------------------------------------ */

function FinishConfirm() {
  const draftId = useReviewUI((s) => s.finishFor);
  const set = useReviewUI((s) => s.set);
  const review = useOpenReview(draftId);
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const left = useMemo(() => (draft && review ? openPoints(reviewPoints(draft, review)) : []), [draft, review]);
  const close = () => set({ finishFor: null });
  const ran = useRef<string | null>(null);
  const returnFocus = useReturnFocus(!!draftId && !!review && review.status === "back" && left.length > 0);

  useEffect(() => {
    if (!draftId) {
      ran.current = null;
      return;
    }
    if (!review || review.status !== "back") {
      set({ finishFor: null });
      return;
    }
    // Nothing left to decide: finish at once.
    if (left.length === 0 && ran.current !== review.id) {
      ran.current = review.id;
      set({ finishFor: null });
      void finishReview(review).then((o) => o === "pick-approver" && requestApproval(review.draftId));
    }
  }, [draftId, review, left.length, set]);

  if (!draftId || !review || review.status !== "back" || left.length === 0) return null;
  const suggestions = left.filter((p) => p.kind === "suggestion").length;
  const comments = left.length - suggestions;
  // What finishing really does (actions.ts closeOpenPoints): the letter goes
  // to approval as it is, so nothing undecided is left in it (LETTER-X37).
  const what = [
    suggestions > 0
      ? `${suggestions === 1 ? "the suggested change is" : `the ${suggestions} suggested changes are`} left out and the letter keeps your wording`
      : "",
    comments > 0 ? `${comments === 1 ? "the comment is" : `the ${comments} comments are`} marked resolved` : "",
  ]
    .filter(Boolean)
    .join(", and ");
  const next =
    (draft && isOwnLetter(draft)) || (review.kind === "team" && review.approveInSameStep && review.approvedAt)
      ? "The letter is then ready to send."
      : "The letter then moves on to approval.";
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[440px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] p-6 sm:max-w-[440px]" data-testid="review-finish-confirm" onCloseAutoFocus={returnFocus}>
        <DialogTitle className="text-[20px]">Finish with {plural(left.length, "point")} left?</DialogTitle>
        <DialogDescription className="mt-2 text-[13.5px] leading-[1.5] text-[var(--ds-muted)]">
          You haven't decided on {left.length === 1 ? "one of" : `${left.length} of`}{" "}
          {firstName(review.reviewer.name) || "the reviewer"}'s points. If you finish now, {what}. {next}
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Keep deciding
          </Button>
          <Button
            onClick={() => {
              close();
              void finishReview(review).then((o) => o === "pick-approver" && requestApproval(review.draftId));
            }}
          >
            Finish review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Send back with a question                                          */
/* ------------------------------------------------------------------ */

function SendBackComposer() {
  const draftId = useReviewUI((s) => s.sendBackFor);
  const set = useReviewUI((s) => s.set);
  const review = useOpenReview(draftId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const returnFocus = useReturnFocus(!!draftId && !!review && review.status === "back");
  useEffect(() => {
    if (draftId) setText("");
  }, [draftId]);
  if (!draftId || !review || review.status !== "back") return null;
  const who = firstName(review.reviewer.name) || "the reviewer";
  const round = currentRound(review);
  const close = () => set({ sendBackFor: null });
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await sendBackToReviewer(review, text);
      close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[480px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] p-6 sm:max-w-[480px]" data-testid="review-send-back" onCloseAutoFocus={returnFocus}>
        <DialogTitle className="text-[20px]">Send back to {who}</DialogTitle>
        <DialogDescription className="mt-1.5 mb-3 text-[13.5px] leading-[1.5] text-[var(--ds-muted)]">
          This starts round {(round?.n ?? 1) + 1}. {who} sees your question at the top of their review, and the letter is locked again until it's back.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="send-back-question" className="mb-1.5 block text-[13px] font-medium text-[var(--ds-ink)]">
            Your question or note
          </label>
          <textarea
            id="send-back-question"
            autoFocus
            required
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: is it fair to name the June absences, or should we leave dates out?"
            className="block min-h-[96px] w-full resize-y rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:shadow-[var(--ds-focus-ring)]"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!text.trim() || busy}>
              <Send className="size-[15px]" strokeWidth={1.7} />
              {busy ? "Sending…" : `Send to ${who}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Rounds history (rv-done)                                           */
/* ------------------------------------------------------------------ */

function RoundsHistory() {
  const draftId = useReviewUI((s) => s.roundsFor);
  const set = useReviewUI((s) => s.set);
  const review = useLatestFor(draftId);
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const returnFocus = useReturnFocus(!!draftId && !!review && !!draft);
  if (!draftId || !review || !draft) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && set({ roundsFor: null })}>
      <DialogContent className="max-h-[calc(100dvh-32px)] w-[560px] max-w-[calc(100vw-32px)] gap-0 overflow-y-auto rounded-[16px] p-6 sm:max-w-[560px]" data-testid="review-rounds-dialog" onCloseAutoFocus={returnFocus}>
        <DialogTitle className="text-[22px]">How the review went</DialogTitle>
        <DialogDescription className="mt-1 mb-4 text-[13.5px] text-[var(--ds-muted)]">
          {plural(review.rounds.length, "round")} with {review.reviewer.name || "the reviewer"}
        </DialogDescription>
        <RoundsList draft={draft} review={review} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Skip review without a usual approver                               */
/* ------------------------------------------------------------------ */

function ApprovalPicker() {
  const draftId = useReviewUI((s) => s.approvalFor);
  const set = useReviewUI((s) => s.set);
  if (!draftId) return null;
  return (
    <ReviewDialog
      open
      kind="submit"
      onOpenChange={(o) => !o && set({ approvalFor: null })}
      onSubmit={(input) => {
        useDraftStore.getState().submitForReview(draftId, input.reviewerName, input.body);
        if (input.reviewerUserId) notifyReviewRequested(draftId, input.reviewerUserId, input.body || undefined);
        toast.success("Submitted for approval");
        set({ approvalFor: null });
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Back from the marketplace: /editor/:id?review=expert&expert=<id>    */
/* ------------------------------------------------------------------ */

function useRouteDraftId(): string | null {
  const { pathname } = useLocation();
  const m = matchPath({ path: "/editor/:draftId", end: false }, pathname);
  return m?.params.draftId ?? null;
}

function MarketplaceReturn() {
  const location = useLocation();
  const navigate = useNavigate();
  const draftId = useRouteDraftId();
  const openReviewPicker = useJourneyUI((s) => s.openReviewPicker);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    const params = new URLSearchParams(location.search);
    // ?review=expert (back from the marketplace) or ?review=team (the Review
    // page's "Ask your team") opens the reviewer picker on that pane.
    const kind = params.get("review");
    if (kind !== "expert" && kind !== "team") return;
    const key = `${draftId}${location.search}`;
    if (handled.current === key) return;
    handled.current = key;
    const expertId = params.get("expert") ?? undefined;
    const due = params.get("due");
    const dueAt = due && !Number.isNaN(Date.parse(due)) && Date.parse(due) > Date.now() ? new Date(due).toISOString() : undefined;
    // Only the person who can send it for review gets the dialog; a review
    // already out is left alone.
    const open = Object.values(useReviewStore.getState().requests).some(
      (r) => r.draftId === draftId && (r.status === "out" || r.status === "back")
    );
    if (!open)
      openReviewPicker(draftId, kind === "expert" ? { kind: "expert", expertId, dueAt, from: "marketplace" } : { kind: "team", from: "panel" });
    params.delete("review");
    params.delete("expert");
    params.delete("due");
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "", hash: location.hash }, { replace: true, state: location.state });
  }, [draftId, location, navigate, openReviewPicker]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  The letter on screen: sync, and "<name> sent it back"               */
/* ------------------------------------------------------------------ */

function RouteDraftWatcher() {
  const draftId = useRouteDraftId();
  const review = useOpenReview(draftId);
  const me = useMe();
  const asker = !!review && isAskerOf(review, me);
  useReviewSync(review, asker);
  // A teammate asked you on their device: fetch it so the review shows here
  // (only on letters you were invited to).
  const invited = useDraftStore((s) => {
    const email = (me.email ?? "").toLowerCase();
    return !!email && !!draftId && (s.drafts[draftId]?.collaborators ?? []).some((c) => c.email.toLowerCase() === email);
  });
  useAssignedReviews(draftId, !!me.userId && invited && !asker);

  const seen = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!review) return;
    const prev = seen.current[review.id];
    const now = `${review.status}:${review.rounds.length}`;
    seen.current[review.id] = now;
    if (!asker || !prev) return;
    if (prev.startsWith("out:") && review.status === "back") {
      toast(`${firstName(review.reviewer.name) || "Your reviewer"} sent it back`, { position: "bottom-right" });
      useReviewUI.getState().set({ justBack: { draftId: review.draftId, at: Date.now() } });
    }
  }, [review, asker]);

  return null;
}
