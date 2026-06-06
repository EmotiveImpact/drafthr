import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * saveProfile must keep `initials` in sync with `fullName` — including when
 * the name is CLEARED to "". The earlier `if (patch.fullName)` guard skipped
 * the recompute on an empty string, leaving stale initials on the card.
 */
describe("consultant saveProfile — initials stay in sync with fullName", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("derives initials when a name is set", async () => {
    const { useConsultantStore } = await import("./consultantProfile");
    useConsultantStore.getState().saveProfile({ fullName: "Jane Doe" });
    expect(useConsultantStore.getState().profile?.initials).toBe("JD");
  });

  it("resets initials to '??' when the name is cleared to an empty string", async () => {
    const { useConsultantStore } = await import("./consultantProfile");
    const store = useConsultantStore.getState();

    store.saveProfile({ fullName: "Jane Doe" });
    expect(useConsultantStore.getState().profile?.initials).toBe("JD");

    // The regression: clearing the name used to leave initials as "JD".
    store.saveProfile({ fullName: "" });
    expect(useConsultantStore.getState().profile?.fullName).toBe("");
    expect(useConsultantStore.getState().profile?.initials).toBe("??");
  });

  it("leaves initials untouched when fullName is not part of the patch", async () => {
    const { useConsultantStore } = await import("./consultantProfile");
    const store = useConsultantStore.getState();

    store.saveProfile({ fullName: "Jane Doe" });
    store.saveProfile({ role: "Advisor" });
    expect(useConsultantStore.getState().profile?.initials).toBe("JD");
    expect(useConsultantStore.getState().profile?.role).toBe("Advisor");
  });
});
