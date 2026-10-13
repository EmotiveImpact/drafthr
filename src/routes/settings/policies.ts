import { useSyncExternalStore } from "react";

/**
 * Workspace policies (Settings, Policies): a plain list of policy names
 * with an optional link, kept in this browser next to the profile. Nothing
 * else in the app reads it yet. Every storage access is wrapped, so a
 * private window or full storage just means the list is not remembered.
 */
export type WorkspacePolicy = {
  id: string;
  name: string;
  url?: string;
  addedAt: number;
};

export const POLICIES_KEY = "drafthr.settings.policies.v1";

const listeners = new Set<() => void>();
let cache: WorkspacePolicy[] | null = null;

function read(): WorkspacePolicy[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(POLICIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (p): p is WorkspacePolicy =>
            !!p && typeof p === "object" && typeof (p as WorkspacePolicy).id === "string" && typeof (p as WorkspacePolicy).name === "string"
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: WorkspacePolicy[]): boolean {
  cache = next;
  let ok = true;
  try {
    localStorage.setItem(POLICIES_KEY, JSON.stringify(next));
  } catch {
    ok = false;
  }
  listeners.forEach((l) => l());
  return ok;
}

/** A link is kept only when it is a web address; "intranet/policy" gets https://. */
export function normalisePolicyUrl(input: string): string | undefined {
  const t = input.trim();
  if (!t) return undefined;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function listPolicies(): WorkspacePolicy[] {
  return read();
}

export function addPolicy(name: string, url?: string, now = Date.now()): WorkspacePolicy | null {
  const n = name.trim();
  if (!n) return null;
  const policy: WorkspacePolicy = {
    id: `pol_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: n,
    url: url ? normalisePolicyUrl(url) : undefined,
    addedAt: now,
  };
  write([...read(), policy]);
  return policy;
}

export function removePolicy(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function clearPolicies(): void {
  cache = [];
  try {
    localStorage.removeItem(POLICIES_KEY);
  } catch {
    /* nothing stored */
  }
  listeners.forEach((l) => l());
}

/** Test hook: forget the in-memory copy so the next read goes to storage. */
export function resetPoliciesCache(): void {
  cache = null;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePolicies(): WorkspacePolicy[] {
  return useSyncExternalStore(subscribe, read, read);
}
