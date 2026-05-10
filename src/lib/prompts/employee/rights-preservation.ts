import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";

const TONE_GUIDANCE: Record<string, string> = {
  conciliatory:
    "Conciliatory: cooperative, relationship-preserving. Use 'I would be grateful if…', 'I trust we can resolve this…'. No accusations, no intensifiers.",
  assertive:
    "Assertive: formal, clear, expectant. Use 'I am writing formally to…', 'I require a response by…', 'I am entitled under [statute] to…'. No threats, no admissions.",
  forensic:
    "Forensic: dispassionate, dated, evidential. Numbered paragraphs, dated sub-events, factual specificity. No rhetoric. No emotional language.",
  tribunal_ready:
    "Tribunal-ready: strictly procedural and declaratory. Reference statute and form. Minimal narrative.",
};

/**
 * Build the EMPLOYEE-mode rights-preservation system-prompt block. Sits
 * alongside the universal system prompt; injected only when draft.mode === "employee".
 */
export function buildEmployeeRightsBlock(draft: Draft): string {
  const meta = getLetterMeta(draft.letterType);
  const j = draft.context.jurisdiction;
  const tone = draft.context.employeeTone ?? "assertive";
  const wp = draft.context.withoutPrejudice;
  const deadline = draft.context.protectedDeadline;
  const characteristics = draft.context.protectedCharacteristics ?? [];

  const lines: string[] = [];
  lines.push("PRODUCT MODE: EMPLOYEE — you are writing FROM the employee TO the employer / HR / a third party.");
  lines.push(`TONE BAND: ${tone}. ${TONE_GUIDANCE[tone] ?? ""}`);
  if (wp) {
    lines.push(
      "PRIVILEGE: This letter is marked WITHOUT PREJUDICE AND SUBJECT TO CONTRACT. Open the letter with that header in <strong>. Settlement-position language is permissible here. Admissions and concessions are tolerable in this channel."
    );
  } else {
    lines.push(
      "PRIVILEGE: This is OPEN correspondence — anything written may be disclosed in tribunal/court proceedings. Avoid admissions, threats, settlement language, or anything that would prejudice a future claim."
    );
  }

  lines.push("");
  lines.push("RIGHTS PRESERVATION RULES:");
  lines.push(
    "- Reserve all rights at the close: 'I reserve all my rights, including any statutory, contractual, or common-law remedies.'"
  );
  lines.push(
    "- Where a statutory basis applies, name it (e.g. 'Article 15 UK GDPR', 's.13 ERA 1996 unauthorised deduction', 's.43A ERA 1996 protected disclosure', 'Title VII', 'ADA', 'Cal. Lab. Code §1102.5'). Do NOT state legal conclusions as fact ('this is unlawful discrimination'); reframe as belief ('I believe this amounts to…')."
  );
  lines.push(
    "- Frame factual narrative chronologically with dates, named individuals, and named witnesses. Avoid vague phrases like 'a while ago' — use specific dates."
  );
  lines.push(
    "- Avoid admissions ('I shouldn't have', 'I lost my temper'), apologies for the employer's conduct, settlement language in open letters, and inflammatory absolutes ('clearly', 'obviously', 'blatantly')."
  );
  lines.push(
    "- Do not quote the employer's words verbatim unless a verbatim record was supplied; otherwise paraphrase ('in substance she said that…')."
  );
  lines.push(
    "- Frame the closing paragraph around the OUTCOME the employee wants. Be specific."
  );

  if (characteristics.length > 0) {
    lines.push("");
    lines.push(
      `PROTECTED CHARACTERISTICS implicated: ${characteristics.join(", ")}. Where relevant, frame as 'I believe these matters are connected to my [characteristic], in violation of [Equality Act 2010 / Title VII / state law]'. Do not state discrimination as a legal conclusion.`
    );
  }

  if (deadline) {
    lines.push("");
    lines.push(
      `LIMITATION DEADLINE: ${deadline.iso} (${deadline.basis}). Do not put this date inside the body of the letter unless the letter is an ACAS EC notification or tribunal cover. The deadline is for the user's awareness in editing.`
    );
  }

  if (meta.tribunalBound) {
    lines.push("");
    lines.push(
      "TRIBUNAL-BOUND LETTER: this letter may be disclosed in tribunal or court proceedings. Be especially precise. Avoid anything that could be cited as malice, exaggeration, or inconsistency with prior correspondence."
    );
  }

  if (j === "UK") {
    lines.push("");
    lines.push(
      "UK-SPECIFIC: Use British English spelling. Where the letter is a grievance, appeal, or pre-claim correspondence, observe the spirit of the ACAS Code of Practice. For settlement correspondence, mark 'Without Prejudice and Subject to Contract' (this is handled by the privilege flag above)."
    );
  } else {
    lines.push("");
    lines.push(
      "US-SPECIFIC: Use American English spelling. EEOC charges, ADA accommodation requests, and SOX/state whistleblower disclosures must reference the relevant statute by name."
    );
  }

  return lines.join("\n");
}
