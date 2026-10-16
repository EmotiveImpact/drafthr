/**
 * What the Letters page's bulk actions do to real letters: export a CSV,
 * check which letters can go for approval, and change the owner.
 */
import { format } from "date-fns";
import { useDraftStore } from "@/lib/store";
import type { LetterRowData, Person } from "./rows";
import { csvLine } from "./parts";

/** Why a letter cannot be sent for approval now, or null when it can. */
export function approvalSkipReason(r: LetterRowData): string | null {
  const j = r.journey;
  const c = j.counts;
  switch (j.stage) {
    case "sent":
      return "already sent";
    case "send":
      return "already approved";
    case "approve":
      if (r.draft.reviewStatus === "in_review") return "already with the approver";
      break;
    case "review":
      if (j.review?.status === "out") return "out for review";
      break;
  }
  if (c.streaming) return "still drafting";
  if (c.sectionsDrafted === 0) return "nothing drafted yet";
  if (c.requiredSectionsEmpty > 0) return "a required section is empty";
  if (c.failingRequired > 0) return "a required check is failing";
  return null;
}

/** "2 already sent, 1 a required check is failing" style summary of skip reasons. */
export function summariseReasons(reasons: string[]): string {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([r, n]) => `${n} ${r}`).join(", ");
}

export function lettersCsv(rows: LetterRowData[]): string {
  const head = ["Letter", "Type", "Recipient", "Matter", "Stage", "Where it is", "Health", "Updated", "Sent", "Owner", "Downloaded as", "Reviewed by"];
  const lines = rows.map((r) =>
    csvLine([
      r.label,
      r.typeLabel,
      r.recipient ?? "",
      r.matter?.name ?? "",
      r.journey.stage,
      r.journey.whereLabel,
      r.health ?? "",
      format(r.updatedAt, "yyyy-MM-dd HH:mm"),
      r.sentAt ? format(r.sentAt, "yyyy-MM-dd") : "",
      r.owner.name,
      r.formats.join("; "),
      r.reviewedBy ?? "",
    ])
  );
  return [csvLine(head), ...lines].join("\r\n") + "\r\n";
}

/**
 * Make `person` the owner of each letter. The previous owner stays on the
 * letter as an editor. Choosing yourself (no email on file) clears the owner
 * mark so the letter falls back to you.
 */
export function changeOwner(ids: string[], person: Person & { you?: boolean }): number {
  const store = useDraftStore.getState();
  let changed = 0;
  for (const id of ids) {
    const d = useDraftStore.getState().drafts[id];
    if (!d) continue;
    const collabs = d.collaborators ?? [];
    const email = person.email?.trim().toLowerCase();
    const target = email ? collabs.find((c) => c.email === email) : undefined;
    if (target?.role === "owner" && collabs.filter((c) => c.role === "owner").length === 1) continue;
    for (const c of collabs) {
      if (c.role === "owner" && c.id !== target?.id) store.updateCollaboratorRole(id, c.id, "editor");
    }
    if (email) {
      if (target) store.updateCollaboratorRole(id, target.id, "owner");
      else store.inviteCollaborator(id, email, "owner", person.name);
    }
    changed++;
  }
  return changed;
}
