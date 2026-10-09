import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearTenantScopedLocalData,
  localNamespace,
  readLocalOwner,
  reconcileLocalDataOwner,
  stashedNamespaces,
  switchLocalWorkspace,
  TENANT_SCOPED_PERSIST_KEYS,
} from "./clearLocalData";
import { setPersistenceSuspended } from "../storage/quota-safe-storage";

/**
 * Security board SA-01 / SE-02: persisted tenant PII must not survive sign-out
 * or workspace switch on a shared browser. These tests lock the wipe.
 */
describe("clearTenantScopedLocalData (shared-browser PII leak — SA-01/SE-02)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("removes every tenant-scoped persisted store", () => {
    // Seed each tenant-scoped key with representative PII.
    window.localStorage.setItem(
      "scribehr-store-v1",
      JSON.stringify({ state: { drafts: { d1: { employee: { legalName: "Jane Doe" } } } } }),
    );
    window.localStorage.setItem("scribehr-profile-v1", JSON.stringify({ state: { profile: { role: "employer" } } }));
    window.localStorage.setItem("drafthr.consultant", JSON.stringify({ state: { profile: { fullName: "A B" } } }));
    window.localStorage.setItem("drafthr.bookings.v1", JSON.stringify({ state: { bookings: [] } }));

    clearTenantScopedLocalData();

    for (const key of TENANT_SCOPED_PERSIST_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });

  it("PRESERVES non-tenant preference keys (theme, branding flag)", () => {
    window.localStorage.setItem("scribehr-store-v1", "x");
    window.localStorage.setItem("scribehr-theme-v1", JSON.stringify({ state: { theme: "dark" } }));
    window.localStorage.setItem("drafthr-export-footer", "1");

    clearTenantScopedLocalData();

    expect(window.localStorage.getItem("scribehr-store-v1")).toBeNull();
    // Preferences are not tenant data — wiping them would be a worse UX for no gain.
    expect(window.localStorage.getItem("scribehr-theme-v1")).not.toBeNull();
    expect(window.localStorage.getItem("drafthr-export-footer")).toBe("1");
  });

  it("stops later writes from putting the wiped data back before the reload", async () => {
    const { createQuotaSafeStorage } = await import("../storage/quota-safe-storage");
    const storage = createQuotaSafeStorage(window.localStorage, () => {});
    clearTenantScopedLocalData();
    // e.g. a sync response landing between the wipe and the navigation.
    storage.setItem("scribehr-store-v1", JSON.stringify({ state: { drafts: { d1: {} } } }));
    expect(window.localStorage.getItem("scribehr-store-v1")).toBeNull();
    setPersistenceSuspended(false);
  });

  it("is idempotent and safe when nothing is stored", () => {
    expect(() => clearTenantScopedLocalData()).not.toThrow();
    expect(() => clearTenantScopedLocalData()).not.toThrow();
  });

  it("keepProfile preserves the user's profile on a workspace switch but still wipes tenant data (JA-03)", () => {
    for (const k of TENANT_SCOPED_PERSIST_KEYS) window.localStorage.setItem(k, "x");

    clearTenantScopedLocalData({ keepProfile: true });

    // Same user switching tenants — their role/credits must survive so they
    // aren't forced back through the role picker.
    expect(window.localStorage.getItem("scribehr-profile-v1")).toBe("x");
    // Tenant-scoped data is still wiped so tenant A's drafts don't bleed into B.
    expect(window.localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(window.localStorage.getItem("drafthr.consultant")).toBeNull();
    expect(window.localStorage.getItem("drafthr.bookings.v1")).toBeNull();
  });

  it("full wipe (sign-out, no opts) still removes the profile too", () => {
    for (const k of TENANT_SCOPED_PERSIST_KEYS) window.localStorage.setItem(k, "x");
    clearTenantScopedLocalData();
    expect(window.localStorage.getItem("scribehr-profile-v1")).toBeNull();
  });

  it("keeps the key list in sync with the four known tenant-scoped stores", () => {
    // A guard so a newly-added persisted PII store is a conscious decision:
    // if you add a store that holds tenant data, add its key here too.
    expect([...TENANT_SCOPED_PERSIST_KEYS].sort()).toEqual(
      ["drafthr.bookings.v1", "drafthr.consultant", "scribehr-profile-v1", "scribehr-store-v1"].sort(),
    );
  });
});

describe("per-workspace local data (switching never deletes)", () => {
  const A = localNamespace("u1", "tA");
  const B = localNamespace("u1", "tB");

  beforeEach(() => {
    window.localStorage.clear();
    setPersistenceSuspended(false);
  });
  afterEach(() => {
    window.localStorage.clear();
    setPersistenceSuspended(false);
  });

  it("stashes workspace A on switch and restores it on switching back", () => {
    window.localStorage.setItem("scribehr-store-v1", "A-drafts");
    window.localStorage.setItem("drafthr.sync-meta.v1", "A-meta");
    window.localStorage.setItem("scribehr-profile-v1", "profile");

    expect(switchLocalWorkspace(A, B)).toBe(true);
    // B starts empty; A's data is not visible but not gone either.
    expect(window.localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(window.localStorage.getItem("drafthr.sync-meta.v1")).toBeNull();
    expect(window.localStorage.getItem("scribehr-profile-v1")).toBe("profile");
    expect(readLocalOwner()).toBe(B);
    expect(stashedNamespaces(B)).toEqual([A]);

    window.localStorage.setItem("scribehr-store-v1", "B-drafts");
    expect(switchLocalWorkspace(B, A)).toBe(true);
    expect(window.localStorage.getItem("scribehr-store-v1")).toBe("A-drafts");
    expect(window.localStorage.getItem("drafthr.sync-meta.v1")).toBe("A-meta");

    expect(switchLocalWorkspace(A, B)).toBe(true);
    expect(window.localStorage.getItem("scribehr-store-v1")).toBe("B-drafts");
  });

  it("puts everything back and reports failure when the stash doesn't fit", () => {
    window.localStorage.setItem("scribehr-store-v1", "A-drafts");
    const realSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith("drafthr.stash.")) throw new DOMException("full", "QuotaExceededError");
      return realSetItem.call(this, k, v);
    });
    expect(switchLocalWorkspace(A, B)).toBe(false);
    spy.mockRestore();
    expect(window.localStorage.getItem("scribehr-store-v1")).toBe("A-drafts");
    expect(stashedNamespaces()).toEqual([]);
  });

  it("stashes data left by another workspace instead of showing it here", () => {
    window.localStorage.setItem("drafthr.local-owner.v1", A);
    window.localStorage.setItem("scribehr-store-v1", "A-drafts");
    expect(reconcileLocalDataOwner("u1", "tB")).toBe(true);
    expect(window.localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(stashedNamespaces(B)).toEqual([A]);
    // Same owner again: nothing to do.
    expect(reconcileLocalDataOwner("u1", "tB")).toBe(false);
  });

  it("adopts unowned (pre-upgrade) data for the signed-in workspace", () => {
    window.localStorage.setItem("scribehr-store-v1", "legacy");
    expect(reconcileLocalDataOwner("u1", "tA")).toBe(false);
    expect(readLocalOwner()).toBe(A);
    expect(window.localStorage.getItem("scribehr-store-v1")).toBe("legacy");
  });

  it("a full sign-out wipe also removes other workspaces' stashes", () => {
    window.localStorage.setItem("scribehr-store-v1", "A-drafts");
    switchLocalWorkspace(A, B);
    clearTenantScopedLocalData({ includeStashes: true });
    expect(stashedNamespaces()).toEqual([]);
    expect(readLocalOwner()).toBeNull();
  });
});
