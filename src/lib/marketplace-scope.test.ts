import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBookingsStore, type Booking } from "./bookings";
import { useConsultantStore } from "./consultantProfile";
import {
  captureMarketplaceScope, isMarketplaceScopeCurrent, recoverMarketplaceScope, setMarketplaceScope,
  LEGACY_MARKETPLACE_KEYS, MARKETPLACE_QUARANTINE_PREFIX, quarantineLegacyMarketplaceData,
} from "./marketplace-scope";
import { useSessionTransition } from "./session/transition";
import { clearTenantScopedLocalData } from "./session/clearLocalData";

beforeEach(() => {
  localStorage.clear();
  useSessionTransition.setState({ label: null, epoch: 0 });
  setMarketplaceScope(null, null);
  setMarketplaceScope("alice", "workspace-a");
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

describe("marketplace account and workspace boundary", () => {
  it("synchronously clears both read models and profile on workspace switch", () => {
    const old = captureMarketplaceScope();
    useConsultantStore.getState().enrol();
    useBookingsStore.setState({ bookings: [{ id: "private" } as Booking], inbox: [{ id: "review" } as Booking] });
    setMarketplaceScope("alice", "workspace-b");
    expect(isMarketplaceScopeCurrent(old)).toBe(false);
    expect(useBookingsStore.getState()).toMatchObject({ bookings: [], inbox: [], inboxState: "idle" });
    expect(useConsultantStore.getState()).toMatchObject({ profile: null, enrolled: false });
  });

  it("does not revive requests when switching away and back to the same account", () => {
    const old = captureMarketplaceScope();
    setMarketplaceScope("bob", "workspace-b");
    setMarketplaceScope("alice", "workspace-a");
    expect(isMarketplaceScopeCurrent(old)).toBe(false);
    expect(isMarketplaceScopeCurrent(captureMarketplaceScope())).toBe(true);
  });

  it("blocks requests during transitions and invalidates pre-transition responses even after cancellation", () => {
    const old = captureMarketplaceScope();
    useSessionTransition.setState({ label: "Switching", epoch: 1 });
    expect(captureMarketplaceScope()).toBeNull();
    useSessionTransition.setState({ label: null });
    expect(isMarketplaceScopeCurrent(old)).toBe(false);
  });

  it("does not reset a cache for an unchanged session refresh", () => {
    useConsultantStore.getState().enrol();
    const scope = captureMarketplaceScope();
    setMarketplaceScope("alice", "workspace-a");
    expect(isMarketplaceScopeCurrent(scope)).toBe(true);
    expect(useConsultantStore.getState().enrolled).toBe(true);
  });

  it("waits for a cancelled transition then returns a new scope without reviving the old one", async () => {
    const old = captureMarketplaceScope()!;
    useSessionTransition.setState({ label: "Signing out", epoch: 1 });
    const recovery = recoverMarketplaceScope(old);
    const observed = vi.fn();
    void recovery.then(observed);
    await Promise.resolve();
    expect(observed).not.toHaveBeenCalled();
    useSessionTransition.setState({ label: null });
    const recovered = await recovery;
    expect(recovered?.epoch).toBe(1);
    expect(isMarketplaceScopeCurrent(old)).toBe(false);
    expect(isMarketplaceScopeCurrent(recovered)).toBe(true);
  });

  it("refuses recovery after an identity changes, including a switch away and back", async () => {
    const old = captureMarketplaceScope()!;
    useSessionTransition.setState({ label: "Switching", epoch: 1 });
    const recovery = recoverMarketplaceScope(old);
    setMarketplaceScope("bob", "workspace-b");
    setMarketplaceScope("alice", "workspace-a");
    useSessionTransition.setState({ label: null });
    expect(await recovery).toBeNull();
    expect(await recoverMarketplaceScope(old)).toBeNull();
  });

  it("bounds a transition that never settles and releases its timer", async () => {
    vi.useFakeTimers();
    const old = captureMarketplaceScope()!;
    useSessionTransition.setState({ label: "Signing out", epoch: 1 });
    const recovery = recoverMarketplaceScope(old);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await recovery).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("legacy marketplace quarantine", () => {
  it("preserves exact old bytes without assuming the currently signed-in user owns them", () => {
    for (const key of LEGACY_MARKETPLACE_KEYS) localStorage.setItem(key, `raw unsynced data: ${key}`);
    quarantineLegacyMarketplaceData();
    for (const key of LEGACY_MARKETPLACE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
      expect(JSON.parse(localStorage.getItem(`${MARKETPLACE_QUARANTINE_PREFIX}${key}`)!)).toEqual({
        ownership: "unknown", source: key, raw: `raw unsynced data: ${key}`,
      });
    }
    clearTenantScopedLocalData();
    expect(localStorage.length).toBe(2);
    expect(useBookingsStore.getState().bookings).toEqual([]);
    expect(useConsultantStore.getState().profile).toBeNull();
  });

  it("retains the source if quarantine storage fails, including during logout cleanup", () => {
    localStorage.setItem("drafthr.bookings.v1", "only copy");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    clearTenantScopedLocalData();
    expect(localStorage.getItem("drafthr.bookings.v1")).toBe("only copy");
  });

  it("preserves two distinct legacy versions rather than replacing an earlier quarantine", () => {
    localStorage.setItem("drafthr.bookings.v1", "first");
    quarantineLegacyMarketplaceData();
    localStorage.setItem("drafthr.bookings.v1", "second");
    quarantineLegacyMarketplaceData();
    const values = Object.keys(localStorage).map((k) => JSON.parse(localStorage.getItem(k)!).raw).sort();
    expect(values).toEqual(["first", "second"]);
  });
});
