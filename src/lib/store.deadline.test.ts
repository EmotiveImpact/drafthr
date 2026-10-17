import { afterEach, describe, expect, it, vi } from "vitest";
import type { LetterAnswers } from "./letters/types";

describe("protected-act deadline", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  const create = async (answers: Record<string, unknown>) => {
    const { useDraftStore } = await import("./store");
    const id = useDraftStore.getState().createDraft("grievance", answers as LetterAnswers, "employee");
    return { useDraftStore, id };
  };

  it("uses 300 days for a US deferral state", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "US", usState: "CA", actDate: "2026-01-10" });
    expect(useDraftStore.getState().drafts[id].context.protectedDeadline?.iso).toBe("2026-11-06");
  });

  it("uses 180 days for a non-deferral state or an unknown state", async () => {
    const a = await create({ jurisdiction: "US", usState: "GA", actDate: "2026-01-10" });
    expect(a.useDraftStore.getState().drafts[a.id].context.protectedDeadline?.iso).toBe("2026-07-09");
    const b = await create({ jurisdiction: "US", actDate: "2026-01-10" });
    expect(b.useDraftStore.getState().drafts[b.id].context.protectedDeadline?.iso).toBe("2026-07-09");
  });

  it("recomputes when Edit Details switches jurisdiction", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "US", usState: "CA", actDate: "2026-01-10" });
    useDraftStore.getState().patchDraft(id, { context: { jurisdiction: "UK" } });
    const deadline = useDraftStore.getState().drafts[id].context.protectedDeadline;
    expect(deadline?.iso).toBe("2026-04-09");
    expect(deadline?.basis).toMatch(/ACAS|tribunal/i);
  });

  it("uses 6 months less one day in Great Britain for an act on or after 1 October 2026", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "UK", ukRegion: "England & Wales", actDate: "2026-10-01" });
    const deadline = useDraftStore.getState().drafts[id].context.protectedDeadline;
    expect(deadline?.iso).toBe("2027-03-31");
    expect(deadline?.basis).toContain("6 months less one day");
  });

  it("keeps 3 months less one day for an act before 1 October 2026", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "UK", ukRegion: "Scotland", actDate: "2026-09-30" });
    expect(useDraftStore.getState().drafts[id].context.protectedDeadline?.iso).toBe("2026-12-29");
  });

  it("keeps 3 months less one day in Northern Ireland", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "UK", ukRegion: "Northern Ireland", actDate: "2026-10-01" });
    const deadline = useDraftStore.getState().drafts[id].context.protectedDeadline;
    expect(deadline?.iso).toBe("2026-12-31");
    expect(deadline?.basis).toContain("Northern Ireland");
  });

  it("recomputes when Edit Details switches the UK region", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "UK", ukRegion: "England & Wales", actDate: "2026-10-15" });
    expect(useDraftStore.getState().drafts[id].context.protectedDeadline?.iso).toBe("2027-04-14");
    useDraftStore.getState().patchDraft(id, { context: { ukRegion: "Northern Ireland" } });
    expect(useDraftStore.getState().drafts[id].context.protectedDeadline?.iso).toBe("2027-01-14");
  });

  it("recomputes when the act date changes", async () => {
    const { useDraftStore, id } = await create({ jurisdiction: "UK", actDate: "2026-01-10" });
    useDraftStore.getState().patchDraft(id, { answers: { actDate: "2026-02-01" } });
    expect(useDraftStore.getState().drafts[id].context.protectedDeadline?.iso).toBe("2026-04-30");
  });
});
