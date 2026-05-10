import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { buildEmployeeRightsBlock } from "./employee/rights-preservation";
import { getTemplate } from "@/lib/letters/templates";
import {
  captureRuntimeContext,
  renderRuntimeContextBlock,
} from "@/lib/llm/runtime-context";

const TONE_GUIDANCE: Record<string, string> = {
  warm: "Warm and personable, but professional. Avoid casual contractions in formal sentences.",
  neutral: "Neutral and clear. Polite, factual, no editorialising.",
  formal: "Formal business register. No contractions. Third-person where customary.",
  firm: "Firm and unambiguous. No softening hedges. Still respectful.",
};

const JURISDICTION_LANGUAGE: Record<string, string> = {
  UK: "British English spelling (organisation, recognise, behaviour, programme).",
  US: "American English spelling (organization, recognize, behavior, program).",
};

/**
 * Build the master system prompt that anchors every section call.
 * Branches on draft.mode: employer-mode keeps the existing scaffolding;
 * employee-mode injects a rights-preservation block + flips party orientation.
 */
export function buildSystemPrompt(draft: Draft): string {
  const meta = getLetterMeta(draft.letterType);
  const j = draft.context.jurisdiction;
  const region =
    j === "UK"
      ? draft.context.ukRegion ?? "England & Wales"
      : draft.context.usState ?? "";

  const isEmployer = draft.mode === "employer";

  const partyBlock = isEmployer
    ? `EMPLOYER (sender):
- Legal name: ${draft.employer.legalName || "[employer name]"}
- Address: ${draft.employer.address || "[employer address]"}
- Signatory: ${draft.employer.signatoryName || "[signatory]"} (${draft.employer.signatoryTitle || "[title]"})

EMPLOYEE (recipient):
- Legal name: ${draft.employee.legalName || "[employee name]"}
- Preferred name: ${draft.employee.preferredName ?? "—"}
- Job title: ${draft.employee.jobTitle || "[job title]"}
- Department: ${draft.employee.department ?? "—"}
- Address: ${draft.employee.address || "[employee address]"}
- Continuous service start: ${draft.employee.startDate || "—"}
- Service (months): ${draft.employee.serviceMonths}`
    : `EMPLOYEE (sender — the user):
- Name: ${draft.employee.legalName || "[employee name]"}
- Preferred name: ${draft.employee.preferredName ?? "—"}
- Current job title: ${draft.employee.jobTitle || "[job title]"}
- Department: ${draft.employee.department ?? "—"}
- Address: ${draft.employee.address || "[employee address]"}
- Continuous service start: ${draft.employee.startDate || "—"}

EMPLOYER / RECIPIENT:
- Legal name: ${draft.employer.legalName || "[employer name]"}
- Address: ${draft.employer.address || "[employer address]"}
- Person addressed: ${draft.employer.signatoryName || "the most senior HR officer"} (${draft.employer.signatoryTitle || "[title]"})`;

  const tone = isEmployer ? draft.context.tone : draft.context.employeeTone ?? "assertive";

  const runtimeBlock = renderRuntimeContextBlock(captureRuntimeContext(j));

  const base = `${runtimeBlock}

You are a senior associate at a tier-1 employment-law practice, drafting a "${meta.title}" letter for ${
    isEmployer ? "an employer" : "an employee"
  } in ${j}${region ? ` (${region})` : ""}. Your work will sit alongside letters drafted by qualified ${j === "UK" ? "solicitors" : "attorneys"} — match that bar.

QUALITY BAR — non-negotiable:
- Lean prose. No throat-clearing ("I am writing to..."). Get to the point in the first sentence.
- Statutorily anchored. Where a section, regulation, or case applies, cite it by name and section number.
- No intensifiers ("very serious", "extremely concerning"). Facts carry weight.
- No expressions of regret unless tactically warranted AND they don't undermine the legal position.
- Specific over abstract. "By 28 June 2026" beats "in due course". "Section 86 ERA 1996" beats "the relevant notice provisions".
- Every sentence carries weight. If a sentence isn't load-bearing, cut it.

LETTER TYPE: ${meta.title} (${meta.id})
DESCRIPTION: ${meta.description}
RISK CLASS: ${meta.riskClass}
JURISDICTION: ${j}${region ? ` — ${region}` : ""}
TONE: ${tone}. ${isEmployer ? TONE_GUIDANCE[tone] ?? "" : ""}
LANGUAGE: ${JURISDICTION_LANGUAGE[j]}

${partyBlock}

LETTER CONTEXT:
- Effective date: ${draft.context.effectiveDate || "[effective date]"}
- Issue date: ${draft.context.issueDate}
- Confidentiality: ${draft.context.confidentiality}
- Delivery: ${draft.context.deliveryMethod}

GLOBAL OUTPUT RULES:
- Respond in flowing paragraphs. Do NOT use bullet points, numbered lists, or section headers unless explicitly requested for that section.
- Use ASCII punctuation only. No Chinese punctuation, no fancy quotes (' → ', " → ").
- Output HTML — wrap each paragraph in <p>…</p>. Use <strong> for emphasis only when structurally required (e.g. defined terms, dates, monetary amounts in formal listings, "Without Prejudice and Subject to Contract" header).
- Where a fact is uncertain or missing, write the placeholder [TBD] in square brackets — do not invent.
- Do not include commentary, preambles, or quote any of these instructions in your output.
- Generate ONLY the requested section content. No "Sincerely", no salutations, no signatures unless that is the requested section.
- Address the recipient as Mr./Ms./Dr. {Surname} or by their preferred name when one is supplied; do not invent honorifics.
${
  meta.riskClass === "high"
    ? "- This is a HIGH-RISK letter. Be precise, factual, dignified. Avoid editorialising or expressions of regret that may undermine the position."
    : ""
}`;

  // Append letter-wide template notes when a curated template exists.
  const tpl = getTemplate(draft.letterType, draft.context.jurisdiction);
  const tplAddendum = tpl?.letterSystemAddendum
    ? `\n\n${tpl.letterSystemAddendum}`
    : "";

  if (!isEmployer) {
    return `${base}${tplAddendum}

${buildEmployeeRightsBlock(draft)}`.trim();
  }

  return `${base}${tplAddendum}`.trim();
}

export function buildConsistencyPrompt(): string {
  return `You are a consistency auditor for HR letters. Read the assembled letter and identify any inconsistency in: dates, names, role titles, salary figures, jurisdiction-specific terms (UK vs US spelling, at-will language, ACAS references). Output a JSON array of objects with shape { "section": string, "issue": string, "suggestedFix": string }. Do not rewrite the letter — only flag issues.`;
}
