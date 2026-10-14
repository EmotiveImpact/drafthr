import { describe, it, expect } from "vitest";
import type { Draft } from "@/lib/letters/types";
import type { JourneyInfo } from "@/lib/journey/stage";
import { ageWords, needsYouItems, shortDay, summaryFor, type LetterJourney } from "./homeData";
import { askedAgo, approvalsLedeParts, isForMe, recentlyApprovedBy, waitingLetters } from "./approvalData";
import { buildIcs, daysLeftLabel, daysLeftTone, shortCitation, type CalendarEvent } from "./calendarEvents";
import { feedAgo, groupFeed, plain, snoozeUntil, workingDaysUntil } from "./notificationFeed";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 13, 12, 0, 0).getTime(); // Tue 13 Oct 2026

function draft(id: string, over: Partial<Draft> = {}): Draft {
  return {
    id,
    mode: "employer",
    letterType: "termination",
    employee: { legalName: "Jane Doe" },
    employer: { legalName: "Acme Ltd" },
    sections: [],
    answers: {},
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...over,
  } as unknown as Draft;
}

describe("words for time", () => {
  it("never says 0 or 1 minutes", () => {
    expect(ageWords(0)).toBe("1 minute");
    expect(ageWords(5 * MIN)).toBe("5 minutes");
    expect(ageWords(HOUR)).toBe("1 hour");
    expect(ageWords(3 * DAY)).toBe("3 days");
  });

  it("asked-ago words", () => {
    expect(askedAgo(NOW - 10_000, NOW)).toBe("Just now");
    expect(askedAgo(NOW - 20 * MIN, NOW)).toBe("20m ago");
    expect(askedAgo(NOW - 5 * HOUR, NOW)).toBe("5h ago");
    expect(askedAgo(NOW - 30 * HOUR, NOW)).toBe("Yesterday");
    expect(askedAgo(NOW - 2 * DAY, NOW)).toBe("2 days ago");
  });

  it("short day has no commas", () => {
    expect(shortDay(new Date(2026, 9, 9))).toBe("Fri 9 Oct");
    expect(shortDay(NOW)).not.toContain(",");
  });

  it("feed times", () => {
    expect(feedAgo(NOW, NOW)).toBe("now");
    expect(feedAgo(NOW - 25 * MIN, NOW)).toBe("25m");
    expect(feedAgo(NOW - 2 * HOUR, NOW)).toBe("2h");
    expect(feedAgo(NOW - DAY, NOW)).toBe("Yesterday");
    expect(feedAgo(new Date(2026, 9, 9, 9).getTime(), NOW)).toBe("Fri 9 Oct");
  });
});

describe("approvals", () => {
  it("lists only real letters in review", () => {
    const drafts = {
      a: draft("a", { reviewStatus: "in_review" }),
      b: draft("b", { reviewStatus: "approved" }),
      c: draft("c", { reviewStatus: "in_review", isTemplateSource: true }),
    };
    expect(waitingLetters(drafts).map((d) => d.id)).toEqual(["a"]);
  });

  it("matches the approver by name, or the shared reviewer", () => {
    expect(isForMe({ approver: "Alex Morgan" }, "alex morgan")).toBe(true);
    expect(isForMe({ approver: "Workspace reviewer" }, "Alex Morgan")).toBe(true);
    expect(isForMe({ approver: "Ruth Adeyemi" }, "Alex Morgan")).toBe(false);
  });

  it("the band line counts every waiting letter and words the oldest wait like the rows", () => {
    const parts = approvalsLedeParts([{ askedAt: NOW - 2 * DAY }, { askedAt: NOW - HOUR }], 1, NOW);
    expect(parts).toEqual({ count: 2, mine: 1, sent: "sent 2 days ago" });
    // The same words as the row's askedAgo ("Just now"), never "a minute ago".
    expect(approvalsLedeParts([{ askedAt: NOW - 10_000 }], 1, NOW)?.sent).toBe("sent just now");
    expect(approvalsLedeParts([{ askedAt: NOW - 30 * HOUR }], 0, NOW)?.sent).toBe("sent yesterday");
    expect(approvalsLedeParts([], 0, NOW)).toBeNull();
  });

  it("recently approved by me, newest first", () => {
    const drafts = {
      a: draft("a", { approvals: [{ id: "1", reviewerName: "Alex Morgan", decision: "approved", createdAt: NOW - DAY }] }),
      b: draft("b", { approvals: [{ id: "2", reviewerName: "Alex Morgan", decision: "approved", createdAt: NOW - HOUR }] }),
      c: draft("c", { approvals: [{ id: "3", reviewerName: "Ruth", decision: "approved", createdAt: NOW }] }),
    } as Record<string, Draft>;
    expect(recentlyApprovedBy(drafts, "Alex Morgan").map((r) => r.draftId)).toEqual(["b", "a"]);
  });
});

describe("calendar", () => {
  it("days-left words and tones", () => {
    expect(daysLeftLabel(0)).toBe("Today");
    expect(daysLeftLabel(1)).toBe("Tomorrow");
    expect(daysLeftLabel(-1)).toBe("Yesterday");
    expect(daysLeftLabel(-3)).toBe("3 days ago");
    expect(daysLeftLabel(5)).toBe("In 5 days");
    expect(daysLeftTone({ type: "tribunal", daysAway: 40 })).toBe("red");
    expect(daysLeftTone({ type: "hearing", daysAway: 3 })).toBe("amber");
    expect(daysLeftTone({ type: "hearing", daysAway: 30 })).toBe("grey");
  });

  it("pulls a short citation out of a long basis", () => {
    expect(shortCitation("ERA 1996 s.111(2)")).toBe("ERA 1996 s.111(2)");
    expect(shortCitation("Three months less a day under ERA 1996 s.111(2), from the effective date")).toBe(
      "ERA 1996 s.111(2)"
    );
    expect(shortCitation(undefined)).toBeUndefined();
  });

  it("writes one all-day event per date with unique ids", () => {
    const ev = (iso: string) =>
      ({ draftId: "d1", kind: "hearing", iso, title: "Hearing", person: "Tom Ellis", label: "Hearing", basis: "ACAS Code" }) as unknown as CalendarEvent;
    const ics = buildIcs([ev("2026-10-15"), ev("2026-10-16")], new Date(NOW));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("DTEND;VALUE=DATE:20261016");
    expect(ics).toContain("SUMMARY:Hearing\\, Tom Ellis");
    const uids = ics.split("\r\n").filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(2);
  });
});

describe("notifications", () => {
  it("counts working days only", () => {
    // Tue 13 Oct to Sat 17 Oct: Wed, Thu, Fri.
    expect(workingDaysUntil("2026-10-17", new Date(NOW))).toBe(3);
    expect(workingDaysUntil("2026-10-13", new Date(NOW))).toBe(0);
    expect(workingDaysUntil("2026-10-20", new Date(NOW))).toBe(5);
  });

  it("groups Today and Earlier, most urgent then newest", () => {
    const items = [
      { id: "1", severity: "info" as const, time: NOW - HOUR },
      { id: "2", severity: "urgent" as const, time: NOW - 2 * HOUR },
      { id: "3", severity: "warn" as const, time: NOW - 2 * DAY },
      { id: "4", severity: "info" as const, time: NOW - 10 * MIN },
    ];
    const { today, earlier } = groupFeed(items, NOW);
    expect(today.map((i) => i.id)).toEqual(["2", "4", "1"]);
    expect(earlier.map((i) => i.id)).toEqual(["3"]);
  });

  it("snoozes until the start of tomorrow", () => {
    expect(snoozeUntil(NOW)).toBe(new Date(2026, 9, 14).getTime());
  });

  it("flattens title parts", () => {
    expect(plain(["Hearing for ", { b: "Tom Ellis" }, " is tomorrow"])).toBe("Hearing for Tom Ellis is tomorrow");
  });
});

describe("needs you agrees with the Letters page", () => {
  const counts = {
    sections: 3,
    sectionsDrafted: 3,
    requiredSectionsEmpty: 0,
    streaming: false,
    pendingSuggestions: 0,
    failingRequired: 0,
    warnings: 0,
    checksTotal: 16,
    checksPassing: 16,
    evidence: 0,
    unresolvedComments: 0,
  };
  const j = (over: Partial<JourneyInfo>): JourneyInfo =>
    ({
      stage: "draft",
      tone: "yours",
      statusLabel: "Draft",
      statusTone: "grey",
      whereLabel: "Draft",
      whatNow: { lead: "", detail: "" },
      primaryAction: null,
      secondaryAction: null,
      needsYou: false,
      listTone: "yours",
      stepIndex: 0,
      locked: false,
      review: null,
      counts,
      ...over,
    }) as JourneyInfo;
  const letters: LetterJourney[] = [
    // Draft with a failing check: needs you (Letters shows it in Needs you).
    {
      draft: draft("fix", { employee: { legalName: "Jordan Hale" } } as Partial<Draft>),
      journey: j({ needsYou: true, whereLabel: "Draft · 1 check to fix", counts: { ...counts, failingRequired: 1 } }),
    },
    // Approved, ready to send: needs you.
    {
      draft: draft("send", {
        reviewStatus: "approved",
        approvals: [{ id: "a", reviewerName: "Ruth Adeyemi", decision: "approved", createdAt: NOW }],
      } as Partial<Draft>),
      journey: j({ stage: "send", statusLabel: "Approved", statusTone: "green", needsYou: true }),
    },
    // With someone else for approval: does not need you.
    {
      draft: draft("away", { reviewStatus: "in_review" }),
      journey: j({ stage: "approve", tone: "away", statusLabel: "Waiting for Ruth", statusTone: "blue" }),
    },
    // Waiting for your own approval: needs you, at the Approve stage.
    {
      draft: draft("mine", { reviewStatus: "in_review" }),
      journey: j({ stage: "approve", tone: "needs-you", statusLabel: "Needs your approval", needsYou: true, whereLabel: "Approve · needs you" }),
    },
    // Ready for review, nothing to fix: does not need you.
    { draft: draft("ready"), journey: j({ stage: "review", statusLabel: "Ready for review", statusTone: "blue" }) },
    // Sent.
    { draft: draft("sent"), journey: j({ stage: "sent", statusLabel: "Sent", statusTone: "green" }) },
  ];

  it("counts the letters that need you, the same rule as Letters", () => {
    expect(summaryFor(letters)).toEqual({ inProgress: 5, needYou: 3 });
  });

  it("lists every letter that needs you, and only those", () => {
    const items = needsYouItems({ journeys: letters, tasks: {}, matters: {}, events: [], now: NOW });
    expect(items.map((i) => i.id).sort()).toEqual(["draft:fix", "review:mine", "send:send"]);
    const fix = items.find((i) => i.id === "draft:fix")!;
    expect(fix.title).toMatch(/ for Jordan Hale$/);
    expect(fix.meta).toBe("1 compliance issue to fix before sending");
    expect(fix.pill).toEqual({ label: "Draft", tone: "amber" });
    const send = items.find((i) => i.id === "send:send")!;
    expect(send.meta).toBe("Approved by Ruth Adeyemi, ready to send");
  });

  it("calls a letter waiting for your own approval Approval, not Review (HOME-X36)", () => {
    const items = needsYouItems({ journeys: letters, tasks: {}, matters: {}, events: [], now: NOW });
    const mine = items.find((i) => i.id === "review:mine")!;
    expect(mine.pill).toEqual({ label: "Approval", tone: "amber" });
    expect(mine.meta).toMatch(/^Waiting for your approval, asked /);
  });
});
