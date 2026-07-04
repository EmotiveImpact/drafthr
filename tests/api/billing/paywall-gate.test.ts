import { describe, it, expect, afterEach } from "vitest";
import { assertCanCreateLetter } from "../../../api/_utils/entitlements.js";

describe("assertCanCreateLetter — hard-paywall gate", () => {
  const prev = process.env.DRAFTHR_ENFORCE_PAYWALL;
  afterEach(() => {
    if (prev === undefined) delete process.env.DRAFTHR_ENFORCE_PAYWALL;
    else process.env.DRAFTHR_ENFORCE_PAYWALL = prev;
  });

  it("is a no-op (ok) when enforcement is OFF — never touches the DB", async () => {
    delete process.env.DRAFTHR_ENFORCE_PAYWALL;
    const gate = await assertCanCreateLetter("t1", "u1");
    expect(gate.ok).toBe(true);
  });

  it("stays a no-op for any non-'1' flag value", async () => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "true";
    const gate = await assertCanCreateLetter("t1", "u1");
    expect(gate.ok).toBe(true);
  });
});
