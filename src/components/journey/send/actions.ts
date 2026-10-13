import { useDraftStore } from "@/lib/store";
import type { Draft } from "@/lib/letters/types";
import { useJourneyUI } from "@/components/journey/ui-store";
import {
  appealCloseDate,
  getSendPrefs,
  getSentRecord,
  givenByActivity,
  sentTimestampFor,
  type GivenBy,
  type SendPrefs,
  type SendWay,
  type SentRecord,
} from "./record";
import type { Attestation } from "./exports";

/**
 * The Send step's writes, through the draft store: the saved choices, the
 * sent record and its undo. The sent state stays what it always was (a
 * "marked-sent" export event), so the journey, the Letters list, the Sent
 * tab and Activity all follow it without new store actions.
 */

type Answers = Record<string, unknown>;

function draftOf(id: string): Draft | undefined {
  return useDraftStore.getState().drafts[id];
}

/** Save the Send step's choices on the letter (answers._send). */
export function saveSendPrefs(draftId: string, patch: Partial<SendPrefs>): void {
  const d = draftOf(draftId);
  if (!d) return;
  const current = getSendPrefs(d);
  const next = { ...current, ...patch };
  const answers = { ...(d.answers as Answers), _send: next };
  useDraftStore.getState().updateAnswers(draftId, answers);
}

/**
 * Save the recipient's email on the letter (the address DraftHR emails).
 * Employer letters keep it on the employee details, where the wizard puts
 * it; an employee's own letter keeps the employer's address in answers.
 */
export function saveRecipientEmail(draftId: string, email: string): void {
  const d = draftOf(draftId);
  if (!d) return;
  const value = email.trim();
  if (d.mode === "employee") {
    useDraftStore.getState().updateAnswers(draftId, { ...(d.answers as Answers), recipientEmail: value });
    return;
  }
  useDraftStore.getState().patchDraft(draftId, { employee: { email: value }, answers: { employeeEmail: value } });
}

/** Save (or clear, with null) the appeal hearing date. */
export function saveAppealHearing(draftId: string, dateOnly: string | null): void {
  const d = draftOf(draftId);
  if (!d) return;
  const answers = { ...(d.answers as Answers) };
  if (dateOnly) answers.appealHearingDate = dateOnly;
  else delete answers.appealHearingDate;
  useDraftStore.getState().updateAnswers(draftId, answers);
}

/**
 * Put a sent letter's appeal close date in the Calendar (answers.appealDeadline,
 * which the Calendar reads). Sends recorded before this existed have no date
 * stored; What's next offers "Add to calendar" for them.
 */
export function saveAppealDeadline(draftId: string, dateOnly: string): void {
  const d = draftOf(draftId);
  if (!d) return;
  const answers = { ...(d.answers as Answers), appealDeadline: dateOnly };
  const rec = (answers as Record<string, unknown>)._sent;
  if (rec && typeof rec === "object") (answers as Record<string, unknown>)._sent = { ...rec, appealDeadline: dateOnly };
  useDraftStore.getState().updateAnswers(draftId, answers);
}

export type MarkSentInput = {
  way: SendWay;
  givenBy: GivenBy;
  dateGiven: string;
  downloaded: SentRecord["downloaded"];
  attestation?: Attestation;
  emailedTo?: string;
  emailedName?: string;
  emailId?: string;
  actorName?: string;
};

/**
 * Mark the letter as sent: the "marked-sent" export event (timed at the date
 * given, with the counsel attestation when there is one), the sent record,
 * the delivery method, and the appeal window's close date for the Calendar.
 * Then the seal draws once (useJourneyUI.markJustSent).
 */
export function markLetterSent(draftId: string, input: MarkSentInput, now = new Date()): void {
  const store = useDraftStore.getState();
  const d = store.drafts[draftId];
  if (!d) return;
  const at = sentTimestampFor(input.dateGiven, now);
  store.recordExport(draftId, {
    format: "marked-sent",
    exportedAt: at,
    reviewedBy: input.attestation?.reviewedBy,
    reviewedOn: input.attestation?.reviewedOn,
  });

  const after = useDraftStore.getState().drafts[draftId];
  if (!after) return;
  const prevAnswers = after.answers as Answers;
  const close = appealCloseDate(after, input.dateGiven);
  const record: SentRecord = {
    recordedAt: now.getTime(),
    way: input.way,
    givenBy: input.way === "email" ? "email" : input.givenBy,
    dateGiven: input.dateGiven,
    downloaded: input.downloaded,
    emailedTo: input.emailedTo,
    emailedName: input.emailedName,
    emailId: input.emailId,
    appealDeadline: close ?? undefined,
    prevAppealDeadline: typeof prevAnswers.appealDeadline === "string" ? prevAnswers.appealDeadline : null,
  };
  const answers: Answers = {
    ...prevAnswers,
    _sent: record,
    _send: { ...getSendPrefs(after), way: input.way, givenBy: input.givenBy, dateGiven: input.dateGiven },
  };
  if (close) answers.appealDeadline = close;

  useDraftStore.setState((s) => {
    const cur = s.drafts[draftId];
    if (!cur) return s;
    return {
      drafts: {
        ...s.drafts,
        [draftId]: {
          ...cur,
          answers,
          context: { ...cur.context, deliveryMethod: record.givenBy },
          updatedAt: Date.now(),
        },
      },
    };
  });
  useDraftStore.getState().recordTimelineEvent(draftId, {
    kind: "details_updated",
    title: givenByActivity(record.givenBy, record.way, record.emailedName),
    actorName: input.actorName,
    createdAt: at,
    meta: { action: "sent", way: record.way, givenBy: record.givenBy, dateGiven: record.dateGiven, emailedTo: record.emailedTo },
  });
  useJourneyUI.getState().markJustSent(draftId);
}

/**
 * Undo "marked as sent": the letter goes back to the Send step with the same
 * choices. The marked-sent events go, the appeal date the send added leaves
 * the Calendar (the earlier value comes back), the hearing date is cleared
 * (it only applies to a sent letter), and Activity records the undo. The
 * downloads already made stay in Activity. Returns false when there was
 * nothing to undo; `emailed` says whether an email had already gone.
 */
export function undoMarkedSent(draftId: string, actorName?: string): { undone: boolean; emailed: boolean; to?: string } {
  const st = useDraftStore.getState();
  const d = st.drafts[draftId];
  if (!d) return { undone: false, emailed: false };
  const removed = (d.exports ?? []).filter((e) => e.format === "marked-sent");
  if (removed.length === 0) return { undone: false, emailed: false };
  const rec = getSentRecord(d);
  const answers = { ...(d.answers as Answers) };
  delete answers._sent;
  delete answers.appealHearingDate;
  if (rec) {
    if (typeof rec.prevAppealDeadline === "string") answers.appealDeadline = rec.prevAppealDeadline;
    else if (rec.appealDeadline && answers.appealDeadline === rec.appealDeadline) delete answers.appealDeadline;
  }
  useDraftStore.setState((s) => {
    const cur = s.drafts[draftId];
    if (!cur) return s;
    return {
      drafts: {
        ...s.drafts,
        [draftId]: {
          ...cur,
          answers,
          exports: (cur.exports ?? []).filter((e) => e.format !== "marked-sent"),
          updatedAt: Date.now(),
        },
      },
    };
  });
  useDraftStore.getState().recordTimelineEvent(draftId, {
    kind: "details_updated",
    title: "Marked as not sent",
    detail: rec?.way === "email" && rec.emailedTo ? `The email to ${rec.emailedTo} had already gone` : undefined,
    actorName,
    meta: { action: "unmarked-sent" },
  });
  useJourneyUI.getState().clearJustSent();
  return { undone: true, emailed: rec?.way === "email", to: rec?.emailedName || rec?.emailedTo };
}

/** The toast line after Undo. */
export function undoToastText(result: { emailed: boolean; to?: string }): string {
  return result.emailed
    ? `Back to ready to send. The email has already gone to ${result.to ?? "the recipient"}; only DraftHR's record has changed.`
    : "Back to ready to send.";
}
