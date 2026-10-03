import { create } from "zustand";
import { useBookingsStore } from "./bookings";
import { useConsultantStore } from "./consultantProfile";
import { useSessionTransition } from "./session/transition";

type ScopeState = { userId: string | null; tenantId: string | null; generation: number };
export const useMarketplaceScope = create<ScopeState>(() => ({ userId: null, tenantId: null, generation: 0 }));
export type MarketplaceScope = ScopeState & { epoch: number };

/** Called synchronously before AuthProvider publishes a new identity. */
export function setMarketplaceScope(userId: string | null, tenantId: string | null) {
  const previous = useMarketplaceScope.getState();
  if (previous.userId === userId && previous.tenantId === tenantId) return;
  useMarketplaceScope.setState({ userId, tenantId, generation: previous.generation + 1 });
  useConsultantStore.getState().reset();
  useBookingsStore.getState().reset();
}

export function captureMarketplaceScope(): MarketplaceScope | null {
  const scope = useMarketplaceScope.getState();
  const transition = useSessionTransition.getState();
  return scope.userId && !transition.label ? { ...scope, epoch: transition.epoch } : null;
}

export function isMarketplaceScopeCurrent(scope: MarketplaceScope | null): boolean {
  const current = useMarketplaceScope.getState();
  const transition = useSessionTransition.getState();
  return Boolean(scope && current.userId === scope.userId && current.tenantId === scope.tenantId &&
    current.generation === scope.generation && transition.epoch === scope.epoch && !transition.label);
}

/** Identity-only checks are for cleanup/recovery, never accepting an old reply.
 * The generation also rejects a switch away and back to the same account. */
export function isMarketplaceIdentityCurrent(scope: MarketplaceScope | null): boolean {
  const current = useMarketplaceScope.getState();
  return Boolean(scope && current.userId === scope.userId && current.tenantId === scope.tenantId &&
    current.generation === scope.generation);
}

/** A failed session transition keeps the same mounted workspace but invalidates
 * its in-flight replies. Wait for it to settle, then obtain a NEW request scope.
 * A real identity change, or an unresolved transition, must not trigger a read. */
export function recoverMarketplaceScope(scope: MarketplaceScope): Promise<MarketplaceScope | null> {
  if (!isMarketplaceIdentityCurrent(scope)) return Promise.resolve(null);
  if (!useSessionTransition.getState().label) return Promise.resolve(captureMarketplaceScope());
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribeScope = () => {};
    let unsubscribeTransition = () => {};
    const timeout = setTimeout(() => finish(null), 30_000);
    function finish(next: MarketplaceScope | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribeScope();
      unsubscribeTransition();
      resolve(next);
    }
    function check() {
      if (!isMarketplaceIdentityCurrent(scope)) finish(null);
      else if (!useSessionTransition.getState().label) finish(captureMarketplaceScope());
    }
    unsubscribeScope = useMarketplaceScope.subscribe(check);
    unsubscribeTransition = useSessionTransition.subscribe(check);
    check();
  });
}

export const LEGACY_MARKETPLACE_KEYS = ["drafthr.consultant", "drafthr.bookings.v1"] as const;
export const MARKETPLACE_QUARANTINE_PREFIX = "drafthr.marketplace-quarantine.v1:";

/** Old blobs have no reliable account ownership. Preserve their exact bytes
 * outside active store keys for owner-reviewed recovery; never claim they
 * belong to whichever account happens to sign in next. Remove the source
 * only after verified storage of the quarantine copy. No UI reads this data. */
export function quarantineLegacyMarketplaceData(): void {
  if (typeof window === "undefined") return;
  for (const source of LEGACY_MARKETPLACE_KEYS) {
    try {
      const raw = localStorage.getItem(source);
      if (raw === null) continue;
      const key = `${MARKETPLACE_QUARANTINE_PREFIX}${source}`;
      const existing = localStorage.getItem(key);
      const payload = JSON.stringify({ source, ownership: "unknown", raw });
      // Never overwrite a different recovery copy, including from an older
      // app still running in another tab. A fresh slot preserves both.
      const destination = existing && existing !== payload ? `${key}:${crypto.randomUUID()}` : key;
      localStorage.setItem(destination, payload);
      if (localStorage.getItem(destination) === payload && localStorage.getItem(source) === raw) {
        localStorage.removeItem(source);
      }
    } catch {
      // Quota/private-mode failures retain the source rather than losing it.
    }
  }
}
