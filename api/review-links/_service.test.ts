import { describe, expect, it } from "vitest";
import {
  LinkError,
  actWithToken,
  askAgain,
  assignedTo,
  createLink,
  expertAct,
  expertOpen,
  hashToken,
  isNotReady,
  linkExpiry,
  linkStatus,
  memoryRepo,
  openWithToken,
  resolveToken,
  revokeLink,
  teamAct,
  type Actor,
  type BookingFacts,
  type Ctx,
} from "./_service.js";
import { letterTypeWords, trustedLinkEmail } from "./_email.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const ASKER = "33333333-3333-4333-8333-333333333333";
const TEAMMATE = "44444444-4444-4444-8444-444444444444";
const CONSULTANT = "55555555-5555-4555-8555-555555555555";
const DRAFT = "66666666-6666-4666-8666-666666666666";
const BOOKING = "77777777-7777-4777-8777-777777777777";
const DAY = 24 * 60 * 60 * 1000;

const letter = {
  title: "Final written warning",
  letterType: "final_written_warning",
  jurisdiction: "UK",
  mode: "employer",
  company: "Harbour Foods",
  sections: [
    { id: "s1", title: "Opening", html: "<p>Dear Jordan,</p>", position: 0 },
    { id: "s2", title: "Appeal", html: "<p>You may appeal within 5 days.</p>", position: 1 },
  ],
};

const evidence = [
  { id: "e1", name: "Absence log.pdf", kind: "document", content: "12 absences", group: "file" },
  { id: "e2", name: "Hearing notes", kind: "note", content: "Hearing notes 3 Aug", group: "hearing-notes" },
];

function setup(opts: { now?: number; booking?: Partial<BookingFacts> } = {}) {
  let now = opts.now ?? Date.UTC(2026, 9, 13, 9, 0);
  const repo = memoryRepo();
  const booking: BookingFacts = {
    id: BOOKING,
    tenantId: TENANT,
    requesterUserId: ASKER,
    consultantUserId: CONSULTANT,
    status: "accepted",
    paid: true,
    ...opts.booking,
  };
  const ctx: Ctx = {
    repo,
    now: () => now,
    dir: {
      isMember: async (tenantId, userId) => tenantId === TENANT && (userId === TEAMMATE || userId === ASKER),
      booking: async (id) => (id === BOOKING ? booking : null),
    },
  };
  const asker: Actor = { userId: ASKER, tenantId: TENANT, name: "Alex Morgan" };
  return { ctx, repo, asker, setNow: (t: number) => (now = t), booking };
}

async function trusted(s: ReturnType<typeof setup>, extra: Record<string, unknown> = {}) {
  return createLink(s.ctx, s.asker, {
    kind: "trusted",
    draftId: DRAFT,
    reviewId: "rvw_1",
    reviewerName: "Mark Ellison",
    reviewerEmail: "Mark@Ellison-Law.co.uk",
    askerName: "Alex Morgan",
    ask: "Is the appeal paragraph right?",
    share: { evidence: true, hearingNotes: false },
    letter,
    evidence,
    ...extra,
  });
}

async function expectCode(p: Promise<unknown>, code: string, status?: number) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(LinkError);
  expect((err as LinkError).code).toBe(code);
  if (status) expect((err as LinkError).status).toBe(status);
}

describe("trusted links: creating", () => {
  it("stores only the hash of a 256-bit token, never the token", async () => {
    const s = setup();
    const { row, token } = await trusted(s);
    expect(token).toMatch(/^rvl_[A-Za-z0-9_-]{43}$/);
    expect(row.tokenHash).toBe(hashToken(token!));
    expect(row.tokenHash).not.toContain(token!);
    const stored = JSON.stringify([...s.repo.rows.values()]);
    expect(stored).not.toContain(token!);
    expect(stored).not.toContain(token!.slice(4));
  });

  it("expires in 7 days, or later when the back-by needs it (30 at most)", async () => {
    const s = setup();
    const now = s.ctx.now!();
    const { row } = await trusted(s);
    expect(row.expiresAt!.getTime()).toBe(now + 7 * DAY);
    expect(linkExpiry(now, now + 10 * DAY)).toBe(now + 12 * DAY);
    expect(linkExpiry(now, now + 90 * DAY)).toBe(now + 30 * DAY);
  });

  it("keeps the reviewer, the ask and what is shared, and drops files that were not ticked", async () => {
    const s = setup();
    const { row } = await trusted(s);
    expect(row.reviewerEmail).toBe("mark@ellison-law.co.uk");
    expect(row.ask).toBe("Is the appeal paragraph right?");
    expect(row.shareEvidence).toBe(true);
    expect(row.shareHearingNotes).toBe(false);
    expect((row.evidence as { id: string }[]).map((e) => e.id)).toEqual(["e1"]);
  });

  it("refuses a bad email and needs a workspace", async () => {
    const s = setup();
    await expectCode(trusted(s, { reviewerEmail: "not-an-email" }), "bad-email", 400);
    await expectCode(createLink(s.ctx, { ...s.asker, tenantId: null }, { kind: "trusted" }), "no-workspace", 400);
  });

  it("a retry of the same review reuses the row with a fresh token", async () => {
    const s = setup();
    const a = await trusted(s);
    const b = await trusted(s);
    expect(b.row.id).toBe(a.row.id);
    expect(b.token).not.toBe(a.token);
    await expectCode(resolveToken(s.ctx, a.token), "invalid", 404);
    expect((await resolveToken(s.ctx, b.token)).id).toBe(a.row.id);
  });
});

describe("trusted links: opening", () => {
  it("a valid token returns the letter and only the shared files, and records the opening", async () => {
    const s = setup();
    const { token } = await trusted(s);
    const view = await openWithToken(s.ctx, token);
    expect(view.letter.sections.map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(view.letter.company).toBe("Harbour Foods");
    expect(view.evidence.map((e) => e.id)).toEqual(["e1"]);
    expect(view.asker.name).toBe("Alex Morgan");
    expect(view.state.openedAt).toBe(s.ctx.now!());
    expect(JSON.stringify(view)).not.toContain("Hearing notes 3 Aug");
    expect(JSON.stringify(view)).not.toContain("mark@ellison-law.co.uk");
  });

  it("keeps the letterhead address and what the letter is about, trimmed", async () => {
    const s = setup();
    const { token } = await trusted(s, {
      letter: { ...letter, companyAddress: " Unit 4, Quayside Park ", about: { matter: "Hale, timekeeping", employee: "Jordan Hale · Warehouse operative", extra: "x" } },
    });
    const view = await openWithToken(s.ctx, token);
    expect(view.letter.companyAddress).toBe("Unit 4, Quayside Park");
    expect(view.letter.about).toEqual({ matter: "Hale, timekeeping", employee: "Jordan Hale · Warehouse operative" });
    const s2 = setup();
    const plain = await trusted(s2);
    const v2 = await openWithToken(s2.ctx, plain.token);
    expect(v2.letter.about).toBeUndefined();
    expect(v2.letter.companyAddress).toBeUndefined();
  });

  it("refuses an expired token", async () => {
    const s = setup();
    const { token } = await trusted(s);
    s.setNow(s.ctx.now!() + 7 * DAY + 1);
    await expectCode(openWithToken(s.ctx, token), "expired", 410);
  });

  it("refuses a revoked token (recall) and a finished review", async () => {
    const s = setup();
    const { row, token } = await trusted(s);
    await revokeLink(s.ctx, s.asker, { linkId: row.id, reason: "recalled" });
    await expectCode(openWithToken(s.ctx, token), "revoked", 410);
    await expectCode(actWithToken(s.ctx, token, { action: "comment", sectionId: "s1", note: "Hi" }), "revoked", 410);

    const s2 = setup();
    const t2 = await trusted(s2);
    await revokeLink(s2.ctx, s2.asker, { linkId: t2.row.id, reason: "finished" });
    await expectCode(openWithToken(s2.ctx, t2.token), "finished", 410);
  });

  it("refuses a wrong or made-up token", async () => {
    const s = setup();
    const { token } = await trusted(s);
    const last = token!.slice(-1);
    const changed = token!.slice(0, -1) + (last === "A" ? "B" : "A");
    await expectCode(openWithToken(s.ctx, changed), "invalid", 404);
    await expectCode(openWithToken(s.ctx, "rvl_short"), "invalid", 404);
    await expectCode(openWithToken(s.ctx, undefined), "invalid", 404);
  });

  it("a team or expert row can never be opened with a token", async () => {
    const s = setup();
    const { row } = await createLink(s.ctx, s.asker, {
      kind: "team",
      draftId: DRAFT,
      reviewId: "rvw_team",
      reviewerName: "Priya Shah",
      reviewerUserId: TEAMMATE,
      letter,
    });
    expect(row.tokenHash).toBeNull();
    await expectCode(resolveToken(s.ctx, `rvl_${"A".repeat(43)}`), "invalid", 404);
  });
});

describe("trusted links: what the reviewer may do", () => {
  it("suggests, comments, messages and sends back", async () => {
    const s = setup();
    const { row, token } = await trusted(s);
    let state = await actWithToken(s.ctx, token, {
      action: "suggest",
      sectionId: "s2",
      proposedHtml: "<p>You may appeal within 5 working days to someone not involved.</p><script>alert(1)</script>",
      note: "Appeal to someone not involved",
    });
    expect(state.points).toHaveLength(1);
    expect(state.points[0].proposedHtml).not.toContain("<script");
    state = await actWithToken(s.ctx, token, { action: "comment", sectionId: "s1", note: "Check the name", quote: "Jordan" });
    state = await actWithToken(s.ctx, token, { action: "message", text: "Did Jordan get the first warning in writing?", id: "m1" });
    state = await actWithToken(s.ctx, token, { action: "message", text: "Did Jordan get the first warning in writing?", id: "m1" });
    expect(state.messages).toHaveLength(1);
    state = await actWithToken(s.ctx, token, { action: "send-back", verdict: "ready-with-changes", note: "Good letter." });
    expect(state.status).toBe("back");
    expect(state.rounds[0]).toMatchObject({ n: 1, verdict: "ready-with-changes", note: "Good letter." });
    expect(state.rounds[0].points).toHaveLength(2);
    // Nothing can be sent twice for the same round.
    await expectCode(actWithToken(s.ctx, token, { action: "send-back", verdict: "ready" }), "sent-back", 409);

    // The asker sees it and sends it back with a question: round 2.
    const seen = await linkStatus(s.ctx, s.asker, { linkId: row.id });
    expect(seen.points).toHaveLength(2);
    await askAgain(s.ctx, s.asker, { linkId: row.id, question: "Is 12 months fair?" });
    const again = await openWithToken(s.ctx, token);
    expect(again.state.status).toBe("out");
    expect(again.state.rounds.at(-1)).toMatchObject({ n: 2, question: "Is 12 months fair?" });
  });

  it("refuses a direct change to the letter, an approval, an export or anything else", async () => {
    const s = setup();
    const { token } = await trusted(s);
    for (const action of ["edit", "approve", "export", "set-sections", "finish", "delete"]) {
      await expectCode(actWithToken(s.ctx, token, { action, sectionId: "s1", html: "<p>New</p>" }), "not-allowed", 403);
    }
    await expectCode(actWithToken(s.ctx, token, { sectionId: "s1" }), "not-allowed", 403);
  });

  it("keeps one suggestion per part of the letter per round, and only on parts that exist", async () => {
    const s = setup();
    const { token } = await trusted(s);
    const first = await actWithToken(s.ctx, token, { action: "suggest", sectionId: "s1", proposedHtml: "<p>Dear Mr Lee,</p>" });
    await expectCode(
      actWithToken(s.ctx, token, { action: "suggest", sectionId: "s1", proposedHtml: "<p>Dear Jordan Lee,</p>" }),
      "section-taken",
      409,
    );
    await actWithToken(s.ctx, token, { action: "remove", pointId: first.points[0].id });
    const after = await actWithToken(s.ctx, token, { action: "suggest", sectionId: "s1", proposedHtml: "<p>Dear Jordan Lee,</p>" });
    expect(after.points.filter((p) => !p.removed)).toHaveLength(1);
    await expectCode(actWithToken(s.ctx, token, { action: "comment", sectionId: "nope", note: "x" }), "bad-section", 400);
  });
});

describe("signed-in callers are bound to their own rows", () => {
  it("another workspace or another person can't read or revoke a link", async () => {
    const s = setup();
    const { row } = await trusted(s);
    await expectCode(linkStatus(s.ctx, { ...s.asker, tenantId: OTHER_TENANT }, { linkId: row.id }), "not-found", 404);
    await expectCode(revokeLink(s.ctx, { ...s.asker, userId: TEAMMATE }, { linkId: row.id }), "not-found", 404);
  });

  it("a teammate sees only the reviews asked of them, and can approve only when asked to", async () => {
    const s = setup();
    const teammate: Actor = { userId: TEAMMATE, tenantId: TENANT, name: "Priya Shah" };
    await expectCode(
      createLink(s.ctx, s.asker, { kind: "team", draftId: DRAFT, reviewId: "r", reviewerName: "X", reviewerUserId: CONSULTANT, letter }),
      "not-member",
      403,
    );
    const { row } = await createLink(s.ctx, s.asker, {
      kind: "team",
      draftId: DRAFT,
      reviewId: "rvw_t",
      reviewerName: "Priya Shah",
      reviewerUserId: TEAMMATE,
      approveInSameStep: true,
      letter,
    });
    const mine = await assignedTo(s.ctx, teammate, DRAFT);
    expect(mine.map((r) => r.reviewId)).toEqual(["rvw_t"]);
    expect(await assignedTo(s.ctx, { ...s.asker }, DRAFT)).toEqual([]);
    await teamAct(s.ctx, teammate, row.id, { action: "opened" });
    const approved = await teamAct(s.ctx, teammate, row.id, { action: "approve" });
    expect(approved.approvedAt).not.toBeNull();
    // Teammates' suggestions live on the letter itself.
    await expectCode(teamAct(s.ctx, teammate, row.id, { action: "suggest", sectionId: "s1", proposedHtml: "<p>x</p>" }), "use-letter", 400);
    const back = await teamAct(s.ctx, teammate, row.id, {
      action: "send-back",
      verdict: "ready",
      points: [{ id: "sug_1", kind: "suggestion", sectionId: "s1", title: "Name the policy" }],
    });
    expect(back.status).toBe("back");
    expect(back.rounds[0].points).toEqual([{ id: "sug_1", kind: "suggestion", sectionId: "s1", title: "Name the policy" }]);
    await expectCode(teamAct(s.ctx, { ...teammate, userId: ASKER }, row.id, { action: "opened" }), "not-found", 404);
  });

  it("an expert opens only a paid, accepted booking of theirs", async () => {
    const s = setup();
    const expert: Actor = { userId: CONSULTANT, tenantId: null, name: "Claire Donnelly" };
    await createLink(s.ctx, s.asker, { kind: "expert", draftId: DRAFT, reviewId: "rvw_e", reviewerName: "Claire Donnelly", bookingId: BOOKING, letter, evidence, share: { evidence: true } });
    const view = await expertOpen(s.ctx, expert, BOOKING);
    expect(view.letter.sections).toHaveLength(2);
    expect(view.evidence.map((e) => e.id)).toEqual(["e1"]);
    const st = await expertAct(s.ctx, expert, BOOKING, { action: "comment", sectionId: "s1", note: "Fine" });
    expect(st.points).toHaveLength(1);
    await expectCode(expertOpen(s.ctx, { ...expert, userId: TEAMMATE }, BOOKING), "no-booking", 404);
    await expectCode(expertAct(s.ctx, expert, BOOKING, { action: "approve" }), "not-allowed", 403);

    const unpaid = setup({ booking: { paid: false } });
    await createLink(unpaid.ctx, unpaid.asker, { kind: "expert", draftId: DRAFT, reviewId: "rvw_e", reviewerName: "C", bookingId: BOOKING, letter });
    await expectCode(expertOpen(unpaid.ctx, expert, BOOKING), "not-paid", 402);
    const requested = setup({ booking: { status: "requested" } });
    await expectCode(expertOpen(requested.ctx, expert, BOOKING), "not-accepted", 403);
  });

  it("only the person who booked can attach a review to a booking", async () => {
    const s = setup({ booking: { requesterUserId: TEAMMATE } });
    await expectCode(
      createLink(s.ctx, s.asker, { kind: "expert", draftId: DRAFT, reviewId: "r", reviewerName: "C", bookingId: BOOKING, letter }),
      "no-booking",
      404,
    );
  });
});

describe("soft failure when the table is missing", () => {
  it("recognises a missing table or database", () => {
    expect(isNotReady({ code: "42P01", message: 'relation "review_links" does not exist' })).toBe(true);
    expect(isNotReady(new Error('relation "review_links" does not exist'))).toBe(true);
    expect(isNotReady(new Error("DATABASE_URL is not configured"))).toBe(true);
    expect(isNotReady({ cause: { code: "42P01" } })).toBe(true);
    expect(isNotReady(new Error("boom"))).toBe(false);
  });
});

describe("the link email", () => {
  it("names the asker and the letter type, gives the expiry, says no account is needed, and has no letter text", () => {
    const { subject, html } = trustedLinkEmail({
      reviewerName: "Mark Ellison",
      askerName: "Alex Morgan",
      letterType: "final_written_warning",
      url: "https://app.drafthr.io/r/rvl_abc",
      expiresAt: Date.UTC(2026, 9, 20, 12),
    });
    expect(subject).not.toMatch(/Alex|Mark|warning/);
    expect(html).toContain("Alex Morgan");
    expect(html).toContain("final written warning");
    expect(html).toContain("Tuesday 20 October");
    expect(html).toContain("don't need an account");
    expect(html).not.toContain("Dear Jordan");
    expect(html).not.toContain("appeal within");
    expect(letterTypeWords("")).toBe("letter");
  });
});
