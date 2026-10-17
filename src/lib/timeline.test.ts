import { describe, expect, it } from "vitest";
import { buildDraftTimeline } from "@/lib/timeline";
import type { Draft } from "@/lib/letters/types";

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: { jurisdiction: "UK" },
    employer: { legalName: "Acme Ltd" },
    employee: { legalName: "Jamie Worker" },
    answers: {},
    sections: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as unknown as Draft;
}

describe("counsel reviews on the timeline (HOME-X50)", () => {
  it("lists one sign-off carried on several files once", () => {
    const signOff = { reviewedBy: "Priya Shah", reviewedOn: "2026-10-13" };
    const d = draft({
      exports: [
        { id: "x1", format: "pdf", exportedAt: 10, ...signOff },
        { id: "x2", format: "pack", exportedAt: 11, ...signOff },
        { id: "x3", format: "marked-sent", exportedAt: 12, ...signOff },
      ],
      answers: { _counselReview: signOff },
    } as Partial<Draft>);
    const reviews = buildDraftTimeline(d).filter((t) => t.kind === "counsel_review");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].title).toBe("Counsel review by Priya Shah");
    expect(reviews[0].detail).toBe("Reviewed on 13 Oct 2026");
    // Listed with the first file it went out on.
    expect(reviews[0].createdAt).toBe(10);
    // Every download is still there.
    expect(buildDraftTimeline(d).filter((t) => t.kind === "exported")).toHaveLength(3);
  });

  it("keeps different sign-offs apart", () => {
    const d = draft({
      exports: [
        { id: "x1", format: "pdf", exportedAt: 10, reviewedBy: "Priya Shah", reviewedOn: "2026-10-13" },
        { id: "x2", format: "pdf", exportedAt: 20, reviewedBy: "Priya Shah", reviewedOn: "2026-10-20" },
        { id: "x3", format: "pdf", exportedAt: 30, reviewedBy: "Sam Lee", reviewedOn: "2026-10-20" },
      ],
    } as Partial<Draft>);
    expect(buildDraftTimeline(d).filter((t) => t.kind === "counsel_review")).toHaveLength(3);
  });
});

describe("downloads on the timeline in plain words (SEND-X43)", () => {
  it("never shows the format codes the store records", () => {
    const d = draft({
      timeline: [
        {
          id: "a",
          kind: "exported",
          title: "Exported as PDF",
          createdAt: 5,
          detail: "Counsel review attested by Priya Shah",
          meta: { exportId: "x1", format: "pdf" },
        },
        { id: "b", kind: "exported", title: "Exported as MARKED-SENT", createdAt: 6 },
      ],
      exports: [
        { id: "x1", format: "pdf", exportedAt: 5 },
        { id: "x2", format: "docx", exportedAt: 7 },
        { id: "x4", format: "pack", exportedAt: 8 },
      ],
    } as Partial<Draft>);
    const items = buildDraftTimeline(d).filter((t) => t.kind === "exported");
    const titles = items.map((t) => t.title);
    expect(titles).toEqual([
      "Downloaded the evidence pack",
      "Downloaded as Word",
      "Marked as sent",
      "Downloaded as PDF",
    ]);
    expect(titles.join(" ")).not.toMatch(/Exported as|DOCX/);
    expect(items.find((t) => t.id === "a")?.detail).toBe("Counsel review by Priya Shah");
    // The format code stays on the event for code that needs it.
    expect(items.find((t) => t.id === "b")?.meta?.format).toBe("marked-sent");
  });
});
