import { describe, it, expect } from "vitest";
import {
  subscriptions,
  entitlementPurchases,
  creditLedger,
  webhookEventsSeen,
  tenants,
  users,
} from "../../src/db/schema.js";

describe("billing schema", () => {
  it("exposes the billing tables with their key columns", () => {
    expect(Object.keys(subscriptions)).toEqual(
      expect.arrayContaining([
        "subjectType",
        "subjectId",
        "stripeSubscriptionId",
        "plan",
        "status",
        "currentPeriodEnd",
        "cancelAtPeriodEnd",
        "graceUntil",
      ]),
    );
    expect(Object.keys(entitlementPurchases)).toEqual(
      expect.arrayContaining(["userId", "kind", "matterId", "stripePaymentIntentId", "consumedAt"]),
    );
    expect(Object.keys(creditLedger)).toEqual(
      expect.arrayContaining(["subjectType", "subjectId", "delta", "reason", "expiresAt"]),
    );
    expect(Object.keys(webhookEventsSeen)).toEqual(expect.arrayContaining(["eventId", "seenAt"]));
  });

  it("adds stripeCustomerId to tenants and users", () => {
    expect(Object.keys(tenants)).toContain("stripeCustomerId");
    expect(Object.keys(users)).toContain("stripeCustomerId");
  });
});
