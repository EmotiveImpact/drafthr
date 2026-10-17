import { useEffect, useState } from "react";
import { create } from "zustand";
import type { ReviewKind } from "@/lib/journey/reviews";

/**
 * Cross-workstream UI state for the letter journey: which journey dialog is
 * open and for which letter, which side-panel tab shows, and whether a
 * letter was sent a moment ago (so the seal draws once).
 *
 * Contract (design/build/phase3/brief.md section 5). Foundation owns it.
 * Open dialogs through these actions, never through local state, so any
 * screen (the document bar, the Progress panel, the Letters list, the
 * marketplace hand-off) can open the same dialog. In memory only.
 */

export type ReviewPickerPreset = {
  /** The pane to open on: team, trusted or expert. */
  kind?: ReviewKind;
  /** expert: the marketplace profile to put at the top ("From the marketplace"). */
  expertId?: string;
  /** Back-by date, ISO 8601. */
  dueAt?: string;
  /** Where the person came from, for the back link. */
  from?: "marketplace" | "letters" | "panel" | "bar";
};

export type JourneyPanelTab = "edits" | "progress" | "chat";

type JourneyUIState = {
  /** The "Who should review this letter?" dialog. */
  reviewPicker: { draftId: string; preset?: ReviewPickerPreset } | null;
  openReviewPicker: (draftId: string, preset?: ReviewPickerPreset) => void;
  closeReviewPicker: () => void;

  /** The Send step's panel or sheet (how the employee gets it). */
  sendPanel: { draftId: string } | null;
  openSendPanel: (draftId: string) => void;
  closeSendPanel: () => void;

  /** The letter side panel's tab (Edits, Progress, Chat). */
  panelTab: JourneyPanelTab;
  setPanelTab: (tab: JourneyPanelTab) => void;

  /** The draft just marked as sent, and when: the seal draws once for it. */
  justSent: { draftId: string; at: number } | null;
  markJustSent: (draftId: string) => void;
  clearJustSent: () => void;
};

export const useJourneyUI = create<JourneyUIState>()((set) => ({
  reviewPicker: null,
  openReviewPicker: (draftId, preset) => set({ reviewPicker: { draftId, preset } }),
  closeReviewPicker: () => set({ reviewPicker: null }),

  sendPanel: null,
  openSendPanel: (draftId) => set({ sendPanel: { draftId } }),
  closeSendPanel: () => set({ sendPanel: null }),

  panelTab: "progress",
  setPanelTab: (panelTab) => set({ panelTab }),

  justSent: null,
  markJustSent: (draftId) => set({ justSent: { draftId, at: Date.now() } }),
  clearJustSent: () => set({ justSent: null }),
}));

/** How long the Send step stays on screen after sending (letter-live: 1500 ms). */
export const SEND_HOLD_MS = 1500;
/** Its fade out (letter-live: 300 ms). */
export const SEND_FADE_MS = 300;

export type SendMomentPhase = "hold" | "fade" | "next";

function sendMomentPhase(age: number): SendMomentPhase {
  return age < SEND_HOLD_MS ? "hold" : age < SEND_HOLD_MS + SEND_FADE_MS ? "fade" : "next";
}

/**
 * The send moment for a letter (letter-live): right after it is marked as
 * sent the Send step holds for 1.5 s while the seal draws ("hold"), fades
 * out ("fade"), then What's next shows ("next"). The Progress panel's
 * what-to-do line and the Sent stage both read this one clock, so they swap
 * together and the line never says "Sent. What's next" over the old Send
 * step (SEND-X36). A letter opened later is "next" straight away.
 */
export function useSendMoment(draftId: string): SendMomentPhase {
  const justSent = useJourneyUI((s) => s.justSent);
  const at = justSent && justSent.draftId === draftId ? justSent.at : null;
  const [phase, setPhase] = useState<SendMomentPhase>(() => (at === null ? "next" : sendMomentPhase(Date.now() - at)));
  useEffect(() => {
    if (at === null) {
      setPhase("next");
      return;
    }
    const age = Date.now() - at;
    setPhase(sendMomentPhase(age));
    if (age >= SEND_HOLD_MS + SEND_FADE_MS) return;
    const t1 = window.setTimeout(() => setPhase("fade"), Math.max(0, SEND_HOLD_MS - age));
    const t2 = window.setTimeout(() => setPhase("next"), Math.max(0, SEND_HOLD_MS + SEND_FADE_MS - age));
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [at]);
  return phase;
}
