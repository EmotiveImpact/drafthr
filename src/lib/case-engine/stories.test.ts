import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildBrief } from "./brief";
import { historyBuilder, rebuildCaseFile } from "./history";
import { PLAYBOOKS } from "./playbooks";
import { runPlaybook } from "./runner";
import { STORIES } from "./stories";
import type { StoryFixture } from "./stories/types";
import type { CaseFile, RunResult } from "./types";

/** Plays a story into a history the way the app will: open, story, Reader facts, answers. */
function runStory(story: StoryFixture): { file: CaseFile; run: RunResult } {
  const h = historyBuilder(`${story.today}T09:00:00Z`).open(story.situation, story.lens, story.jurisdiction);
  const storyEvent = h.story(story.story);
  for (const fact of story.readerFacts) h.fromStory(storyEvent, fact.key, fact.value, fact.quote);
  for (const answer of story.answers ?? []) h.answer(answer.key, answer.value);
  const file = rebuildCaseFile(story.id, h.events);
  return { file, run: runPlaybook(file, PLAYBOOKS[story.situation], story.today) };
}

const results: unknown[] = [];

describe.each(STORIES.map((s) => [`${s.id} ${s.title}`, s] as const))("%s", (_name, story) => {
  const { file, run } = runStory(story);
  const playbook = PLAYBOOKS[story.situation];
  results.push({
    story,
    file,
    run,
    briefs: {
      interviewer: buildBrief(file, playbook, run, "interviewer"),
      drafter: run.nextLetter ? buildBrief(file, playbook, run, "drafter", run.nextLetter.stepId) : null,
    },
  });
  const { expect: want } = story;

  it("has a Reader answer key quoted word for word from the story", () => {
    for (const fact of story.readerFacts) {
      expect(story.story, `quote for ${fact.key}`).toContain(fact.quote);
    }
  });

  it("only uses fact keys the playbook defines", () => {
    const keys = new Set(PLAYBOOKS[story.situation].facts.map((f) => f.key));
    const used = [...story.readerFacts, ...(story.answers ?? [])].map((f) => f.key);
    expect(used.filter((k) => !keys.has(k))).toEqual([]);
  });

  if (want.missingIncludes || want.missingExcludes) {
    it("asks for the right facts", () => {
      const missing = run.missing.map((m) => m.key);
      for (const key of want.missingIncludes ?? []) expect(missing, `should ask for ${key}`).toContain(key);
      for (const key of want.missingExcludes ?? []) expect(missing, `should not ask for ${key}`).not.toContain(key);
    });
  }

  if (want.checksInclude || want.checksExclude) {
    it("fires the right checks", () => {
      const fired = run.checks.map((c) => c.id);
      for (const id of want.checksInclude ?? []) expect(fired, `should fire ${id}`).toContain(id);
      for (const id of want.checksExclude ?? []) expect(fired, `should not fire ${id}`).not.toContain(id);
    });
  }

  if (want.deadlines) {
    it("works out the deadlines", () => {
      const got = Object.fromEntries(run.deadlines.map((d) => [d.ruleUseId, d.date]));
      for (const [id, date] of Object.entries(want.deadlines ?? {})) {
        expect(got[id], `deadline ${id}`).toBe(date);
      }
    });
  }

  if (want.nextLetter !== undefined) {
    it("picks the next letter", () => {
      expect(run.nextLetter?.stepId ?? null).toBe(want.nextLetter);
    });
  }

  if (want.blocked) {
    it("blocks the right letters", () => {
      const blocked = run.route.filter((r) => r.status === "blocked").map((r) => r.stepId);
      for (const id of want.blocked ?? []) expect(blocked, `should block ${id}`).toContain(id);
    });
  }

  if (want.handOffs) {
    it("suggests the right hand-offs", () => {
      const ids = run.handOffs.map((h) => h.id);
      for (const id of want.handOffs ?? []) expect(ids, `should hand off ${id}`).toContain(id);
    });
  }
});

// `CASE_ENGINE_REPORT=path npx vitest run src/lib/case-engine/stories.test.ts`
// writes every run to a JSON file, for the results page.
afterAll(() => {
  const path = process.env.CASE_ENGINE_REPORT;
  if (path) writeFileSync(path, JSON.stringify(results, null, 2));
});
