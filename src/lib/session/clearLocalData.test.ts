import { afterEach, describe, expect, it, beforeEach } from "vitest";
import {
  clearTenantScopedLocalData,
  TENANT_SCOPED_PERSIST_KEYS,
} from "./clearLocalData";

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

  it("is idempotent and safe when nothing is stored", () => {
    expect(() => clearTenantScopedLocalData()).not.toThrow();
    expect(() => clearTenantScopedLocalData()).not.toThrow();
  });

  it("keeps the key list in sync with the four known tenant-scoped stores", () => {
    // A guard so a newly-added persisted PII store is a conscious decision:
    // if you add a store that holds tenant data, add its key here too.
    expect([...TENANT_SCOPED_PERSIST_KEYS].sort()).toEqual(
      ["drafthr.bookings.v1", "drafthr.consultant", "scribehr-profile-v1", "scribehr-store-v1"].sort(),
    );
  });
});
