import { beforeEach, describe, expect, it } from "vitest";
import type { Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { getJourney } from "@/lib/journey/stage";
import { useJourneyUI } from "@/components/journey/ui-store";
import { markLetterSent, saveAppealHearing, undoMarkedSent, undoToastText } from "./actions";
import { getSentRecord, sentBannerText, sentWhatNow } from "./record";
import { buildDraftTimeline } from "@/lib/timeline";
import { buildAuditRecord } from "./exports";
import { activityEvents } from "@/components/editor/letter-facts";

const PASSING = [{ id: "a", label: "a", severity: "pass" as const, dimension: "compliance" as const }];

function section(sectionId: string, html: string): Section {
  return { id: sectionId, sectionId, title: sectionId, required: true, status: "ready", versions: [], html } as Section;
}

function seed(overrides: Partial<Draft> = {}): Draft {
  const d = {
    id: "send-test-1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-10-14",
      issueDate: "2026-10-14",
      deliveryMethod: "post",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "Harbour Foods Ltd", address: "", hasLetterhead: true, signatoryName: "Alex Morgan", signatoryTitle: "HR Manager" },
    employee: { legalName: "Jordan Hale", jobTitle: "Shift lead", address: "", startDate: "2022-01-01", serviceMonths: 40 },
    answers: { appealDeadline: "2026-09-30" },
    sections: [
      section("opening", "<p>Dear Jordan,</p>"),
      section("appeal_rights", "<p>You may appeal within five working days.</p>"),
    ],
    reviewStatus: "approved",
    exports: [],
    timeline: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Draft;
  useDraftStore.setState((s) => ({ drafts: { ...s.drafts, [d.id]: d } }));
  return d;
}

const draft = (id = "send-test-1") => useDraftStore.getState().drafts[id]!;
const now = new Date(2026, 9, 14, 16, 5);

beforeEach(() => {
  useDraftStore.setState({ drafts: {} });
  useJourneyUI.getState().clearJustSent();
});

describe("mark as sent, then undo", () => {
  it("moves the letter to Sent with the record, the delivery method and the appeal date", () => {
    seed();
    expect(getJourney(draft(), null, { checks: PASSING }).stage).toBe("send");
    markLetterSent(
      "send-test-1",
      { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", downloaded: ["pdf", "pack"], actorName: "Alex Morgan" },
      now
    );
    const d = draft();
    expect(getJourney(d, null, { checks: PASSING }).stage).toBe("sent");
    expect(d.context.deliveryMethod).toBe("hand-delivery");
    expect(d.answers.appealDeadline).toBe("2026-10-21");
    expect(getSentRecord(d)).toMatchObject({ way: "self", dateGiven: "2026-10-14", downloaded: ["pdf", "pack"], appealDeadline: "2026-10-21" });
    expect(sentBannerText(d)?.title).toBe("Marked as sent on 14 October, handed over in person.");
    expect(d.timeline?.some((e) => e.title === "Handed over in person")).toBe(true);
    expect(useJourneyUI.getState().justSent?.draftId).toBe("send-test-1");
  });

  it("times a back-dated send at that date", () => {
    seed();
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-12", downloaded: [] }, now);
    const sent = draft().exports!.find((e) => e.format === "marked-sent")!;
    expect(new Date(sent.exportedAt).getDate()).toBe(12);
    expect(draft().answers.appealDeadline).toBe("2026-10-19");
  });

  it("lists a back-dated send in Activity when it was recorded, saying the day it was given", () => {
    seed({
      timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: new Date(2026, 9, 13, 9).getTime() }],
    });
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-12", downloaded: [] }, now);
    const ev = draft().timeline!.find((e) => e.meta?.action === "sent")!;
    expect(ev.createdAt).toBe(now.getTime());
    expect(ev.detail).toBe("Given on 12 Oct 2026");
    const sent = draft().exports!.find((e) => e.format === "marked-sent")!;
    expect(ev.meta?.sentExportAt).toBe(sent.exportedAt);
    const rows = activityEvents(draft(), null, "Alex Morgan");
    // Newest first, one line for the send, above "Started".
    expect(rows.map((r) => r.title)).toEqual(["Sent by post on Mon 12 Oct", "Started Warning letter"]);
  });

  it("dates a back-dated send's export entry, and its counsel review, when it was recorded (SEND-X35)", () => {
    seed();
    markLetterSent(
      "send-test-1",
      {
        way: "self",
        givenBy: "post",
        dateGiven: "2026-10-09",
        downloaded: [],
        attestation: { reviewedBy: "Priya Shah", reviewedOn: "2026-10-08" },
      },
      now
    );
    const sent = draft().exports!.find((e) => e.format === "marked-sent")!;
    // The export keeps the date given (the seal, the lists, the appeal window)...
    expect(new Date(sent.exportedAt).getDate()).toBe(9);
    // ...but nothing in Activity is dated on the 9th, when nothing happened.
    const items = buildDraftTimeline(draft());
    expect(items.some((t) => new Date(t.createdAt).getDate() === 9)).toBe(false);
    const entry = items.find((t) => t.kind === "exported" && t.meta?.exportId === sent.id)!;
    expect(entry.createdAt).toBe(now.getTime());
    expect(items.find((t) => t.kind === "counsel_review")?.createdAt).toBe(now.getTime());
    // The editor's margin card still shows the send once.
    expect(activityEvents(draft(), null, "Alex Morgan").map((r) => r.title)).toEqual(["Sent by post on Fri 9 Oct"]);
  });

  it("Undo restores the Send step, the earlier appeal date and clears the hearing", () => {
    seed();
    markLetterSent("send-test-1", { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", downloaded: ["pdf"] }, now);
    saveAppealHearing("send-test-1", "2026-10-28");
    expect(draft().answers.appealHearingDate).toBe("2026-10-28");

    const result = undoMarkedSent("send-test-1", "Alex Morgan");
    expect(result).toEqual({ undone: true, emailed: false, to: undefined });
    const d = draft();
    expect(getJourney(d, null, { checks: PASSING }).stage).toBe("send");
    expect(d.answers._sent).toBeUndefined();
    expect(d.answers.appealHearingDate).toBeUndefined();
    expect(d.answers.appealDeadline).toBe("2026-09-30");
    expect(d.exports?.some((e) => e.format === "marked-sent")).toBe(false);
    expect(d.timeline?.some((e) => e.title === "Marked as not sent")).toBe(true);
    expect(useJourneyUI.getState().justSent).toBeNull();
    expect(undoToastText(result)).toBe("Back to ready to send.");
  });

  it("Undo removes the appeal date the send added when there was none before", () => {
    seed({ answers: {} });
    markLetterSent("send-test-1", { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", downloaded: [] }, now);
    undoMarkedSent("send-test-1");
    expect(draft().answers.appealDeadline).toBeUndefined();
  });

  it("Undo after an email says the email has already gone", () => {
    seed();
    markLetterSent(
      "send-test-1",
      {
        way: "email",
        givenBy: "email",
        dateGiven: "2026-10-14",
        downloaded: [],
        emailedTo: "jordan.hale@harbourfoods.co.uk",
        emailedName: "Jordan Hale",
        emailId: "em_1",
      },
      now
    );
    const result = undoMarkedSent("send-test-1");
    expect(result).toEqual({ undone: true, emailed: true, to: "Jordan Hale" });
    expect(undoToastText(result)).toBe(
      "Back to ready to send. The email has already gone to Jordan Hale; only DraftHR's record has changed."
    );
    expect(draft().timeline?.find((e) => e.title === "Marked as not sent")?.detail).toBe(
      "The email to jordan.hale@harbourfoods.co.uk had already gone"
    );
  });

  it("does nothing when the letter is not sent", () => {
    seed();
    expect(undoMarkedSent("send-test-1")).toEqual({ undone: false, emailed: false });
  });
});

describe("audit record", () => {
  it("records the send it goes out with, and names who drafted it", () => {
    const d = seed({
      timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1, actorName: "Alex Morgan" }],
      approvals: [{ id: "a1", decision: "approved", reviewerName: "Ruth Adeyemi", createdAt: 2 }] as Draft["approvals"],
    });
    const text = buildAuditRecord(d, undefined, now.getTime(), {
      pendingSend: { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", actorName: "Alex Morgan" },
    });
    expect(text).toMatch(/^Drafted {10}Alex Morgan, /m);
    expect(text).toMatch(/^Sent {13}Handed over in person, given 14 Oct 2026, recorded by Alex Morgan/m);
    expect(text).not.toMatch(/Not yet|The letter's author/);
  });

  it("names the letter's author as its drafter, not whoever sends it (SEND-29)", () => {
    const d = seed({
      timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1, actorName: "Alex Morgan" }],
    });
    const text = buildAuditRecord(d, undefined, now.getTime(), {
      pendingSend: { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", actorName: "Ruth Adeyemi" },
    });
    expect(text).toMatch(/^Drafted {10}Alex Morgan, /m);
    expect(text).toMatch(/recorded by Ruth Adeyemi/);
    expect(text).not.toMatch(/^Drafted {10}Ruth/m);
  });

  it("says the drafter is not recorded when the letter does not name one", () => {
    const d = seed({ timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1 }] });
    expect(buildAuditRecord(d, undefined, now.getTime())).toMatch(/^Drafted {10}Not recorded, /m);
  });

  it("names the owner collaborator when the created event has no name", () => {
    const d = seed({
      timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1 }],
      collaborators: [{ id: "o", email: "alex@harbourfoods.co.uk", name: "Alex Morgan", role: "owner", status: "active", invitedAt: 1 }],
    });
    expect(buildAuditRecord(d, undefined, now.getTime())).toMatch(/^Drafted {10}Alex Morgan, /m);
  });

  it("lists a back-dated send when it was recorded, with the day it was given (SEND-X2)", () => {
    seed({ timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1 }] });
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-09", downloaded: [] }, now);
    const text = buildAuditRecord(draft(), undefined, now.getTime());
    expect(text).toMatch(/^14 Oct 2026, 16:05 {2}Marked as sent, given 9 Oct 2026$/m);
    expect(text).not.toMatch(/^9 Oct 2026, 16:05/m);
  });

  it("never names the approver as who sent it for approval, and keeps one label column (SEND-X38)", () => {
    const d = seed({
      reviewStatus: "approved",
      approvals: [
        { id: "s1", decision: "submitted", reviewerName: "Ruth Adeyemi", createdAt: 2 },
        { id: "a1", decision: "approved", reviewerName: "Ruth Adeyemi", createdAt: 3 },
      ] as Draft["approvals"],
      timeline: [
        { id: "t1", kind: "review_submitted", title: "Submitted for review to Ruth Adeyemi", createdAt: 2, actorName: "Ruth Adeyemi" },
      ],
    });
    const text = buildAuditRecord(d, undefined, now.getTime());
    expect(text).toMatch(/ {2}Sent to Ruth Adeyemi to approve$/m);
    expect(text).not.toMatch(/Submitted for review to Ruth Adeyemi \(Ruth Adeyemi\)/);
    // Every WHO DID WHAT value starts in the same column.
    const who = text.split("WHO DID WHAT")[1].split("\n\n")[0].split("\n").slice(2);
    const starts = who.map((l) => l.search(/(?<=^.{15} {2})\S/));
    expect(new Set(starts)).toEqual(new Set([17]));
  });

  it("reads the send from the letter once it is sent", () => {
    seed();
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-14", downloaded: ["pdf"] }, now);
    expect(buildAuditRecord(draft(), undefined, now.getTime())).toMatch(/^Sent {13}Sent by post, given 14 Oct 2026/m);
  });
});

describe("the line above the Sent panel (SEND-X37)", () => {
  it("says what was recorded in the send moment, then leads into the appeal rows", () => {
    seed({ matterId: "m1" });
    markLetterSent("send-test-1", { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", downloaded: [] }, now);
    expect(sentWhatNow(draft(), "moment")).toEqual({ lead: "Sent.", detail: "Handed over in person on Wed 14 Oct." });
    expect(sentWhatNow(draft(), "next")).toEqual({ lead: "Sent.", detail: "What's next for this matter:" });
  });

  it("keeps the line about the send for a letter with no appeal window, with no colon leading nowhere", () => {
    seed({ letterType: "promotion", sections: [section("opening", "<p>Dear Chris,</p>")], answers: {} });
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-14", downloaded: ["pdf"] }, now);
    expect(sentWhatNow(draft(), "next")).toEqual({ lead: "Sent.", detail: "Sent by post on Wed 14 Oct." });
  });
});
