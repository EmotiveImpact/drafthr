import { describe, expect, it } from "vitest";
import type { Draft, Section } from "@/lib/letters/types";
import {
  addWorkingDays,
  appealChipText,
  appealCloseDate,
  appealWorkingDays,
  downloadedActivity,
  earliestDateGiven,
  fmtDayMonYear,
  fmtShortDay,
  getSendPrefs,
  isValidEmail,
  recipientOf,
  sentBannerText,
  sentTimestampFor,
  type SentRecord,
} from "./record";
import { interpretEmailResponse } from "./email";

function section(sectionId: string, html: string): Section {
  return { id: sectionId, sectionId, title: sectionId, required: true, status: "ready", versions: [], html } as Section;
}

const APPEAL = section("appeal_rights", "<p>You may appeal against this warning within five working days of receiving it.</p>");

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-10-14",
      issueDate: "2026-10-14",
      deliveryMethod: "hand-delivery",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "Harbour Foods Ltd", address: "", hasLetterhead: true, signatoryName: "Alex Morgan", signatoryTitle: "HR Manager" },
    employee: { legalName: "Jordan Hale", jobTitle: "Shift lead", address: "", startDate: "2022-01-01", serviceMonths: 40 },
    answers: {},
    sections: [section("opening", "<p>Dear Jordan,</p>"), APPEAL],
    reviewStatus: "approved",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Draft;
}

/** A draft marked as sent on 14 Oct 2026 with the given record. */
function sentDraft(rec: Partial<SentRecord>, overrides: Partial<Draft> = {}): Draft {
  const at = new Date(2026, 9, 14, 16, 5).getTime();
  return makeDraft({
    exports: [{ id: "e1", format: "marked-sent", exportedAt: at }] as Draft["exports"],
    answers: {
      _sent: {
        recordedAt: at,
        way: "self",
        givenBy: "hand-delivery",
        dateGiven: "2026-10-14",
        downloaded: [],
        ...rec,
      },
    },
    ...overrides,
  });
}

describe("appeal window in working days", () => {
  it("adds five working days to Wed 14 Oct 2026 to close on Wed 21 Oct 2026", () => {
    expect(addWorkingDays("2026-10-14", 5)).toBe("2026-10-21");
    expect(fmtDayMonYear("2026-10-21")).toBe("21 Oct 2026");
  });

  it("skips the weekend from a Friday", () => {
    expect(addWorkingDays("2026-10-16", 1)).toBe("2026-10-19");
    expect(addWorkingDays("2026-10-16", 5)).toBe("2026-10-23");
  });

  it("starts counting the next working day when given on a Saturday", () => {
    expect(addWorkingDays("2026-10-17", 1)).toBe("2026-10-19");
  });

  it("reads the period from the letter's appeal section, in words or figures", () => {
    expect(appealWorkingDays(makeDraft())).toBe(5);
    const figures = makeDraft({ sections: [section("appeal_rights", "<p>Appeal within 10 working days.</p>")] });
    expect(appealWorkingDays(figures)).toBe(10);
    const both = makeDraft({ sections: [section("appeal_rights", "<p>Appeal within seven (7) working days.</p>")] });
    expect(appealWorkingDays(both)).toBe(7);
  });

  it("ignores a pending suggestion's words", () => {
    const d = makeDraft({
      sections: [
        section(
          "appeal_rights",
          '<p>You may appeal within <ins data-status="pending">ten working days or </ins>five working days.</p>'
        ),
      ],
    });
    expect(appealWorkingDays(d)).toBe(5);
  });

  it("has no appeal window for an employee's own letter or a letter without appeal", () => {
    expect(appealWorkingDays(makeDraft({ mode: "employee" }))).toBeNull();
    const offer = makeDraft({ letterType: "offer", sections: [section("opening", "<p>We are pleased to offer you the role.</p>")] });
    expect(appealCloseDate(offer, "2026-10-14")).toBeNull();
  });

  it("gives the close date from the date given", () => {
    expect(appealCloseDate(makeDraft(), "2026-10-14")).toBe("2026-10-21");
    expect(appealCloseDate(makeDraft(), null)).toBeNull();
  });
});

describe("sent banner", () => {
  it("handed over in person, PDF downloaded, in a matter", () => {
    const b = sentBannerText(sentDraft({ downloaded: ["pdf"] }), { matterName: "Jordan Hale, conduct" });
    expect(b).toEqual({
      title: "Marked as sent on 14 October, handed over in person.",
      detail:
        "The PDF is in your downloads and a copy is saved to Jordan Hale, conduct. The appeal window closes on 21 October.",
    });
  });

  it("PDF and evidence pack", () => {
    const b = sentBannerText(sentDraft({ downloaded: ["pdf", "pack"] }), { matterName: "Jordan Hale, conduct" });
    expect(b?.detail).toBe(
      "The PDF and the evidence pack are in your downloads and a copy is saved to Jordan Hale, conduct. The appeal window closes on 21 October."
    );
  });

  it("three downloads read as a list", () => {
    const b = sentBannerText(sentDraft({ downloaded: ["pdf", "docx", "audit"] }), {});
    expect(b?.detail).toBe(
      "The PDF, the Word file and the audit record are in your downloads and a copy is saved with this letter. The appeal window closes on 21 October."
    );
  });

  it("nothing downloaded, not in a matter", () => {
    const b = sentBannerText(sentDraft({ downloaded: [] }), {});
    expect(b?.detail).toBe("A copy is saved with this letter. The appeal window closes on 21 October.");
  });

  it("says how it was given for each way of handing over", () => {
    expect(sentBannerText(sentDraft({ givenBy: "post" }))?.title).toBe("Marked as sent on 14 October, sent by post.");
    expect(sentBannerText(sentDraft({ givenBy: "recorded-delivery" }))?.title).toBe(
      "Marked as sent on 14 October, sent by recorded delivery."
    );
    expect(sentBannerText(sentDraft({ givenBy: "email" }))?.title).toBe(
      "Marked as sent on 14 October, emailed from your own inbox."
    );
  });

  it("an older send with no record names only the delivery method, not an inbox", () => {
    const at = new Date(2026, 9, 14, 16, 5).getTime();
    const base = makeDraft({ exports: [{ id: "e1", format: "marked-sent", exportedAt: at }] as Draft["exports"] });
    const d = { ...base, context: { ...base.context, deliveryMethod: "email" as const } };
    expect(sentBannerText(d)?.title).toBe("Marked as sent on 14 October, sent by email.");
  });

  it("leaves out the appeal sentence for a letter with no right of appeal", () => {
    const d = sentDraft(
      { downloaded: ["pdf"] },
      { letterType: "offer", sections: [section("opening", "<p>We are pleased to offer you the role.</p>")] }
    );
    expect(sentBannerText(d, {})?.detail).toBe("The PDF is in your downloads and a copy is saved with this letter.");
    expect(appealChipText(d)).toBeNull();
  });

  it("emailed from DraftHR names the person and the time", () => {
    const b = sentBannerText(
      sentDraft({ way: "email", givenBy: "email", emailedTo: "jordan.hale@harbourfoods.co.uk", emailedName: "Jordan Hale" }),
      { matterName: "Jordan Hale, conduct" }
    );
    expect(b?.title).toMatch(/^Emailed to Jordan Hale at 16:05\.$/);
    expect(b?.detail).toBe("A copy is saved to Jordan Hale, conduct. The appeal window closes on 21 October.");
  });

  it("is null for a letter that is not sent", () => {
    expect(sentBannerText(makeDraft())).toBeNull();
  });

  it("gives the appeal chip", () => {
    expect(appealChipText(sentDraft({ appealDeadline: "2026-10-21" }))).toBe("Appeal by 21 Oct 2026");
  });

  it("words the downloads for Activity", () => {
    expect(downloadedActivity(["pdf", "pack"])).toBe("Downloaded PDF and evidence pack");
    expect(downloadedActivity([])).toBeNull();
  });
});

describe("dates, prefs and recipient", () => {
  it("formats the short day without commas", () => {
    expect(fmtShortDay("2026-10-14")).toBe("Wed 14 Oct");
  });

  it("records today at the current time and a past date at that time of day", () => {
    const now = new Date(2026, 9, 14, 16, 5, 30);
    expect(sentTimestampFor("2026-10-14", now)).toBe(now.getTime());
    expect(sentTimestampFor("2026-10-12", now)).toBe(new Date(2026, 9, 12, 16, 5, 30).getTime());
  });

  it("defaults the Send step: in person, today, PDF, and the pack when there is evidence", () => {
    const p = getSendPrefs(makeDraft({ evidence: [{ id: "ev1" }] as Draft["evidence"] }), "2026-10-14");
    expect(p).toMatchObject({ way: "self", givenBy: "hand-delivery", dateGiven: "2026-10-14" });
    expect(p.downloads).toEqual({ pdf: true, docx: false, pack: true, audit: false });
    expect(getSendPrefs(makeDraft(), "2026-10-14").downloads.pack).toBe(false);
  });

  it("brings a saved future date back to today", () => {
    const d = makeDraft({ answers: { _send: { dateGiven: "2026-12-01" } } });
    expect(getSendPrefs(d, "2026-10-14").dateGiven).toBe("2026-10-14");
  });

  it("never takes a date given before the letter was approved", () => {
    const approvedAt = new Date(2026, 9, 13, 11, 2).getTime();
    const d = makeDraft({
      createdAt: new Date(2026, 9, 5).getTime(),
      approvals: [{ id: "a1", decision: "approved", reviewerName: "Ruth", createdAt: approvedAt }] as Draft["approvals"],
      answers: { _send: { dateGiven: "2026-10-06" } },
    });
    expect(earliestDateGiven(d, "2026-10-14")).toBe("2026-10-13");
    expect(getSendPrefs(d, "2026-10-14").dateGiven).toBe("2026-10-13");
    // Without an approval, the day the letter was started.
    const started = makeDraft({ createdAt: new Date(2026, 9, 5, 9).getTime() });
    expect(earliestDateGiven(started, "2026-10-14")).toBe("2026-10-05");
    // No known start: no limit.
    expect(earliestDateGiven(makeDraft({ createdAt: 0 }), "2026-10-14")).toBe("");
  });

  it("emails only a single valid address stored on the letter", () => {
    expect(isValidEmail("jordan.hale@harbourfoods.co.uk")).toBe(true);
    expect(isValidEmail("a@x.com, b@evil.example")).toBe(false);
    expect(isValidEmail("Boss <a@x.com>")).toBe(false);
    const withEmail = makeDraft({ employee: { ...makeDraft().employee, email: "jordan.hale@harbourfoods.co.uk" } });
    expect(recipientOf(withEmail)).toMatchObject({ name: "Jordan Hale", short: "Jordan", email: "jordan.hale@harbourfoods.co.uk" });
    expect(recipientOf(makeDraft()).email).toBeNull();
  });

  it("sends an employee's own letter to the employer", () => {
    const d = makeDraft({ mode: "employee", answers: { recipientEmail: "alex.morgan@harbourfoods.co.uk" } });
    expect(recipientOf(d)).toMatchObject({ name: "Alex Morgan", short: "Alex", email: "alex.morgan@harbourfoods.co.uk", toEmployer: true });
  });
});

describe("email replies in plain words", () => {
  it("maps each reply", () => {
    expect(interpretEmailResponse(200, { ok: true, id: "em_1" })).toEqual({ ok: true, id: "em_1" });
    const reason = (status: number, body: unknown) => {
      const r = interpretEmailResponse(status, body);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason(200, { ok: false, reason: "not-configured" })).toBe("not-ready");
    expect(reason(200, { ok: false, reason: "send-failed" })).toBe("send-failed");
    expect(reason(401, { error: "Unauthorized" })).toBe("signed-out");
    expect(reason(403, { error: "viewer" })).toBe("viewer");
    expect(reason(403, { error: "Forbidden" })).toBe("other-workspace");
    expect(reason(404, { error: "Unknown store path" })).toBe("not-ready");
    expect(reason(404, { error: "Not found" })).toBe("not-synced");
    expect(reason(409, { error: "recipient-changed" })).toBe("not-synced");
    expect(reason(422, { error: "no-recipient-email" })).toBe("no-address");
    expect(reason(400, { error: "invalid-address" })).toBe("invalid-address");
    expect(reason(429, { error: "rate" })).toBe("rate-limited");
    expect(reason(500, null)).toBe("not-ready");
    expect(reason(500, { error: "boom" })).toBe("send-failed");
  });
});
