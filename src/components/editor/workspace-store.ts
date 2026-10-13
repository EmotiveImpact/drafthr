import { create } from "zustand";
import type { HealthCheck } from "@/lib/finalize/healthChecks";
import type { ReviewDialogKind } from "./ReviewDialog";

/**
 * The letter workspace's own handlers, registered by the Editor route so the
 * stage components (DraftStage, ApproveStage) and the health card can reach
 * the same actions as the document bar without new props on the journey
 * contracts. In memory only; cleared when the workspace unmounts.
 *
 * Each handler is optional: a stage rendered outside the workspace (for
 * example on another screen) falls back to links.
 */
export type WorkspaceHandlers = {
  /** Open the Edits tab (optionally on the Comments filter). */
  openEdits: (filter?: "edits" | "comments") => void;
  openEvidence: () => void;
  /** Ask DraftHR (or route) to fix one health check. */
  fixCheck: (check: HealthCheck) => void;
  regenerateAll: () => void;
  stop: () => void;
  openReviewDialog: (kind: ReviewDialogKind) => void;
  withdraw: () => void;
  openCounsel: () => void;
  openFeedback: () => void;
  openVersions: () => void;
  openTimeline: () => void;
  openChecks: () => void;
  /** Send a prompt to DraftHR (Chat tab opens with the reply). */
  ask: (prompt: string) => void;
  /** Scroll the page to a section. */
  jumpToSection: (sectionId: string) => void;
  finalise: () => void;
  /** The review rounds history (Activity). */
  openRounds: () => void;
  /** Send for review, the same from the bar and the panel: the evidence
   *  check first when evidence is unused or thin, then the reviewer picker. */
  sendForReview: (from: "bar" | "panel") => void;
};

export type WorkspaceState = {
  draftId: string | null;
  handlers: Partial<WorkspaceHandlers>;
  /** DraftHR is writing (whole letter). */
  streaming: boolean;
  /** The person can edit the page right now. */
  canEdit: boolean;
  counselNeeded: boolean;
  counselReview: { reviewedBy: string; reviewedOn: string } | null;
  /** Health checks being fixed by DraftHR right now (check id). */
  fixing: Record<string, number>;
  /** Category for the next DraftHR card on a section, set by a Fix. */
  fixCategory: Record<string, { category: string; at: number }>;
  register: (draftId: string, patch: Partial<Omit<WorkspaceState, "register" | "reset" | "setFixing" | "setFixCategory">>) => void;
  reset: (draftId: string) => void;
  setFixing: (checkId: string, on: boolean) => void;
  setFixCategory: (sectionId: string, category: string) => void;
};

export const useLetterWorkspace = create<WorkspaceState>()((set) => ({
  draftId: null,
  handlers: {},
  streaming: false,
  canEdit: false,
  counselNeeded: false,
  counselReview: null,
  fixing: {},
  fixCategory: {},
  register: (draftId, patch) =>
    set((s) => ({
      ...patch,
      draftId,
      // A different letter starts clean.
      fixing: s.draftId === draftId ? s.fixing : {},
      fixCategory: s.draftId === draftId ? s.fixCategory : {},
    })),
  reset: (draftId) =>
    set((s) =>
      s.draftId === draftId
        ? { draftId: null, handlers: {}, streaming: false, canEdit: false, fixing: {}, fixCategory: {} }
        : s
    ),
  setFixing: (checkId, on) =>
    set((s) => {
      const fixing = { ...s.fixing };
      if (on) fixing[checkId] = Date.now();
      else delete fixing[checkId];
      return { fixing };
    }),
  setFixCategory: (sectionId, category) =>
    set((s) => ({ fixCategory: { ...s.fixCategory, [sectionId]: { category, at: Date.now() - 1 } } })),
}));

/** The workspace handlers for this draft, or an empty set elsewhere. */
export function useWorkspaceFor(draftId: string): WorkspaceState | null {
  const ws = useLetterWorkspace();
  return ws.draftId === draftId ? ws : null;
}
