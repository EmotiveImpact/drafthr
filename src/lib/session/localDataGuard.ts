/**
 * Warn before a sign-out (or a failed workspace stash) destroys data that
 * exists only on this device.
 *
 * Employees, tasks, calendar events, saved templates and evidence files never
 * sync. Drafts and matters sync only when dual-write is on, and even then a
 * draft can hold edits the server hasn't accepted yet (or be a local-only
 * conflicted copy). Wiping local storage used to destroy all of that without a
 * word; now the user sees what would be lost and can download a backup first.
 */
import { useDraftStore } from "@/lib/store";
import { isDualWriteEnabled } from "@/lib/dual-write";
import { hasUnsyncedChanges } from "@/lib/sync-meta";
import { flushPendingWrites } from "@/lib/storage/quota-safe-storage";
import {
  LOCAL_OWNER_KEY,
  TENANT_SCOPED_PERSIST_KEYS,
  TENANT_SCOPED_SYNC_KEYS,
  readLocalOwner,
  stashedNamespaces,
} from "./clearLocalData";
import type { Draft } from "@/lib/letters/types";

export type LocalDataItem = { label: string; count: number };

export type LocalDataSummary = {
  items: LocalDataItem[];
  /** Other workspaces whose data is kept on this device (stashed). */
  otherWorkspaces: number;
};

type SummaryInput = {
  drafts: Record<string, Draft>;
  matters: Record<string, unknown>;
  employees: Record<string, unknown>;
  tasks: Record<string, unknown>;
  events: Record<string, unknown>;
  customTemplates: Record<string, unknown>;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What exists only on this device, given the store state. Pure for tests. */
export function summariseLocalOnlyData(
  state: SummaryInput,
  opts: { dualWrite: boolean; unsynced: (d: Draft) => boolean; otherWorkspaces?: number },
): LocalDataSummary {
  const drafts = Object.values(state.drafts);
  const localDrafts = opts.dualWrite
    ? drafts.filter((d) => d.localOnly || opts.unsynced(d))
    : drafts;
  const evidenceFiles = drafts.reduce((n, d) => n + (d.evidence?.length ?? 0), 0);
  const counts: [number, string, string][] = [
    [localDrafts.length, opts.dualWrite ? "letter with unsynced changes" : "letter", opts.dualWrite ? "letters with unsynced changes" : "letters"],
    [opts.dualWrite ? 0 : Object.keys(state.matters).length, "matter", "matters"],
    [Object.keys(state.employees).length, "employee", "employees"],
    [Object.keys(state.tasks).length, "task", "tasks"],
    [Object.keys(state.events).length, "calendar event", "calendar events"],
    [Object.keys(state.customTemplates).length, "saved template", "saved templates"],
    [evidenceFiles, "evidence file", "evidence files"],
  ];
  return {
    items: counts.filter(([n]) => n > 0).map(([n, one, many]) => ({ label: plural(n, one, many), count: n })),
    otherWorkspaces: opts.otherWorkspaces ?? 0,
  };
}

export function isSummaryEmpty(s: LocalDataSummary): boolean {
  return s.items.length === 0 && s.otherWorkspaces === 0;
}

/** Summary of the live store plus any stashed workspaces. */
export function currentLocalDataSummary(): LocalDataSummary {
  return summariseLocalOnlyData(useDraftStore.getState(), {
    dualWrite: isDualWriteEnabled(),
    unsynced: hasUnsyncedChanges,
    otherWorkspaces: stashedNamespaces(readLocalOwner()).length,
  });
}

/** Everything DraftHR keeps for this user on this device, as one JSON blob. */
export function buildLocalBackup(now = new Date()): string {
  flushPendingWrites();
  const keys: Record<string, unknown> = {};
  try {
    const ls = window.localStorage;
    const wanted = new Set<string>([...TENANT_SCOPED_PERSIST_KEYS, ...TENANT_SCOPED_SYNC_KEYS, LOCAL_OWNER_KEY]);
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (!key || !(wanted.has(key) || key.startsWith("drafthr.stash."))) continue;
      const raw = ls.getItem(key);
      try {
        keys[key] = raw === null ? null : JSON.parse(raw);
      } catch {
        keys[key] = raw;
      }
    }
  } catch {
    /* storage unavailable: fall back to the in-memory store below */
  }
  if (!keys["scribehr-store-v1"]) {
    const { drafts, matters, employees, tasks, events, customTemplates } = useDraftStore.getState();
    keys["scribehr-store-v1"] = { state: { drafts, matters, employees, tasks, events, customTemplates } };
  }
  return JSON.stringify({ app: "DraftHR", kind: "local-backup", version: 1, exportedAt: now.toISOString(), keys }, null, 2);
}

export function downloadLocalBackup(): void {
  const blob = new Blob([buildLocalBackup()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drafthr-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type LocalDataLossReason = "sign-out" | "switch";

/** Shows the dialog; resolves true to go ahead and delete, false to cancel. */
type Presenter = (summary: LocalDataSummary, reason: LocalDataLossReason) => Promise<boolean>;
let presenter: Presenter | null = null;

/** Registered by the mounted LocalDataLossDialog. */
export function setLocalDataLossPresenter(next: Presenter | null): void {
  presenter = next;
}

/**
 * Ask before destroying local-only data. Resolves true straight away when
 * there is nothing to lose. Without a mounted dialog (tests, an error
 * boundary) it falls back to the browser's confirm.
 */
export async function confirmLocalDataLoss(
  reason: LocalDataLossReason,
  summary: LocalDataSummary = currentLocalDataSummary(),
): Promise<boolean> {
  if (isSummaryEmpty(summary)) return true;
  if (presenter) return presenter(summary, reason);
  const lines = summary.items.map((i) => `• ${i.label}`);
  if (summary.otherWorkspaces) lines.push(`• data for ${plural(summary.otherWorkspaces, "other workspace", "other workspaces")}`);
  return window.confirm(
    `This will delete data that is only stored on this device:\n${lines.join("\n")}\n\nContinue?`,
  );
}
