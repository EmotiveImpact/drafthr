import { describe, expect, it } from "vitest";
import { listStatusPill, timelineSentence } from "./letterView";

describe("timelineSentence", () => {
  it("turns export codes into words", () => {
    expect(timelineSentence({ kind: "exported", title: "Exported as MARKED-SENT", meta: { format: "marked-sent" } }, "Warning letter")).toBe(
      "Warning letter marked as sent"
    );
    expect(timelineSentence({ kind: "exported", title: "Exported as PDF", meta: { format: "pdf" } }, "Warning letter")).toBe(
      "Warning letter downloaded as PDF"
    );
  });

  it("reads the format from the title when the event has no meta", () => {
    expect(timelineSentence({ kind: "exported", title: "Exported as DOCX" }, "Offer letter")).toBe("Offer letter downloaded as Word");
  });

  it("prefixes other events with the letter unless the title names it", () => {
    expect(timelineSentence({ kind: "comment_added", title: "Added comment" }, "Pay rise")).toBe("Pay rise: added comment");
    expect(timelineSentence({ kind: "created", title: "Created Pay rise" }, "Pay rise")).toBe("Created Pay rise");
  });
});

describe("listStatusPill", () => {
  it("shows a draft that needs you as amber Needs you", () => {
    expect(listStatusPill({ statusLabel: "Draft", statusTone: "grey", needsYou: true })).toEqual({ label: "Needs you", tone: "amber" });
  });

  it("keeps the journey's pill otherwise", () => {
    expect(listStatusPill({ statusLabel: "Draft", statusTone: "grey", needsYou: false })).toEqual({ label: "Draft", tone: "grey" });
    expect(listStatusPill({ statusLabel: "Back to you", statusTone: "amber", needsYou: true })).toEqual({ label: "Back to you", tone: "amber" });
  });
});
