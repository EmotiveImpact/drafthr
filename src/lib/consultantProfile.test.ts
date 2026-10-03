import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("consultant memory cache", () => {
  beforeEach(() => { window.localStorage.clear(); vi.resetModules(); });
  afterEach(() => { window.localStorage.clear(); });

  it("never hydrates an unscoped legacy profile into the signed-in account", async () => {
    const raw = JSON.stringify({ state: { enrolled: true, profile: { fullName: "Another person" } }, version: 2 });
    localStorage.setItem("drafthr.consultant", raw);
    const { useConsultantStore } = await import("./consultantProfile");
    expect(useConsultantStore.getState().profile).toBeNull();
    expect(useConsultantStore.getState().enrolled).toBe(false);
    expect(localStorage.getItem("drafthr.consultant")).toBe(raw);
  });

  it("keeps enrollment as an in-memory onboarding choice, not a persisted profile", async () => {
    const { useConsultantStore } = await import("./consultantProfile");
    useConsultantStore.getState().enrol();
    expect(useConsultantStore.getState().enrolled).toBe(true);
    expect(useConsultantStore.getState().profile).toBeNull();
    expect(localStorage.getItem("drafthr.consultant")).toBeNull();
  });

  it("clears identity and save status on reset", async () => {
    const { useConsultantStore } = await import("./consultantProfile");
    useConsultantStore.getState().enrol();
    useConsultantStore.getState().setSync("error", "not saved");
    useConsultantStore.getState().reset();
    expect(useConsultantStore.getState()).toMatchObject({ profile: null, enrolled: false, lastSync: { at: null, state: "idle", error: null } });
  });
});
