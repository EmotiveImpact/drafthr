import { describe, expect, it } from "vitest";
import type { DraftTimelineItem } from "@/lib/timeline";
import { downloads, readableTimeline } from "./timeline-view";

const item = (p: Partial<DraftTimelineItem> & Pick<DraftTimelineItem, "id" | "kind" | "createdAt" | "title">): DraftTimelineItem => ({
  category: p.kind === "exported" ? "exports" : p.kind === "counsel_review" ? "reviews" : "changes",
  source: "stored",
  ...p,
});

describe("readableTimeline", () => {
  const t = 1_760_000_000_000;
  const events = [
    item({ id: "s", kind: "details_updated", createdAt: t + 1000, title: "Handed over in person", meta: { action: "sent" } }),
    item({ id: "e1", kind: "exported", createdAt: t, title: "Exported as MARKED-SENT", meta: { exportId: "x1", format: "marked-sent", reviewedBy: "Priya Shah" } }),
    item({ id: "e2", kind: "exported", createdAt: t - 5000, title: "Exported as PACK", meta: { exportId: "x2", format: "pack", reviewedBy: "Priya Shah" } }),
    item({ id: "r2", kind: "counsel_review", createdAt: t - 5000, title: "Counsel review attested by Priya Shah", detail: "2026-10-12", meta: { exportId: "x2", reviewedBy: "Priya Shah", reviewedOn: "2026-10-12" } }),
    item({ id: "e3", kind: "exported", createdAt: t - 9000, title: "Exported as PDF", meta: { exportId: "x3", format: "pdf" } }),
    item({ id: "m", kind: "counsel_review", createdAt: t - 99999, title: "Counsel review attested by Priya Shah", meta: { reviewedBy: "Priya Shah", reviewedOn: "2026-10-12" } }),
  ];
  const out = readableTimeline(events);
  it("names downloads in words and lists one row per send", () => {
    expect(out.map((e) => e.title)).toEqual([
      "Handed over in person",
      "Downloaded the evidence pack",
      "Downloaded as PDF",
      "Counsel review by Priya Shah",
    ]);
  });
  it("says the counsel review on the download, with the date in words", () => {
    expect(out[1].detail).toBe("Counsel review by Priya Shah");
    expect(out[3].detail).toBe("Reviewed on 12 October 2026");
    expect(out.some((e) => /\d{4}-\d{2}-\d{2}|[A-Z]{3,}/.test(`${e.title} ${e.detail ?? ""}`.replace("PDF", "")))).toBe(false);
  });

  it("lists a back-dated send once, at the time it was recorded (SEND-X2)", () => {
    const given = t - 4 * 86_400_000;
    const rows = readableTimeline([
      item({ id: "s", kind: "details_updated", createdAt: t, title: "Handed over in person", detail: "Given on 9 Oct 2026", meta: { action: "sent", sentExportAt: given } }),
      item({ id: "e", kind: "exported", createdAt: given, title: "Exported as MARKED-SENT", meta: { exportId: "x9", format: "marked-sent" } }),
    ]);
    expect(rows.map((e) => e.title)).toEqual(["Handed over in person"]);
    expect(rows[0].createdAt).toBe(t);
  });
});

describe("downloads", () => {
  it("does not count Marked as sent as a download (LETTER-X49)", () => {
    const t = 1_760_000_000_000;
    const rows = [
      item({ id: "e1", kind: "exported", createdAt: t, title: "Marked as sent", meta: { exportId: "x1", format: "marked-sent" } }),
      item({ id: "e2", kind: "exported", createdAt: t - 1000, title: "Downloaded as PDF", meta: { exportId: "x2", format: "pdf" } }),
    ];
    expect(downloads(rows)).toBe(1);
  });
});

describe("sent for approval (SEND-X38)", () => {
  it("names the approver as who it went to, not as who sent it", () => {
    const [row] = readableTimeline([
      item({ id: "s", kind: "review_submitted", createdAt: 1, title: "Submitted for review to Ruth Adeyemi", actorName: "Ruth Adeyemi" }),
    ]);
    expect(row.title).toBe("Sent to Ruth Adeyemi to approve");
    expect(row.actorName).toBeUndefined();
  });
});
