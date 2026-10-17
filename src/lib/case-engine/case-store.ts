import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CaseEvent, FactValue, Jurisdiction, Lens, SituationId } from "./types.js";

/**
 * Cases opened through the interview. Each case is its append-only history;
 * the case file is rebuilt from it on every render (see history.ts).
 *
 * Kept in this browser for now, like the app's letters before they sync.
 * A server copy comes with Ask someone, which needs one anyway.
 */

export type StoredCase = {
  id: string;
  /** Short reference shown on the case file, for example "DR-2026-003". */
  ref: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  events: CaseEvent[];
  /** Questions the user chose to leave for now. Asked again at the end. */
  skipped: string[];
  /** The interview step the user last saw, so a reload lands in the same place. */
  stage: "story" | "reading" | "heard" | "questions" | "plan";
};

type CaseState = {
  cases: Record<string, StoredCase>;
  openCase: (input: {
    situation: SituationId;
    lens: Lens;
    jurisdiction: Jurisdiction;
    createdBy: string;
  }) => string;
  append: (id: string, events: CaseEvent[]) => void;
  setStage: (id: string, stage: StoredCase["stage"]) => void;
  skip: (id: string, key: string) => void;
  unskip: (id: string, key: string) => void;
  removeCase: (id: string) => void;
};

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nextRef(cases: Record<string, StoredCase>, year: number): string {
  const prefix = `DR-${year}-`;
  const used = Object.values(cases)
    .map((c) => (c.ref.startsWith(prefix) ? Number(c.ref.slice(prefix.length)) : 0))
    .filter((n) => Number.isFinite(n));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export const useCaseStore = create<CaseState>()(
  persist(
    (set, get) => ({
      cases: {},
      openCase: ({ situation, lens, jurisdiction, createdBy }) => {
        const id = `case_${newEventId().replace(/-/g, "").slice(0, 16)}`;
        const now = Date.now();
        const opened: CaseEvent = {
          id: newEventId(),
          at: new Date(now).toISOString(),
          actor: "user",
          type: "case_opened",
          situation,
          lens,
          jurisdiction,
        };
        const stored: StoredCase = {
          id,
          ref: nextRef(get().cases, new Date(now).getFullYear()),
          createdAt: now,
          updatedAt: now,
          createdBy,
          events: [opened],
          skipped: [],
          stage: "story",
        };
        set((s) => ({ cases: { ...s.cases, [id]: stored } }));
        return id;
      },
      append: (id, events) =>
        set((s) => {
          const c = s.cases[id];
          if (!c || events.length === 0) return s;
          return { cases: { ...s.cases, [id]: { ...c, events: [...c.events, ...events], updatedAt: Date.now() } } };
        }),
      setStage: (id, stage) =>
        set((s) => {
          const c = s.cases[id];
          if (!c || c.stage === stage) return s;
          return { cases: { ...s.cases, [id]: { ...c, stage, updatedAt: Date.now() } } };
        }),
      skip: (id, key) =>
        set((s) => {
          const c = s.cases[id];
          if (!c || c.skipped.includes(key)) return s;
          return { cases: { ...s.cases, [id]: { ...c, skipped: [...c.skipped, key] } } };
        }),
      unskip: (id, key) =>
        set((s) => {
          const c = s.cases[id];
          if (!c) return s;
          return { cases: { ...s.cases, [id]: { ...c, skipped: c.skipped.filter((k) => k !== key) } } };
        }),
      removeCase: (id) =>
        set((s) => {
          const next = { ...s.cases };
          delete next[id];
          return { cases: next };
        }),
    }),
    {
      name: "drafthr.cases.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Events for one answer: the question, then the user's fact. */
export function answerEvents(key: string, question: string, value: FactValue): CaseEvent[] {
  const at = new Date().toISOString();
  const asked: CaseEvent = { id: newEventId(), at, actor: "engine", type: "question_asked", factKey: key, question };
  return [
    asked,
    {
      id: newEventId(),
      at,
      actor: "user",
      type: "fact_recorded",
      key,
      value,
      source: { kind: "answer", eventId: asked.id, questionKey: key },
    },
  ];
}
