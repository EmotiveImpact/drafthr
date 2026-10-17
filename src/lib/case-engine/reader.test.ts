import { describe, expect, it } from "vitest";
import { PLAYBOOKS } from "./playbooks/index.js";
import { cleanReading, coerceFactValue, quoteInStory, readerSystemPrompt } from "./reader.js";
import { historyBuilder, rebuildCaseFile } from "./history.js";
import { runPlaybook } from "./runner.js";
import { questionQueue, timelineRows } from "./interview.js";
import { EXAMPLE_STORY } from "./interview.js";

const pb = PLAYBOOKS.disciplinary;

describe("Reader clean-up", () => {
  it("keeps facts whose quote is in the story and whose value fits the type", () => {
    const r = cleanReading(
      {
        situation: "disciplinary",
        title: "Disciplinary: Jordan Hale",
        facts: [
          { key: "employeeName", value: "Jordan Hale", quote: "Jordan Hale" },
          { key: "suspensionPay", value: true, quote: "on full pay" },
          { key: "incidentDate", value: "2026-10-02", quote: "2 October" },
          { key: "treatedAsGrossMisconduct", value: "yes", quote: "I think this is gross misconduct" },
        ],
        people: [{ name: "Sam Ortiz", role: "Manager", quote: "Sam Ortiz" }],
        moments: [{ date: "2026-10-02", when: "2 October", what: "Boxes loaded into his car", quote: "2 October" }],
      },
      pb,
      "hr",
      EXAMPLE_STORY,
    );
    expect(r.facts.map((f) => f.key)).toEqual(["employeeName", "suspensionPay", "incidentDate", "treatedAsGrossMisconduct"]);
    expect(r.people).toHaveLength(1);
    expect(r.moments).toHaveLength(1);
    expect(r.situation).toBe("disciplinary");
  });

  it("drops invented quotes, unknown keys and values of the wrong type", () => {
    const r = cleanReading(
      {
        facts: [
          { key: "employeeName", value: "Jordan Hale", quote: "Jordan was sacked yesterday" },
          { key: "madeUpKey", value: "x", quote: "Jordan Hale" },
          { key: "incidentDate", value: "2 October", quote: "2 October" },
          { key: "treatedAsGrossMisconduct", value: "definitely", quote: "gross misconduct" },
        ],
        people: [{ name: "Priya Shah", role: "HR", quote: "" }],
      },
      pb,
      "hr",
      EXAMPLE_STORY,
    );
    expect(r.facts).toEqual([]);
    expect(r.people).toEqual([]);
  });

  it("matches quotes across curly quotes, case and spacing", () => {
    expect(quoteInStory("we  SUSPENDED him", "We suspended him on full pay")).toBe(true);
    expect(quoteInStory("it’s fine", "it's fine")).toBe(true);
    expect(quoteInStory("", "anything")).toBe(false);
  });

  it("coerces values by fact type", () => {
    const spec = (key: string) => pb.facts.find((f) => f.key === key)!;
    expect(coerceFactValue(spec("suspensionPay"), "yes")).toBe(true);
    expect(coerceFactValue(spec("incidentDate"), "2026-13-40")).toBeNull();
    expect(coerceFactValue(spec("witnesses"), ["Sam Ortiz", ""])).toEqual(["Sam Ortiz"]);
  });

  it("lists every fact the lens may be asked in the prompt", () => {
    const prompt = readerSystemPrompt(pb, "hr", "2026-10-17");
    expect(prompt).toContain("- employeeName (text)");
    expect(prompt).toContain("Today is 2026-10-17");
  });
});

describe("Interview order", () => {
  it("asks must facts by chapter and drops skipped ones", () => {
    const h = historyBuilder("2026-10-17T09:00:00Z").open("disciplinary", "hr", { country: "uk", nation: "england-wales" });
    const story = h.story(EXAMPLE_STORY);
    h.fromStory(story, "employeeName", "Jordan Hale", "Jordan Hale");
    const file = rebuildCaseFile("c1", h.events);
    const run = runPlaybook(file, pb, "2026-10-17");
    const queue = questionQueue(run, pb, []);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((q) => q.priority === "must" || q.conflicted || run.route.some((r) => r.missing?.includes(q.key)))).toBe(true);
    const skipped = questionQueue(run, pb, [queue[0]!.key]);
    expect(skipped.map((q) => q.key)).not.toContain(queue[0]!.key);
  });

  it("puts the Reader's moments and date facts on one timeline, oldest first", () => {
    const h = historyBuilder("2026-10-17T09:00:00Z").open("disciplinary", "hr", { country: "uk", nation: "england-wales" });
    const story = h.story(EXAMPLE_STORY);
    h.fromStory(story, "suspensionDate", "2026-10-06", "on the 6th");
    h.events.push({
      id: "n1",
      at: "2026-10-17T09:01:00Z",
      actor: "reader",
      type: "story_noted",
      storyEventId: story,
      people: [],
      moments: [{ date: "2026-10-05", when: "5 October", what: "Stock count" }],
    });
    const rows = timelineRows(rebuildCaseFile("c1", h.events), pb);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-05", "2026-10-06"]);
  });
});
