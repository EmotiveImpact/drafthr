import { LETTER_CATALOG } from "@/lib/letters/catalog";
import type { LetterTypeId } from "@/lib/letters/types";
import type { CaseFile, FactValue, RouteEntry } from "./types.js";

/**
 * Hand-off from a case to the letter wizard. A playbook route step names its
 * letter as "employer/warning" (a template the app has) or "new:x" (a letter
 * still to build); this finds the app's letter type when there is one, and
 * turns the case's facts into the wizard's answers so nothing is typed twice.
 */
export function letterTypeFor(entry: Pick<RouteEntry, "letter">): LetterTypeId | null {
  const id = entry.letter.includes("/") ? entry.letter.split("/")[1] : entry.letter.replace(/^new:/, "");
  const meta = LETTER_CATALOG.find((l) => l.id === id && l.mode === "employer");
  return meta ? meta.id : null;
}

function val(file: CaseFile, key: string): FactValue | undefined {
  const v = file.facts[key]?.value;
  return v === null ? undefined : v;
}

/** Fact keys that mean the same thing as a wizard question, by question id. */
const SAME: Record<string, string> = {
  employeeLegalName: "employeeName",
  employeeStartDate: "employmentStartDate",
  allegationSummary: "allegationSummary",
  allegations: "allegationSummary",
  suspensionDate: "suspensionDate",
  suspensionPay: "suspensionPay",
  suspensionReason: "suspensionReason",
  hearingDate: "hearingDate",
  investigator: "investigator",
  decisionMaker: "decisionMaker",
  usState: "usState",
};

export function wizardAnswers(file: CaseFile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const j = file.jurisdiction;
  if (j.country === "uk") {
    out.jurisdiction = "UK";
    out.ukRegion =
      j.nation === "scotland" ? "Scotland" : j.nation === "northern-ireland" ? "Northern Ireland" : "England & Wales";
  } else {
    out.jurisdiction = "US";
    out.usState = j.state;
  }
  for (const [answerId, factKey] of Object.entries(SAME)) {
    const v = val(file, factKey);
    if (v !== undefined) out[answerId] = v;
  }
  const name = val(file, "employeeName");
  if (typeof name === "string") out.employeePreferredName = name.split(" ")[0];
  if (val(file, "treatedAsGrossMisconduct") === "yes") out.dismissalPossible = true;
  const details = val(file, "hearingDetails");
  if (typeof details === "string") out.hearingPlace = details;
  const evidence = val(file, "evidenceHeld");
  if (typeof evidence === "string") out.evidenceEnclosed = evidence;
  if (val(file, "grievanceDuringProcess") === true) out.grievanceLast90Days = true;
  out.confidentiality = "private_and_confidential";
  return out;
}
