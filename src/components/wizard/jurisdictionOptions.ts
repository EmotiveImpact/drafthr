import type { Question } from "@/lib/letters/questions";
import type { Jurisdiction } from "@/lib/letters/types";

/**
 * Some answer options only make sense in one country. The question library
 * lists every option once; the new letter page shows only the ones that fit
 * the country of employment picked on the Jurisdiction step.
 *
 * Worker classification: "Worker (UK)" and "Casual / zero-hours" are UK
 * employment statuses, and "1099" is a US tax form, so the contractor label
 * names the local term.
 */
const UK_ONLY: Record<string, ReadonlySet<string>> = {
  workerClass: new Set(["worker", "casual"]),
};

const LABELS: Record<string, Record<string, Record<Jurisdiction, string>>> = {
  workerClass: {
    contractor: { UK: "Contractor / self-employed", US: "Contractor / 1099" },
  },
};

/** The question with only the options that apply in this jurisdiction. */
export function questionForJurisdiction(q: Question, jurisdiction: Jurisdiction): Question {
  if (!q.options) return q;
  const ukOnly = UK_ONLY[q.id];
  const labels = LABELS[q.id];
  if (!ukOnly && !labels) return q;
  const options = q.options
    .filter((o) => jurisdiction === "UK" || !ukOnly?.has(o.value))
    .map((o) => (labels?.[o.value] ? { ...o, label: labels[o.value][jurisdiction] } : o));
  return { ...q, options };
}

/** Answer ids whose current value is not offered in this jurisdiction (for
 * example "Worker (UK)" after switching to the United States), so the page
 * can clear them and ask again. */
export function answersOutsideJurisdiction(
  answers: Record<string, unknown>,
  jurisdiction: Jurisdiction
): string[] {
  if (jurisdiction === "UK") return [];
  return Object.entries(UK_ONLY)
    .filter(([id, values]) => typeof answers[id] === "string" && values.has(answers[id] as string))
    .map(([id]) => id);
}
