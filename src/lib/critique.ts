/** Client helper for the AI-critique endpoint (/api/store/critique). */
import type { Draft } from "@/lib/letters/types";

export type CritiqueLens = "tribunal" | "employee_advocate" | "dei";

export const CRITIQUE_LENSES: { id: CritiqueLens; label: string; blurb: string }[] = [
  { id: "tribunal", label: "Tribunal counsel", blurb: "Legal risk & evidential gaps" },
  { id: "employee_advocate", label: "Employee advocate", blurb: "Protects the employee's position" },
  { id: "dei", label: "DEI lead", blurb: "Inclusive, fair language" },
];

/** The credit cost of one critique run — mirrors the server (kept in sync). */
export const CRITIQUE_CREDIT_COST = 1;

/** Strip HTML to readable text for the model (browser DOM, with a regex fallback). */
function htmlToText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || !window.DOMParser) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Flatten a draft's non-empty sections into titled plain text for critique. */
export function assembleLetterText(draft: Draft): string {
  const parts: string[] = [];
  for (const s of draft.sections) {
    const body = htmlToText(s.html);
    if (!body) continue;
    parts.push(s.title ? `## ${s.title}\n${body}` : body);
  }
  return parts.join("\n\n").trim();
}

export type CritiqueResult = {
  critique: string;
  lens: CritiqueLens;
  lensLabel: string;
  creditsRemaining: number;
};

export type CritiqueOutcome =
  | { ok: true; data: CritiqueResult }
  | { ok: false; error: string; needCredits?: boolean };

export async function runCritique(input: {
  lens: CritiqueLens;
  letterText: string;
  letterType?: string;
  jurisdiction?: string;
}): Promise<CritiqueOutcome> {
  try {
    const res = await fetch("/api/store/critique", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      critique?: string;
      lensLabel?: string;
      creditsRemaining?: number;
      error?: string;
      needCredits?: boolean;
    };
    if (!res.ok || !data.critique) {
      return {
        ok: false,
        error: data.error || `Critique failed (${res.status})`,
        needCredits: Boolean(data.needCredits),
      };
    }
    return {
      ok: true,
      data: {
        critique: data.critique,
        lens: input.lens,
        lensLabel: data.lensLabel ?? input.lens,
        creditsRemaining: typeof data.creditsRemaining === "number" ? data.creditsRemaining : 0,
      },
    };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}
