import type { FactValue, IsoDate, Jurisdiction, Lens, SituationId } from "../types";

/**
 * A test story: a made-up case written the way a real user would type it,
 * taken from part 9 of the playbook drafts.
 *
 * The prototype has no AI. `readerFacts` stands in for the Reader: the facts
 * a correct Reader would pull out of the story, each with the words it came
 * from. The same list later becomes the AI exam's answer key.
 */
export type StoryFixture = {
  id: string;
  title: string;
  situation: SituationId;
  lens: Lens;
  jurisdiction: Jurisdiction;
  /** The day the story is typed in. Deadlines and "within N days" use it. */
  today: IsoDate;
  story: string;
  readerFacts: { key: string; value: FactValue; quote: string }[];
  /** Later answers in the interview, applied after the Reader's facts. */
  answers?: { key: string; value: FactValue }[];
  expect: {
    /** Must facts that should still be missing. The runner may list more. */
    missingIncludes?: string[];
    /** Facts that must NOT be listed as missing. */
    missingExcludes?: string[];
    /** Checks that should fire. The runner may fire more. */
    checksInclude?: string[];
    checksExclude?: string[];
    /** Exact dates for these rule uses; null means no date yet (facts missing). */
    deadlines?: Record<string, IsoDate | null>;
    /** The step id of the next letter, or null when none can be drafted yet. */
    nextLetter?: string | null;
    blocked?: string[];
    handOffs?: string[];
  };
  /** Where this fixture departs from the draft's part 9, and why. */
  notes?: string;
};
