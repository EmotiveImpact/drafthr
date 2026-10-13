import { useEffect, useMemo, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ds/Pill";
import { PersonCard } from "@/components/journey/ui";
import { useJourney } from "@/lib/journey/stage";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useBookingsStore } from "@/lib/bookings";
import { canApprove, canEditDraft, canSubmitForReview } from "@/lib/permissions";
import { uid } from "@/lib/utils";
import type { Draft } from "@/lib/letters/types";
import {
  currentRound,
  firstName,
  useNewestReview,
  useReviewStore,
  type ReviewRequest,
  type ReviewVerdict,
} from "@/lib/journey/reviews";
import { useJourneyUI } from "@/components/journey/ui-store";
import {
  AskerMessages,
  BackCard,
  BackFooter,
  BellHint,
  OutCard,
  PointsList,
  ReadyChecklist,
  reviewerSubline,
  usePaymentsOn,
} from "@/components/journey/review/parts";
import {
  bookingFor,
  isAskerOf,
  isReviewerOf,
  sharedEvidence,
  skipReviewTo,
  useMe,
  type Me,
} from "@/components/journey/review/actions";
import { openRoundsHistory, openSendBack, requestApproval, requestFinishReview, useReviewerMode } from "@/components/journey/review/review-ui";
import { useDefaultApprover, useTeammates } from "@/components/journey/review/people";
import { collectReviewerWork, fmtTime } from "@/components/journey/review/model";
import {
  ReviewerModeSwitch,
  SelectionBubble,
  YourReviewPanel,
  changeKind,
  suggestionTitle,
  useLetterSelection,
  type MyPoint,
} from "@/components/journey/review/reviewer";
import { CommentComposer, SuggestComposer } from "@/components/journey/review/Composers";
import { actAsTeammate } from "@/components/journey/review/trusted-api";

/**
 * Review step of the Progress panel (mocks f2, f3, f5, f4 for a teammate):
 *   ready      the checklist, "Send for review" and "Skip review"
 *   out        the reviewer card with its live timeline and the thread
 *   back       the verdict, "<N> to decide", Send back and Finish review
 *   reviewer   a teammate's own view ("Your review") when they are the
 *              named reviewer
 * Props are fixed: { draftId }. Dialogs open through useJourneyUI and the
 * review UI store; ReviewDialogsHost renders them.
 */
export function ReviewStage({ draftId }: { draftId: string }) {
  const journey = useJourney(draftId);
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const newest = useNewestReview(draftId);
  const me = useMe();
  const role = useProfileStore((s) => s.profile.workspaceRole);
  if (!journey || !draft || draft.isTemplateSource) return null;
  const review = journey.review && (journey.review.status === "out" || journey.review.status === "back") ? journey.review : null;

  // The named teammate sees their own review, not the author's controls.
  const forMe = newest && newest.kind === "team" && isReviewerOf(newest, me) && !isAskerOf(newest, me) ? newest : null;
  if (forMe && (forMe.status === "out" || forMe.status === "back" || forMe.status === "recalled")) {
    return <TeammateReview draft={draft} review={forMe} me={me} role={role} />;
  }

  if (review?.status === "out") return <OutState draft={draft} review={review} me={me} />;
  if (review?.status === "back") return <BackState draft={draft} review={review} me={me} role={role} />;
  return (
    <ReadyState
      draft={draft}
      last={newest?.status === "recalled" ? newest : null}
      checksTotal={journey.counts.checksTotal}
      checksPassing={journey.counts.checksPassing}
      blocked={journey.primaryAction?.id === "send-for-review" && journey.primaryAction.disabled ? journey.primaryAction.reason : undefined}
      role={role}
      me={me}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Ready for review (f2)                                              */
/* ------------------------------------------------------------------ */

const VIEWER_REASON = "Viewers can't send letters for review.";

function ReadyState({
  draft,
  last,
  checksTotal,
  checksPassing,
  blocked,
  role,
  me,
}: {
  draft: Draft;
  last: ReviewRequest | null;
  checksTotal: number;
  checksPassing: number;
  blocked?: string;
  role: ReturnType<typeof useProfileStore.getState>["profile"]["workspaceRole"];
  me: Me;
}) {
  const openReviewPicker = useJourneyUI((s) => s.openReviewPicker);
  const allowed = canSubmitForReview(role);
  const reason = !allowed ? VIEWER_REASON : blocked;
  const usual = useDefaultApprover();
  const team = useTeammates(draft, me.email, allowed && draft.mode !== "employee");
  const firstApprover = team.people.find((p) => p.canApprove && p.userId);
  const approverName = usual ?? firstApprover?.name ?? null;
  const approverUserId =
    team.people.find((p) => approverName && p.name.trim().toLowerCase() === approverName.trim().toLowerCase())?.userId ??
    (approverName === firstApprover?.name ? firstApprover?.userId : undefined);

  return (
    <div className="flex flex-col gap-3" data-testid="review-stage" data-state="ready">
      {last && <LastReviewLine review={last} canAct={allowed} />}
      <ReadyChecklist draft={draft} checksTotal={checksTotal} checksPassing={checksPassing} />
      <div className="mt-1 flex flex-col gap-2">
        <Button
          className="h-10 w-full text-[13.5px]"
          disabled={!!reason}
          title={reason}
          onClick={() => openReviewPicker(draft.id, { from: "panel" })}
          data-testid="review-send-for-review"
        >
          <Eye className="size-[15px]" strokeWidth={1.7} />
          Send for review
        </Button>
        <Button
          variant="outline"
          className="h-10 w-full text-[13.5px]"
          disabled={!allowed}
          title={!allowed ? VIEWER_REASON : undefined}
          onClick={() => (approverName ? skipReviewTo(draft.id, { name: approverName, userId: approverUserId }) : requestApproval(draft.id))}
          data-testid="review-skip"
        >
          {approverName ? `Skip review, ask ${firstName(approverName)} to approve` : "Skip review, ask for approval"}
        </Button>
        {reason && <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">{reason}</p>}
      </div>
    </div>
  );
}

/** The review that ended without finishing: recalled, or the expert declined. */
function LastReviewLine({ review, canAct }: { review: ReviewRequest; canAct: boolean }) {
  const openReviewPicker = useJourneyUI((s) => s.openReviewPicker);
  const who = review.reviewer.name || "the reviewer";
  if (review.declinedAt) {
    return (
      <PersonCard
        name={review.reviewer.name || "The expert"}
        role={reviewerSubline(review)}
        seed={review.reviewer.consultantId ?? review.reviewer.name}
        pill={<Pill tone="grey">Declined</Pill>}
      >
        <p className="m-0 mt-2 text-[13px] leading-[1.5] text-[var(--ds-body)]">
          {review.declineReason?.trim() ? review.declineReason.trim() : `${firstName(who)} couldn't take this one on.`} You haven't been charged.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={!canAct}
          onClick={() => openReviewPicker(review.draftId, { kind: "expert", from: "panel" })}
          data-testid="review-choose-another"
        >
          Choose another expert
        </Button>
      </PersonCard>
    );
  }
  if (!review.recalledAt) return null;
  return (
    <p className="m-0 flex items-start gap-2 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]" data-testid="review-recalled">
      <RotateCcw aria-hidden className="mt-px size-3.5 shrink-0 text-[var(--ds-subtle)]" strokeWidth={1.7} />
      <span>
        Recalled from {who} at {fmtTime(review.recalledAt)}. {review.kind === "trusted" ? "Their link no longer works." : "They can no longer open it."}
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Out for review (f3)                                                */
/* ------------------------------------------------------------------ */

function OutState({ draft, review, me }: { draft: Draft; review: ReviewRequest; me: Me }) {
  const bookings = useBookingsStore((s) => s.bookings);
  const booking = bookingFor(review, bookings);
  const paymentsOn = usePaymentsOn(review.kind === "expert");
  const asker = isAskerOf(review, me);
  const askerFirst = firstName(review.asker?.name) || "The person who asked";
  return (
    <div className="flex flex-col gap-3" data-testid="review-stage" data-state="out">
      <OutCard review={review} booking={booking} draft={draft} paymentsOn={asker ? paymentsOn : false} />
      {asker ? (
        <>
          <AskerMessages review={review} booking={booking} me={me} draftId={draft.id} />
          <BellHint expert={review.kind === "expert"} />
        </>
      ) : (
        <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">
          {askerFirst} sent this for review. Only they can recall it or message {firstName(review.reviewer.name) || "the reviewer"}.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Back to you (f5)                                                   */
/* ------------------------------------------------------------------ */

function BackState({
  draft,
  review,
  me,
  role,
}: {
  draft: Draft;
  review: ReviewRequest;
  me: Me;
  role: ReturnType<typeof useProfileStore.getState>["profile"]["workspaceRole"];
}) {
  const asker = isAskerOf(review, me);
  const canDecide = asker && canEditDraft(role, draft.reviewStatus);
  const reason = !asker
    ? `Only ${firstName(review.asker?.name) || "the person who asked"} can decide on these points.`
    : !canDecide
      ? "Viewers can't change the letter."
      : undefined;
  return (
    <div className="flex flex-col gap-3" data-testid="review-stage" data-state="back">
      <BackCard review={review} />
      <PointsList review={review} draft={draft} canDecide={canDecide} me={me} />
      <BackFooter
        disabled={!canDecide}
        reason={reason}
        onSendBack={() => openSendBack(draft.id)}
        onFinish={() => requestFinishReview(draft.id)}
      />
      {reason && <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">{reason}</p>}
      {review.rounds.length > 1 && (
        <button
          type="button"
          onClick={() => openRoundsHistory(draft.id)}
          className="self-start text-[12.5px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px]"
          data-testid="review-see-rounds"
        >
          See all {review.rounds.length} rounds
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  A teammate's own view (f4, in the app)                             */
/* ------------------------------------------------------------------ */

type Composer =
  | { kind: "suggest"; sectionId: string; quote?: string; editId?: string }
  | { kind: "comment"; sectionId: string; quote?: string; editId?: string; body?: string };

function TeammateReview({
  draft,
  review,
  me,
  role,
}: {
  draft: Draft;
  review: ReviewRequest;
  me: Me;
  role: ReturnType<typeof useProfileStore.getState>["profile"]["workspaceRole"];
}) {
  const round = currentRound(review);
  const store = useReviewStore.getState;
  const [mode, setMode] = useReviewerMode(draft.id);
  const open = review.status === "out";
  const canWork = open && role !== "viewer";
  const [composer, setComposer] = useState<Composer | null>(null);
  const [busy, setBusy] = useState(false);
  const askerName = review.asker?.name || "The person who asked";
  const askerFirst = firstName(askerName) || "them";

  // Opening it shows "<name> opened it" on the asker's card.
  useEffect(() => {
    if (review.status !== "out" || !round) return;
    const seen = review.events?.some((e) => e.kind === "opened" && e.at >= round.sentAt);
    if (seen) return;
    store().logEvent(review.id, "opened");
    if (!review.openedAt) store().updateReview(review.id, { openedAt: Date.now() });
    if (review.trustedLinkId) void actAsTeammate(review.trustedLinkId, { action: "opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.id, review.status, round?.n]);

  const work = useMemo(
    () => (round ? collectReviewerWork(draft, review.reviewer, round.sentAt) : null),
    [draft, review.reviewer, round]
  );
  const points: MyPoint[] = useMemo(() => {
    if (!work) return [];
    return work.points.map((p) => {
      const section = draft.sections.find((s) => s.id === p.sectionId);
      if (p.kind === "suggestion") {
        const pc = section?.pendingChange;
        const before = pc?.prevHtml ?? section?.html ?? "";
        const after = pc?.proposedHtml ?? "";
        return {
          id: p.id,
          kind: "suggestion",
          sectionId: p.sectionId ?? "",
          title: p.title,
          where: section?.title ?? "Letter",
          change: changeKind(before, after),
          note: pc?.instruction,
          proposedHtml: after,
        };
      }
      const c = draft.comments?.find((x) => x.id === p.id);
      return {
        id: p.id,
        kind: "comment",
        sectionId: p.sectionId ?? "",
        title: p.title,
        where: section?.title ?? "Letter",
        change: "comment",
        note: c?.body,
        quote: c?.quote,
      };
    });
  }, [work, draft.sections, draft.comments]);

  const anchor = useLetterSelection(canWork && mode !== "read");
  const section = composer ? draft.sections.find((s) => s.id === composer.sectionId) : undefined;
  const editing = composer?.kind === "suggest" && composer.editId ? section?.pendingChange : undefined;

  const author = { authorId: me.email || me.name, authorName: me.name };

  const proposeSuggestion = (sectionId: string, proposedHtml: string, note?: string, editId?: string) => {
    const ds = useDraftStore.getState();
    const s = ds.drafts[draft.id]?.sections.find((x) => x.id === sectionId);
    if (!s) return;
    if (s.pendingChange && s.pendingChange.id !== editId) {
      toast.error("This section already has a pending suggestion. Resolve it first.");
      return;
    }
    const before = s.pendingChange?.prevHtml ?? s.html ?? "";
    if (editId) ds.rejectSectionPending(draft.id, sectionId);
    ds.proposeSectionChange(draft.id, sectionId, {
      id: uid("sug"),
      createdAt: Date.now(),
      proposedHtml,
      instruction: note?.trim() || suggestionTitle(before, proposedHtml),
      source: "review",
      ...author,
      diffViewMode: "inline",
    });
    toast(`Suggestion added. ${askerFirst} accepts or rejects it.`);
  };

  const addComment = (sectionId: string, body: string, quote?: string) => {
    useDraftStore.getState().addComment(draft.id, {
      sectionId,
      ...author,
      authorEmail: me.email,
      authorUserId: me.userId,
      body,
      quote,
    });
  };

  const removePoint = (p: MyPoint) => {
    const ds = useDraftStore.getState();
    if (p.kind === "suggestion") ds.rejectSectionPending(draft.id, p.sectionId);
    else ds.deleteComment(draft.id, p.id);
  };

  const sendBack = async (verdict: ReviewVerdict, note: string, approve: boolean): Promise<boolean> => {
    if (!round || review.status !== "out" || busy) return false;
    setBusy(true);
    try {
      const w = collectReviewerWork(useDraftStore.getState().drafts[draft.id] ?? draft, review.reviewer, round.sentAt);
      if (approve) {
        store().updateReview(review.id, { approvedAt: Date.now() });
        store().logEvent(review.id, "approved");
      }
      store().markBack(review.id, {
        verdict,
        note: note || undefined,
        suggestionIds: w.suggestionIds,
        commentIds: w.commentIds,
        points: w.points,
      });
      if (review.trustedLinkId) {
        if (approve) await actAsTeammate(review.trustedLinkId, { action: "approve" });
        await actAsTeammate(review.trustedLinkId, {
          action: "send-back",
          verdict,
          note: note || undefined,
          points: w.points.map(({ id, kind, sectionId, title, where }) => ({ id, kind, sectionId, title, where })),
        });
      }
      toast(approve ? `Sent back and approved. ${askerFirst} can finish the review.` : `Sent back to ${askerFirst}`);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const onMessage = async (text: string) => {
    const id = store().addMessage(review.id, { from: "reviewer", name: me.name, body: text });
    if (!id) return false;
    if (review.trustedLinkId) void actAsTeammate(review.trustedLinkId, { action: "message", text, id });
    return true;
  };

  const showPoint = (p: MyPoint) => {
    const el =
      document.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(p.id)}"]`) ??
      document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(p.sectionId)}"]`) ??
      document.querySelector<HTMLElement>(`[data-section-anchor="${CSS.escape(p.sectionId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const evidence = useMemo(() => sharedEvidence(draft, review.share), [draft, review.share]);

  return (
    <div className="flex flex-col gap-3" data-testid="review-stage" data-state="reviewer">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">Your review</h3>
        {open && <ReviewerModeSwitch mode={mode} onChange={setMode} disabled={!canWork} compact />}
      </div>
      {open && mode !== "read" && (
        <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">
          {mode === "suggest"
            ? `Suggesting · ${askerFirst} accepts or rejects. Select words in the letter to suggest new wording.`
            : "Select words in the letter to comment on them."}
        </p>
      )}
      <YourReviewPanel
        asker={{ name: askerName, email: review.asker?.email }}
        me={me}
        ask={review.ask}
        round={round?.n ?? 1}
        question={round?.question}
        status={review.status}
        sentBackAt={round?.backAt}
        points={points}
        messages={(review.messages ?? []).map((m) => ({
          id: m.id,
          mine: m.from === "reviewer",
          name: m.from === "reviewer" ? "You" : firstName(m.name) || askerFirst,
          body: m.body,
          at: m.at,
        }))}
        evidence={evidence}
        canApprove={!!review.approveInSameStep && canApprove(role)}
        approved={!!review.approvedAt}
        busy={busy || !canWork}
        onMessage={onMessage}
        onShowPoint={showPoint}
        onEditPoint={
          canWork
            ? (p) =>
                p.kind === "suggestion"
                  ? setComposer({ kind: "suggest", sectionId: p.sectionId, editId: p.id })
                  : setComposer({ kind: "comment", sectionId: p.sectionId, quote: p.quote, editId: p.id, body: p.note })
            : undefined
        }
        onRemovePoint={removePoint}
        onSendBack={sendBack}
      />

      {canWork && (
        <SelectionBubble
          anchor={anchor}
          mode={mode}
          onSuggest={(a) => setComposer({ kind: "suggest", sectionId: a.sectionId, quote: a.quote })}
          onComment={(a) => setComposer({ kind: "comment", sectionId: a.sectionId, quote: a.quote })}
        />
      )}
      {composer?.kind === "suggest" && section && (
        <SuggestComposer
          open
          onOpenChange={(o) => !o && setComposer(null)}
          sectionTitle={section.title}
          html={editing?.proposedHtml ?? section.html ?? ""}
          quote={composer.quote}
          initialNote={editing && editing.instruction !== suggestionTitle(editing.prevHtml ?? "", editing.proposedHtml) ? editing.instruction : undefined}
          onSubmit={(html, note) => proposeSuggestion(section.id, html, note, composer.editId)}
        />
      )}
      {composer?.kind === "comment" && section && (
        <CommentComposer
          open
          onOpenChange={(o) => !o && setComposer(null)}
          sectionTitle={section.title}
          quote={composer.quote}
          initialBody={composer.body}
          onSubmit={(body) => {
            if (composer.editId) useDraftStore.getState().deleteComment(draft.id, composer.editId);
            addComment(section.id, body, composer.quote);
          }}
        />
      )}
    </div>
  );
}
