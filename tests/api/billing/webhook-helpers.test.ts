import { describe, it, expect } from "vitest";
import { subscriptionIdOf } from "../../../api/marketplace/_handlers/billing-webhook.js";

// Cast partial fixtures to the param type without `any`.
const inv = (o: object) => o as unknown as Parameters<typeof subscriptionIdOf>[0];

describe("subscriptionIdOf — resolves the subscription id across Stripe API shapes", () => {
  it("reads the 2026-05-27 shape: invoice.parent.subscription_details.subscription", () => {
    expect(
      subscriptionIdOf(inv({ parent: { subscription_details: { subscription: "sub_new" } } })),
    ).toBe("sub_new");
  });

  it("falls back to the legacy top-level invoice.subscription (string or object)", () => {
    expect(subscriptionIdOf(inv({ subscription: "sub_old" }))).toBe("sub_old");
    expect(subscriptionIdOf(inv({ subscription: { id: "sub_obj" } }))).toBe("sub_obj");
  });

  it("falls back to a line-level subscription", () => {
    expect(subscriptionIdOf(inv({ lines: { data: [{}, { subscription: "sub_line" }] } }))).toBe(
      "sub_line",
    );
  });

  it("returns null when no subscription is present (so the grace update no-ops safely)", () => {
    expect(subscriptionIdOf(inv({ lines: { data: [] } }))).toBeNull();
    expect(subscriptionIdOf(inv({}))).toBeNull();
  });
});
