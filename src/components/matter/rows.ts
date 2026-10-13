/**
 * Everything a matters list row or the matter page shows, built once per
 * matter from the store: its letters (with their journeys), people,
 * deadlines, next deadline, stage, risk and owner.
 */
import { useMemo } from "react";
import type { Draft, Matter, MatterEvent, RiskBand, Task } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { useLetterRows, useMe, type LetterRowData } from "@/components/letters/rows";
import {
  matterDeadlines,
  matterOwnerName,
  matterPeople,
  matterRef,
  matterStage,
  matterTypeLabel,
  nextDeadline,
  type DeadlineItem,
  type MatterPerson,
  type MatterStage,
} from "./model";

export type MatterRow = {
  matter: Matter;
  ref: string;
  typeLabel?: string;
  drafts: Draft[];
  letters: LetterRowData[];
  people: MatterPerson[];
  deadlines: DeadlineItem[];
  next?: DeadlineItem;
  stage: MatterStage;
  risk?: RiskBand;
  owner: string;
  tasks: Task[];
  events: MatterEvent[];
  evidenceCount: number;
};

/** Rows for the matters in the current mode (or every matter with `allModes`). */
export function useMatterRows(allModes = false): MatterRow[] {
  const matters = useDraftStore((s) => s.matters);
  const drafts = useDraftStore((s) => s.drafts);
  const employees = useDraftStore((s) => s.employees);
  const tasks = useDraftStore((s) => s.tasks);
  const events = useDraftStore((s) => s.events);
  const role = useProfileStore((s) => s.profile.role) ?? "employer";
  const me = useMe();

  const matterDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource && !!d.matterId && (allModes || d.mode === role)),
    [drafts, role, allModes]
  );
  const letterRows = useLetterRows(matterDrafts);

  return useMemo(() => {
    const byMatter = new Map<string, LetterRowData[]>();
    for (const r of letterRows) {
      const id = r.draft.matterId!;
      const list = byMatter.get(id) ?? [];
      list.push(r);
      byMatter.set(id, list);
    }
    const taskList = Object.values(tasks);
    const eventList = Object.values(events);
    return Object.values(matters)
      .filter((m) => allModes || m.mode === role)
      .map((m) => {
        const letters = byMatter.get(m.id) ?? [];
        const ds = letters.map((l) => l.draft);
        const mt = taskList.filter((t) => t.matterId === m.id);
        const me2 = eventList.filter((e) => e.matterId === m.id);
        const deadlines = matterDeadlines(m, ds, me2, mt);
        return {
          matter: m,
          ref: matterRef(m),
          typeLabel: matterTypeLabel(m.type),
          drafts: ds,
          letters,
          people: matterPeople(m, employees),
          deadlines,
          next: nextDeadline(deadlines),
          stage: matterStage(m, letters, deadlines),
          risk: effectiveRiskBand(m, ds),
          owner: matterOwnerName(m, me.name),
          tasks: mt,
          events: me2,
          evidenceCount: ds.reduce((n, d) => n + (d.evidence?.length ?? 0), 0),
        };
      });
  }, [matters, letterRows, tasks, events, employees, role, me.name, allModes]);
}
