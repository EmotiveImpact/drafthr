import { beforeEach, describe, expect, it } from "vitest";
import type { Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { getJourney } from "@/lib/journey/stage";
import { useJourneyUI } from "@/components/journey/ui-store";
import { markLetterSent, saveAppealHearing, undoMarkedSent, undoToastText } from "./actions";
import { getSentRecord, sentBannerText } from "./record";
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
      timeline: [{ id: "c", kind: "created", title: "Created Warning letter", createdAt: 1 }],
      approvals: [{ id: "a1", decision: "approved", reviewerName: "Ruth Adeyemi", createdAt: 2 }] as Draft["approvals"],
    });
    const text = buildAuditRecord(d, undefined, now.getTime(), {
      drafterName: "Alex Morgan",
      pendingSend: { way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14", actorName: "Alex Morgan" },
    });
    expect(text).toMatch(/^Drafted {8}Alex Morgan, /m);
    expect(text).toMatch(/^Sent {11}Handed over in person, given 14 Oct 2026, recorded by Alex Morgan/m);
    expect(text).not.toMatch(/Not yet|The letter's author/);
  });

  it("reads the send from the letter once it is sent", () => {
    seed();
    markLetterSent("send-test-1", { way: "self", givenBy: "post", dateGiven: "2026-10-14", downloaded: ["pdf"] }, now);
    expect(buildAuditRecord(draft(), undefined, now.getTime())).toMatch(/^Sent {11}Sent by post, given 14 Oct 2026/m);
  });
});
