/**
 * The people the app knows for owner and approver pickers: you, the
 * workspace's members (from /api/workspace/members, best effort) and anyone
 * already on a letter as a collaborator.
 */
import { useEffect, useMemo, useState } from "react";
import { useDraftStore } from "@/lib/store";
import type { Person } from "./rows";
import { useMe } from "./rows";

export type WorkspaceMember = { userId: string; email: string; legalName?: string | null; role: string };

/** Load the workspace's members while `enabled`. Fails quietly to an empty list. */
export function useWorkspaceMembers(enabled: boolean) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/workspace/members", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members?: WorkspaceMember[] } | null) => {
        if (!cancelled && Array.isArray(data?.members)) setMembers(data!.members);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { members, loading };
}

export type KnownPerson = Person & { role?: string; you?: boolean };

/** You, then workspace members, then collaborators on letters, without duplicates. */
export function useKnownPeople(enabled: boolean): { people: KnownPerson[]; loading: boolean } {
  const me = useMe();
  const drafts = useDraftStore((s) => s.drafts);
  const { members, loading } = useWorkspaceMembers(enabled);
  const people = useMemo(() => {
    const out: KnownPerson[] = [];
    const seen = new Set<string>();
    const key = (p: { name: string; email?: string }) => (p.email || p.name).trim().toLowerCase();
    const add = (p: KnownPerson) => {
      const k = key(p);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(p);
    };
    add({ ...me, you: true });
    for (const m of members) {
      const email = m.email?.trim().toLowerCase();
      add({ name: m.legalName?.trim() || m.email, email, seed: email || m.legalName || m.userId, role: m.role });
    }
    for (const d of Object.values(drafts)) {
      for (const c of d.collaborators ?? []) {
        const email = c.email?.trim().toLowerCase();
        if (!email) continue;
        add({ name: c.name?.trim() || c.email, email, seed: email });
      }
    }
    return out;
  }, [me, members, drafts]);
  return { people, loading };
}
