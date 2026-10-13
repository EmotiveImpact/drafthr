import { useCallback, useRef } from "react";
import { create } from "zustand";
import { useJourneyUI } from "@/components/journey/ui-store";

/**
 * The review loop's own small dialogs (confirm Recall, confirm Finish
 * review, the Send back composer, the rounds history) and the reply-box
 * focus request. ReviewDialogsHost renders them; any screen opens them
 * through these functions (the document bar's Recall and Finish review,
 * the notice strip's Message link, the Approve stage's "See all rounds").
 * In memory only.
 */
type ReviewUIState = {
  recallFor: string | null;
  finishFor: string | null;
  sendBackFor: string | null;
  roundsFor: string | null;
  /** Skip review with no usual approver: the approval dialog to pick one. */
  approvalFor: string | null;
  /** Bumped to ask the reply box of a draft to scroll into view and focus. */
  replyFocus: { draftId: string; n: number } | null;
  /** A review just came back while the letter was open (the avatar's tick). */
  justBack: { draftId: string; at: number } | null;
  /** The reviewer's Read / Suggest / Comment switch, per letter or link. */
  reviewerMode: Record<string, ReviewerMode>;
  /** A teammate reviewer's suggestion or comment box (V1), opened from the
   *  page, a margin card or Your review; ReviewDialogsHost renders it. */
  teammateComposer: TeammateComposer | null;
  set: (patch: Partial<Omit<ReviewUIState, "set">>) => void;
};

export type ReviewerMode = "read" | "suggest" | "comment";

export type TeammateComposer = {
  draftId: string;
  kind: "suggest" | "comment";
  sectionId: string;
  quote?: string;
  /** Editing one of the reviewer's own points (its id). */
  editId?: string;
  /** The comment's current words, when editing a comment. */
  body?: string;
};

export function openTeammateComposer(c: TeammateComposer): void {
  useReviewUI.getState().set({ teammateComposer: c });
}

/** The reviewer's mode for a letter (the document bar and the panel share it). */
export function useReviewerMode(key: string): [ReviewerMode, (m: ReviewerMode) => void] {
  const mode = useReviewUI((s) => s.reviewerMode[key] ?? "suggest");
  const setMode = (m: ReviewerMode) =>
    useReviewUI.getState().set({ reviewerMode: { ...useReviewUI.getState().reviewerMode, [key]: m } });
  return [mode, setMode];
}

export const useReviewUI = create<ReviewUIState>()((set) => ({
  recallFor: null,
  finishFor: null,
  sendBackFor: null,
  roundsFor: null,
  approvalFor: null,
  replyFocus: null,
  justBack: null,
  reviewerMode: {},
  teammateComposer: null,
  set: (patch) => set(patch),
}));

/* What was typed in the reviewer dialog, kept for the trip to the
   marketplace and back (this tab only). */
export type PickerForm = {
  ask: string;
  dueAt: string;
  share: { evidence: boolean; hearingNotes: boolean };
};

const FORM_KEY = "drafthr.review-picker-form.v1";

export function savePickerForm(draftId: string, form: PickerForm): void {
  try {
    const all = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}") as Record<string, PickerForm>;
    all[draftId] = form;
    sessionStorage.setItem(FORM_KEY, JSON.stringify(all));
  } catch {
    // Private mode or storage off: the dialog starts fresh, which is fine.
  }
}

export function readPickerForm(draftId: string): PickerForm | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}") as Record<string, PickerForm>;
    return all[draftId] ?? null;
  } catch {
    return null;
  }
}

export function clearPickerForm(draftId: string): void {
  try {
    const all = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}") as Record<string, PickerForm>;
    delete all[draftId];
    sessionStorage.setItem(FORM_KEY, JSON.stringify(all));
  } catch {
    // Nothing to clear.
  }
}

/** Ask to recall the review out on a draft (opens the confirm dialog). */
export function requestRecall(draftId: string): void {
  useReviewUI.getState().set({ recallFor: draftId });
}

/** Finish the review on a draft: at once when nothing is left to decide,
 *  else a confirm dialog says how many points are left. */
export function requestFinishReview(draftId: string): void {
  useReviewUI.getState().set({ finishFor: draftId });
}

/** Open the "Send back to <name>" composer. */
export function openSendBack(draftId: string): void {
  useReviewUI.getState().set({ sendBackFor: draftId });
}

/** Open the rounds history ("How the review went"). */
export function openRoundsHistory(draftId: string): void {
  useReviewUI.getState().set({ roundsFor: draftId });
}

/** Skip review and pick who approves (the existing approval dialog). */
export function requestApproval(draftId: string): void {
  useReviewUI.getState().set({ approvalFor: draftId });
}

/** Show the Progress tab and focus the reply box (the notice strip's "Message"). */
export function focusReviewReply(draftId: string): void {
  useJourneyUI.getState().setPanelTab("progress");
  const prev = useReviewUI.getState().replyFocus;
  useReviewUI.getState().set({ replyFocus: { draftId, n: (prev?.n ?? 0) + 1 } });
}

/**
 * Focus back to what opened a dialog. The review dialogs open through the
 * stores, not a Radix trigger, so Radix has nothing to return focus to and
 * it fell to <body> (REVIEW-09). The element that had focus when the dialog
 * first rendered is the opener (the "Send for review", Recall or Finish
 * review button); when it has gone or is disabled (the button changed with
 * the stage), the document bar's main action takes focus instead.
 * Pass the result as the dialog's onCloseAutoFocus.
 */
export function useReturnFocus(open: boolean): (e: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body && !a.closest("[role=dialog]") ? a : null;
  }
  wasOpen.current = open;
  return useCallback((e: Event) => {
    e.preventDefault();
    const el = opener.current;
    opener.current = null;
    const usable = (x: HTMLElement | null): x is HTMLElement =>
      !!x && x.isConnected && !x.matches(":disabled") && !x.closest("[role=dialog]") && x.getClientRects().length > 0;
    const target = usable(el)
      ? el
      : Array.from(
          document.querySelectorAll<HTMLElement>('[data-journey-action], [data-testid="review-send-for-review"], [data-testid="review-finish"]')
        ).find(usable);
    target?.focus({ preventScroll: true });
  }, []);
}
