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
