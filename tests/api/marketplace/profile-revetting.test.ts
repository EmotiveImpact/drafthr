/**
 * Editing a vetted profile field sends a live consultant back to the review
 * queue (out of the public directory); cosmetic edits don't.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb } from "./_fake-db";

const fake = createFakeDb();
vi.mock("../../../src/db/index.js", () => ({ getDb: () => fake.db }));

let nextBody: Record<string, unknown> = {};
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "t1" },
    userRow: { id: "consultant-user", email: "a@b.com" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: nextBody }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));

const { PATCH, changesVettedFields } = await import("../../../api/marketplace/_handlers/profile.js");

const existing = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: "consultant-user",
  initials: "JS",
  full_name: "Jo Specialist",
  role: "Solicitor · 12 yrs",
  bio: "Employment solicitor with twelve years in practice.",
  specialty: "Tribunal-ready letters",
  specialties: ["grievance", "england-wales"],
  price: 150,
  currency: "GBP",
  sla: "24-48h",
  availability: "this_week",
  rating_x10: 50,
  reviews: 0,
  photo_url: null,
  created_at: new Date(),
  updated_at: new Date(),
};

function givenProfile(status: string) {
  fake.respond(/^select .* from "consultant_profiles"/s, [{ ...existing, status }]);
  fake.respond(/^update "consultant_profiles"/, [{ ...existing, status }]);
}

const statusWritten = () => {
  const [update] = fake.find(/^update "consultant_profiles"/);
  return update.params;
};

beforeEach(() => {
  fake.reset();
});

describe("profile re-vetting", () => {
  it.each([
    ["rate", { price: 400 }],
    ["credentials", { role: "Barrister · 3 yrs" }],
    ["bio claims", { bio: "Former employment judge with twenty years on the bench." }],
    ["jurisdictions", { specialties: ["grievance", "scotland"] }],
    ["name", { fullName: "Someone Else" }],
  ])("sends a published profile back to review when the %s changes", async (_label, change) => {
    givenProfile("published");
    nextBody = change;
    expect((await PATCH({} as Request)).status).toBe(200);
    expect(statusWritten()).toContain("pending_review");
    expect(statusWritten()).not.toContain("published");
  });

  it("keeps a published profile listed for cosmetic edits", async () => {
    givenProfile("published");
    nextBody = { photoUrl: "https://img.test/me.png", availability: "booked", sla: "48-72h" };
    await PATCH({} as Request);
    expect(statusWritten()).toContain("published");
    expect(statusWritten()).not.toContain("pending_review");
  });

  it("keeps a published profile listed when the vetted fields are resubmitted unchanged", async () => {
    givenProfile("published");
    nextBody = {
      fullName: existing.full_name,
      role: existing.role,
      bio: existing.bio,
      specialties: existing.specialties,
      price: existing.price,
      currency: existing.currency,
    };
    await PATCH({} as Request);
    expect(statusWritten()).toContain("published");
  });

  it("never lifts a suspension through an edit", async () => {
    givenProfile("suspended");
    nextBody = { price: 90 };
    await PATCH({} as Request);
    expect(statusWritten()).toContain("suspended");
  });

  it("compares specialties by value", () => {
    const base = { fullName: "a", role: "b", bio: "c", specialty: "d", specialties: ["x"], price: 1, currency: "GBP" as const };
    expect(changesVettedFields(base, { ...base, specialties: ["x"] })).toBe(false);
    expect(changesVettedFields(base, { ...base, specialties: ["x", "y"] })).toBe(true);
  });
});
