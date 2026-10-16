import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/db/index.js", () => ({ getDb: () => ({}) }));
const { pickEffectiveSubscription } = await import("../../../api/_utils/entitlements.js");

type Row = Parameters<typeof pickEffectiveSubscription>[0][number];
const row = (id: string, status: string, graceUntil: Date | null = null) =>
  ({ id, status, graceUntil, plan: id }) as unknown as Row;

describe("pickEffectiveSubscription", () => {
  it("prefers a live workspace plan over a newer dead one", () => {
    // Newest first: the old subscription just received a late cancel event.
    const picked = pickEffectiveSubscription([row("old", "canceled"), row("live", "active")], []);
    expect(picked?.id).toBe("live");
  });

  it("falls back to the user's own live plan when the workspace plan is dead", () => {
    const picked = pickEffectiveSubscription([row("ws", "canceled")], [row("plus", "active")]);
    expect(picked?.id).toBe("plus");
  });

  it("counts past_due inside grace as usable, and outside grace as not", () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(pickEffectiveSubscription([row("a", "past_due", future)], [row("b", "active")])?.id).toBe("a");
    expect(pickEffectiveSubscription([row("a", "past_due", past)], [row("b", "active")])?.id).toBe("b");
  });

  it("returns the newest row when nothing is usable, so the UI can say why", () => {
    expect(pickEffectiveSubscription([row("ws", "canceled")], [row("u", "incomplete")])?.id).toBe("ws");
    expect(pickEffectiveSubscription([], [])).toBeUndefined();
  });
});
