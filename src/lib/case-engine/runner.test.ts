import { describe, expect, it } from "vitest";
import { buildBrief } from "./brief";
import { historyBuilder, rebuildCaseFile } from "./history";
import { runPlaybook } from "./runner";
import type { Playbook } from "./types";
import { validatePlaybook } from "./validate";

/** A small made-up playbook that exercises every part of the runner. */
const mini: Playbook = {
  id: "disciplinary",
  name: "Mini",
  version: "test",
  status: "draft",
  recognise: { phrases: ["hearing"] },
  facts: [
    { key: "employeeName", label: "Employee", type: "text", priority: { hr: "must" }, question: "Who is it about?" },
    { key: "hearingDate", label: "Hearing date", type: "date", priority: { hr: "must" }, question: "When is the hearing?" },
    { key: "suspended", label: "Suspended", type: "boolean", priority: { hr: "should" }, question: "Suspended?" },
    {
      key: "suspensionDate",
      label: "Suspension date",
      type: "date",
      priority: { hr: "must" },
      question: "When did the suspension start?",
      askIf: { fact: "suspended", is: true },
    },
    {
      key: "healthCondition",
      label: "Health condition",
      type: "text",
      priority: { hr: "nice" },
      question: "Any health condition?",
      specialCategory: true,
    },
  ],
  checks: [
    {
      id: "C1",
      level: "act_now",
      when: { fact: "hearingDate", withinDays: 2 },
      message: "The hearing is very soon. Check the employee has had time to prepare.",
    },
    {
      id: "C2",
      level: "worth_checking",
      when: { known: "healthCondition" },
      message: "Consider adjustments for the hearing.",
    },
  ],
  rules: [
    {
      id: "companion",
      label: "Latest postponed hearing date",
      rule: "uk.companionPostponement",
      inputs: { proposedDate: { fact: "hearingDate" } },
    },
    {
      id: "review",
      label: "Next suspension review",
      rule: "uk.suspensionReview",
      inputs: { suspensionStart: { fact: "suspensionDate" } },
      when: { fact: "suspended", is: true },
    },
  ],
  route: [
    { id: "suspension", title: "Suspension letter", letter: "new:suspension_confirmation", lens: ["hr"], when: { fact: "suspended", is: true }, needs: ["suspensionDate"] },
    { id: "invite", title: "Hearing invite", letter: "new:hearing_invite", lens: ["hr"], needs: ["employeeName", "hearingDate"] },
    {
      id: "outcome",
      title: "Outcome",
      letter: "employer/warning",
      lens: ["hr"],
      after: ["invite"],
      blockedIf: [{ when: { not: { fact: "hearingDate", before: { today: true } } }, reason: "Hold the hearing first." }],
    },
  ],
  handOffs: [{ id: "expert", to: "expert", when: { known: "healthCondition" }, message: "An expert can help with adjustments." }],
  tone: { lens: { hr: ["Neutral and factual."] }, privacy: ["Health details only where needed."] },
};

const ENGLAND = { country: "uk", nation: "england-wales" } as const;

describe("runPlaybook", () => {
  it("passes its own validation", () => {
    expect(validatePlaybook(mini)).toEqual([]);
  });

  it("lists must facts first, skips askIf facts that do not apply, and asks the first", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
    const run = runPlaybook(rebuildCaseFile("c1", h.events), mini, "2026-10-13");
    expect(run.missing.map((m) => [m.key, m.priority])).toEqual([
      ["employeeName", "must"],
      ["hearingDate", "must"],
      ["suspended", "should"],
    ]);
    expect(run.nextQuestion?.key).toBe("employeeName");
    expect(run.deadlines.map((d) => [d.ruleUseId, d.date, d.missing])).toEqual([
      ["companion", null, ["proposedDate"]],
    ]);
  });

  it("works out deadlines, fires checks and picks the next letter", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
    h.answer("employeeName", "Jordan Hale").answer("hearingDate", "2026-10-15").answer("suspended", true);
    const run = runPlaybook(rebuildCaseFile("c1", h.events), mini, "2026-10-13");

    expect(run.missing.map((m) => m.key)).toEqual(["suspensionDate"]);
    expect(run.checks.map((c) => c.id)).toEqual(["C1"]);
    expect(run.deadlines.find((d) => d.ruleUseId === "companion")?.date).toBe("2026-10-22");
    expect(run.route.map((r) => [r.stepId, r.status])).toEqual([
      ["suspension", "needs_facts"],
      ["invite", "next"],
      // Blocked wins over waiting: the hearing has not happened yet.
      ["outcome", "blocked"],
    ]);
    expect(run.nextLetter?.stepId).toBe("invite");
  });

  it("blocks the outcome letter until the hearing date has passed", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
    h.answer("employeeName", "Jordan Hale").answer("hearingDate", "2026-10-15").answer("suspended", false);
    h.drafted("invite", "l1");
    const file = rebuildCaseFile("c1", h.events);

    const before = runPlaybook(file, mini, "2026-10-14");
    expect(before.route.find((r) => r.stepId === "outcome")).toMatchObject({
      status: "blocked",
      reason: "Hold the hearing first.",
    });

    const after = runPlaybook(file, mini, "2026-10-16");
    expect(after.route.map((r) => [r.stepId, r.status])).toEqual([
      ["suspension", "not_applicable"],
      ["invite", "drafted"],
      ["outcome", "next"],
    ]);
  });

  it("asks again about a fact two sources disagree on, and flags deadlines that use it", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
    const story = h.story("Hearing on 15 October.");
    h.fromStory(story, "hearingDate", "2026-10-15", "Hearing on 15 October");
    const doc = h.document("d1", "invite.pdf");
    h.fromDocument(doc, "d1", "hearingDate", "2026-10-16", "on Friday 16 October");
    const run = runPlaybook(rebuildCaseFile("c1", h.events), mini, "2026-10-13");

    expect(run.missing.find((m) => m.key === "hearingDate")).toMatchObject({ conflicted: true });
    expect(run.conflicts).toEqual(["hearingDate"]);
    expect(run.deadlines[0].toVerify.join(" ")).toMatch(/two sources/);
  });

  it("never re-asks a forgotten fact", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
    h.answer("employeeName", "Jordan Hale").forget("employeeName");
    const run = runPlaybook(rebuildCaseFile("c1", h.events), mini, "2026-10-13");
    expect(run.missing.map((m) => m.key)).not.toContain("employeeName");
  });

  it("leaves out steps for other lenses", () => {
    const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "employee", ENGLAND);
    const run = runPlaybook(rebuildCaseFile("c1", h.events), mini, "2026-10-13");
    expect(run.route).toEqual([]);
    expect(run.missing).toEqual([]);
  });
});

describe("buildBrief", () => {
  const h = historyBuilder("2026-10-13T09:00:00Z").open("disciplinary", "hr", ENGLAND);
  h.answer("employeeName", "Jordan Hale").answer("hearingDate", "2026-10-15").answer("healthCondition", "ADHD");
  const file = rebuildCaseFile("c1", h.events);
  const run = runPlaybook(file, mini, "2026-10-13");

  it("gives the Reader no facts, only what to look for", () => {
    const brief = buildBrief(file, mini, run, "reader");
    expect(brief.facts).toEqual([]);
    expect(brief.lookFor.map((m) => m.key)).toEqual(run.missing.map((m) => m.key));
  });

  it("withholds special category facts from the interviewer", () => {
    const brief = buildBrief(file, mini, run, "interviewer");
    expect(brief.withheld).toEqual(["healthCondition"]);
    expect(brief.facts.map((f) => f.key)).not.toContain("healthCondition");
  });

  it("shows a special category fact to the drafter when a fired check depends on it", () => {
    const brief = buildBrief(file, mini, run, "drafter", "invite");
    expect(brief.facts.map((f) => f.key)).toContain("healthCondition");
    expect(brief.letter?.letter).toBe("new:hearing_invite");
  });

  it("refuses a drafter brief with no letter", () => {
    expect(() => buildBrief(file, mini, run, "drafter")).toThrow(/route step/);
  });
});
