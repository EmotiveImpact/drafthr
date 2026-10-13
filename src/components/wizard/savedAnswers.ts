import type { LetterTypeId, Mode } from "@/lib/letters/types";

/**
 * "Save draft" on the new letter page: the answers and the step for one
 * letter type, kept in this browser only (no letter is created). Every
 * read and write is wrapped, so a private window or full storage simply
 * means nothing is restored.
 */
export type SavedWizard = {
  answers: Record<string, unknown>;
  stepIndex: number;
  savedAt: number;
  /** The quick check result, when one was answered. */
  triage?: { score: "strong" | "moderate" | "weak"; summary: string } | null;
};

const PREFIX = "drafthr.wizard.saved.v1";

export function savedWizardKey(mode: Mode, letterType: LetterTypeId | string): string {
  return `${PREFIX}.${mode}.${letterType}`;
}

/** Large images (letterhead, signature) come back from the profile, so they
 * are not copied into the saved answers. */
function storable(answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string" && v.startsWith("data:")) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function saveWizard(
  mode: Mode,
  letterType: LetterTypeId | string,
  data: { answers: Record<string, unknown>; stepIndex: number; triage?: SavedWizard["triage"] },
  now = Date.now()
): boolean {
  try {
    const body: SavedWizard = {
      answers: storable(data.answers),
      stepIndex: data.stepIndex,
      savedAt: now,
      triage: data.triage ?? null,
    };
    localStorage.setItem(savedWizardKey(mode, letterType), JSON.stringify(body));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedWizard(mode: Mode, letterType: LetterTypeId | string): SavedWizard | null {
  try {
    const raw = localStorage.getItem(savedWizardKey(mode, letterType));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWizard>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.answers !== "object" || parsed.answers === null) {
      return null;
    }
    return {
      answers: parsed.answers as Record<string, unknown>,
      stepIndex: Number.isInteger(parsed.stepIndex) && (parsed.stepIndex as number) >= 0 ? (parsed.stepIndex as number) : 0,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      triage:
        parsed.triage && typeof parsed.triage === "object" && typeof parsed.triage.summary === "string"
          ? parsed.triage
          : null,
    };
  } catch {
    return null;
  }
}

export function clearSavedWizard(mode: Mode, letterType: LetterTypeId | string): void {
  try {
    localStorage.removeItem(savedWizardKey(mode, letterType));
  } catch {
    /* nothing to clear */
  }
}
