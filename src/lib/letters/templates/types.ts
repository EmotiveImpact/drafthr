import type { Jurisdiction, LetterTypeId, SectionId } from "../types";

/**
 * Template-driven letter generation. Each (letterType × jurisdiction) pair has
 * a template authored by Claude Opus 4.7 acting as a senior employment-law
 * editor. The template gives the section-level model:
 *   - a structural scaffold to mirror,
 *   - hard constraints ("must include / must not include"),
 *   - a worked gold-standard example.
 *
 * The prompt builder injects scaffold + constraints + example into the
 * section-level user prompt so generated content is consistent, legally
 * fenced, and stylistically aligned across drafts.
 */
export type SectionTemplate = {
  sectionId: SectionId;
  title: string;
  /**
   * One-paragraph instruction to the section model — overrides the generic
   * SECTION_INSTRUCTIONS for this letter type. Should mention: what facts to
   * include, what register, what to avoid, what citations to make.
   */
  instruction: string;
  /**
   * Loose HTML scaffold the model should fill in. May contain {{placeholders}}
   * that the wizard's `answers` resolves, or [TBD] markers. The model is told
   * to preserve the structure but rewrite phrasing in the requested tone.
   * Use raw HTML — <p>, <strong>, <em>, <ul>/<li> only.
   */
  scaffold: string;
  /** Hard rules. Each line is a "MUST" or "MUST NOT". Injected verbatim into the prompt. */
  constraints: string[];
  /**
   * Worked gold-standard example for this section, with realistic but
   * synthetic placeholders ([Name], £[amount], [date]). The model uses this
   * for register/length calibration only — not to lift verbatim.
   */
  example: string;
};

/**
 * How structurally important evidence is to a given letter type. Drives the
 * Edit page's default UX:
 *  - "light":  routine letters — no evidence prompts, drawer stays closed.
 *  - "medium": evidence helps but isn't required — subtle hint to add it.
 *  - "heavy":  evidence is structural — auto-pin the evidence drawer as a
 *              sidebar and show a stronger handoff card before Review.
 *
 * Templates may set this explicitly. When unset, `getEvidenceTier()` derives
 * it from category + risk so every template has a sensible default.
 */
export type EvidenceTier = "light" | "medium" | "heavy";

/**
 * A single evidence requirement the template suggests. Surfaced as a
 * checklist on the Evidence step + a warning row on the Review step.
 * Templates that don't declare anything here just don't show the
 * checklist — opt-in feature.
 */
export type ExpectedEvidence = {
  /** Stable id — used to mark items as fulfilling this expectation. */
  key: string;
  /** Short label shown on the checklist (e.g. "Chronology"). */
  label: string;
  /** Required = blocks export until satisfied. Optional = warning only. */
  required: boolean;
  /** Tooltip / detail row — what kind of item satisfies this expectation. */
  description?: string;
  /** Which evidence kind(s) typically satisfy this (used for auto-match). */
  expectedKinds?: Array<"email" | "calendar" | "document" | "screenshot" | "note">;
};

export type LetterTemplate = {
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  /**
   * Letter-wide system addendum. Anything in here is appended to the master
   * system prompt when this template is the active scaffold. Use it for
   * letter-type-wide register notes, citations to anchor (statute names),
   * and "if X then Y" branch hints.
   */
  letterSystemAddendum: string;
  /** Sections in canonical order. Required sections must all be present. */
  sections: SectionTemplate[];
  /**
   * What evidence this letter type typically needs. Surfaced on the
   * Evidence step as a "what we'd expect to see" checklist. Optional —
   * templates without this just don't show the checklist.
   */
  expectedEvidence?: ExpectedEvidence[];
  /**
   * How structurally important evidence is for this letter. Drives the
   * Edit page's default behaviour for the evidence drawer + handoff card.
   * When omitted, `getEvidenceTier()` derives a tier from the letter's
   * category and risk. Set explicitly to override the derivation.
   */
  evidenceTier?: EvidenceTier;
};

export type LetterTemplateKey = `${LetterTypeId}__${Jurisdiction}`;

export function templateKey(letterType: LetterTypeId, j: Jurisdiction): LetterTemplateKey {
  return `${letterType}__${j}` as LetterTemplateKey;
}
