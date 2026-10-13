import { describe, expect, it } from "vitest";
import { historyBuilder, rebuildCaseFile } from "./history";

const ENGLAND = { country: "uk", nation: "england-wales" } as const;

function opened() {
  return historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
}

describe("rebuildCaseFile", () => {
  it("needs a history that starts with case_opened", () => {
    expect(() => rebuildCaseFile("c1", [])).toThrow(/case_opened/);
  });

  it("keeps the source of every fact", () => {
    const h = opened();
    const story = h.story("Jordan was suspended on 2 October.");
    h.fromStory(story, "suspensionDate", "2026-10-02", "suspended on 2 October");
    const file = rebuildCaseFile("c1", h.events);
    expect(file.facts.suspensionDate.value).toBe("2026-10-02");
    expect(file.facts.suspensionDate.sources).toEqual([
      { kind: "story", eventId: story, quote: "suspended on 2 October" },
    ]);
  });

  it("adds a second source when two sources agree", () => {
    const h = opened();
    const story = h.story("Suspended on 2 October.");
    h.fromStory(story, "suspensionDate", "2026-10-02", "Suspended on 2 October");
    const doc = h.document("d1", "suspension-letter.pdf");
    h.fromDocument(doc, "d1", "suspensionDate", "2026-10-02", "with effect from 2 October 2026");
    const fact = rebuildCaseFile("c1", h.events).facts.suspensionDate;
    expect(fact.sources).toHaveLength(2);
    expect(fact.conflict).toBeUndefined();
  });

  it("flags a conflict when the story and a document disagree, and keeps the first value", () => {
    const h = opened();
    const story = h.story("Suspended on 2 October.");
    h.fromStory(story, "suspensionDate", "2026-10-02", "Suspended on 2 October");
    const doc = h.document("d1", "suspension-letter.pdf");
    h.fromDocument(doc, "d1", "suspensionDate", "2026-10-07", "with effect from 7 October 2026");
    const fact = rebuildCaseFile("c1", h.events).facts.suspensionDate;
    expect(fact.value).toBe("2026-10-02");
    expect(fact.conflict?.values.map((v) => v.value)).toEqual(["2026-10-02", "2026-10-07"]);
  });

  it("lets a correction settle a conflict, keeping the old values", () => {
    const h = opened();
    const story = h.story("Suspended on 2 October.");
    h.fromStory(story, "suspensionDate", "2026-10-02", "Suspended on 2 October");
    const doc = h.document("d1", "suspension-letter.pdf");
    h.fromDocument(doc, "d1", "suspensionDate", "2026-10-07", "with effect from 7 October 2026");
    h.correct("suspensionDate", "2026-10-07", "The letter is right");
    const fact = rebuildCaseFile("c1", h.events).facts.suspensionDate;
    expect(fact.value).toBe("2026-10-07");
    expect(fact.certainty).toBe("corrected");
    expect(fact.conflict).toBeUndefined();
    expect(fact.earlier.map((e) => e.value)).toContain("2026-10-02");
  });

  it("lets a direct answer replace an earlier value", () => {
    const h = opened();
    const story = h.story("The hearing is next Monday.");
    h.fromStory(story, "hearingDate", "2026-10-19", "next Monday");
    h.answer("hearingDate", "2026-10-20");
    const file = rebuildCaseFile("c1", h.events);
    expect(file.facts.hearingDate.value).toBe("2026-10-20");
    expect(file.facts.hearingDate.earlier[0].value).toBe("2026-10-19");
    expect(file.asked).toEqual(["hearingDate"]);
  });

  it("drops a forgotten fact from the case file but not from the history", () => {
    const h = opened();
    const story = h.story("She is pregnant.");
    h.fromStory(story, "pregnant", true, "She is pregnant");
    h.forget("pregnant", "Asked to remove");
    const file = rebuildCaseFile("c1", h.events);
    expect(file.facts.pregnant).toBeUndefined();
    expect(file.forgotten).toEqual(["pregnant"]);
    expect(h.events.some((e) => e.type === "fact_recorded" && e.key === "pregnant")).toBe(true);
  });

  it("tracks letters drafted and sent", () => {
    const h = opened().drafted("invite", "letter-1").sent("invite", "2026-10-14");
    expect(rebuildCaseFile("c1", h.events).letters).toEqual([
      { stepId: "invite", letterId: "letter-1", drafted: true, sentOn: "2026-10-14" },
    ]);
  });

  it("refuses duplicate event ids", () => {
    const h = opened();
    h.story("One");
    const events = [...h.events, h.events[1]];
    expect(() => rebuildCaseFile("c1", events)).toThrow(/Duplicate/);
  });
});
