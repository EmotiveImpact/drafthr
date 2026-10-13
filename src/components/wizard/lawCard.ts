import { rulesFor, ruleSatisfied, type ComplianceRule } from "@/lib/letters/compliance";
import type { Jurisdiction, LetterTypeId, UsState } from "@/lib/letters/types";

/**
 * The "What UK law requires" card on the new letter page, built only from
 * the real compliance rules (src/lib/letters/compliance.ts) for the letter
 * type, country and US state. A rule the answers already meet is "met";
 * a clause rule that is not met yet is one DraftHR adds while drafting; a
 * "warn" rule (something the letter must not say) is flagged if it appears.
 */
export type LawRowState = "met" | "add" | "flag";

export type LawRow = {
  id: string;
  label: string;
  note: string;
  description: string;
  state: LawRowState;
  severity: ComplianceRule["severity"];
};

export type LawCard = {
  kicker: string;
  heading: string;
  intro: string;
  rows: LawRow[];
  footnote?: string;
};

/** UK letters whose steps come from the ACAS Code of Practice on
 * disciplinary and grievance procedures. */
const ACAS_LETTERS = new Set<string>(["warning", "termination", "appeal", "grievance"]);

const SEVERITY_ORDER: Record<ComplianceRule["severity"], number> = { required: 0, recommended: 1, warn: 2 };

/** Every answer flattened into one lower-case string, for rule matching. */
export function answersText(answers: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (typeof v === "boolean") return;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(answers);
  return out.join("\n");
}

export function lawCardFor(
  letterType: LetterTypeId,
  jurisdiction: Jurisdiction,
  answers: Record<string, unknown>,
  usState?: UsState
): LawCard {
  const rules = [...rulesFor(letterType, jurisdiction, jurisdiction === "US" ? usState : undefined)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const text = answersText(answers);
  const rows: LawRow[] = rules.map((r) => {
    if (r.severity === "warn") {
      return {
        id: r.id,
        label: r.label,
        description: r.description,
        severity: r.severity,
        state: "flag",
        note: "DraftHR flags this if the letter includes it",
      };
    }
    const met = text.length > 0 && ruleSatisfied(r, text);
    return {
      id: r.id,
      label: r.label,
      description: r.description,
      severity: r.severity,
      state: met ? "met" : "add",
      note: met ? "Covered by your answers" : "DraftHR will add this",
    };
  });

  const kicker = jurisdiction === "US" ? "What US law requires" : "What UK law requires";
  const acas = jurisdiction === "UK" && ACAS_LETTERS.has(letterType);

  if (rows.length === 0) {
    return {
      kicker,
      heading: "What this letter must cover",
      intro: "No specific legal steps for this letter. DraftHR still checks it before you send.",
      rows,
    };
  }
  return {
    kicker,
    heading: acas ? "The ACAS Code on disciplinary and grievance procedures" : "What this letter must cover",
    intro: acas
      ? "A tribunal can raise an award by up to 25% if the Code is not followed. The letter must:"
      : "DraftHR checks the letter against these before you send it.",
    rows,
    footnote: acas ? "Northern Ireland follows the LRA Code instead." : undefined,
  };
}
