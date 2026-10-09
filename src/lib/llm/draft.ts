import type { Draft, Section } from "@/lib/letters/types";
import { buildSystemPrompt } from "@/lib/prompts/system";
import { buildSectionPrompt } from "@/lib/prompts/sections";
import { streamDraft } from "./client";
import { uid } from "@/lib/utils";
import { useProfileStore } from "@/lib/profile";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { loadTemplate } from "@/lib/letters/templates";

/** Templates are lazy-loaded; prompts fall back to generic instructions without one. */
async function ensureTemplate(draft: Draft): Promise<void> {
  const jurisdiction = draft.context?.jurisdiction;
  if (!draft.letterType || !jurisdiction) return;
  await loadTemplate(draft.letterType, jurisdiction).catch(() => undefined);
}

/** Resolve the user's preferred Qwen model from the persisted profile. */
function activeModel(): string | undefined {
  return useProfileStore.getState().profile.defaults.qwenModel;
}

type StoreActions = {
  appendToSection: (draftId: string, sectionId: string, delta: string) => void;
  setSectionStatus: (
    draftId: string,
    sectionId: string,
    status: Section["status"]
  ) => void;
  pushSectionVersion: (
    draftId: string,
    sectionId: string,
    v: { id: string; createdAt: number; html: string }
  ) => void;
  updateSection: (draftId: string, sectionId: string, html: string) => void;
};

export type GenerateCallbacks = {
  onRetry?: (retryCount: number, delayMs: number, reason: string) => void;
};

export async function generateAllSections(
  draft: Draft,
  store: StoreActions,
  signal: AbortSignal,
  callbacks: GenerateCallbacks = {}
): Promise<void> {
  await ensureTemplate(draft);
  const system = buildSystemPrompt(draft);
  const priorTitles: string[] = [];

  for (const section of draft.sections) {
    if (signal.aborted) return;

    // reset any prior content
    store.updateSection(draft.id, section.id, "");
    store.setSectionStatus(draft.id, section.id, "streaming");

    const userPrompt = buildSectionPrompt(draft, section, priorTitles);
    let acc = "";
    try {
      await streamDraft({
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        maxTokens: 1100,
        model: activeModel(),
        signal,
        onToken: (delta) => {
          acc += delta;
          store.appendToSection(draft.id, section.id, delta);
        },
        // A retry re-streams the whole section from scratch. Reset the local
        // accumulator AND the store copy first, or the retried text would be
        // concatenated onto the truncated first attempt (doubled/garbled
        // sections — a retryable mid-stream error now throws even after
        // tokens flowed, see client.ts).
        onRetry: (retryCount, delayMs, reason) => {
          acc = "";
          store.updateSection(draft.id, section.id, "");
          callbacks.onRetry?.(retryCount, delayMs, reason);
        },
      });
      store.updateSection(draft.id, section.id, sanitiseHtml(acc));
      store.setSectionStatus(draft.id, section.id, "ready");
      store.pushSectionVersion(draft.id, section.id, {
        id: uid("ver"),
        createdAt: Date.now(),
        html: sanitiseHtml(acc),
      });
    } catch (err) {
      if (signal.aborted) return;
      store.setSectionStatus(draft.id, section.id, "empty");
      throw err;
    }

    priorTitles.push(section.title);
  }
}

/**
 * Regenerate one section's HTML and write the result back to the draft
 * as a Cursor-style PENDING CHANGE — section.html is NOT touched.
 *
 * The user reviews the diff card and Accepts or Rejects. This is the
 * preferred path for any AI-initiated change (the cursor-diff UX).
 *
 * Direct overwrite (legacy regenerateSection) still exists for the
 * "Generate all sections" flow on first open and the per-section
 * Refine dialog button — those want immediate replacement, not review.
 */
export async function regenerateSectionAsPending(
  draft: Draft,
  section: Section,
  store: StoreActions & {
    proposeSectionChange: (
      id: string,
      sectionId: string,
      change: import("../letters/types").PendingChange
    ) => void;
  },
  signal: AbortSignal,
  callbacks: GenerateCallbacks = {},
  refineInstruction?: string,
  source: "regenerate" | "addClause" | "tighten" = "regenerate"
): Promise<void> {
  await ensureTemplate(draft);
  const system = buildSystemPrompt(draft);
  // Guard the not-found case: findIndex → -1 would make slice(0, -1) return
  // ALL sections except the last (a concurrent delete could remove `section`
  // between lookup and here), feeding the LLM the wrong prior-section context.
  const sectionIndex = draft.sections.findIndex((s) => s.id === section.id);
  const priorTitles = (sectionIndex < 0 ? [] : draft.sections.slice(0, sectionIndex))
    .map((s) => s.title);

  // Don't blank section.html — keep the current content visible while
  // the new version streams into our local buffer.
  store.setSectionStatus(draft.id, section.id, "streaming");

  const userPrompt = buildSectionPrompt(draft, section, priorTitles, refineInstruction);
  let acc = "";

  // Reset the status the section was in before we flipped it to "streaming",
  // so a failed (or aborted) AI call never strands it in the spinner state
  // with no recovery affordance. The callers (AI rail) only surface the error
  // to the model via addToolResult — they don't touch section status.
  const restingStatus = section.html ? ("edited" as const) : ("empty" as const);

  try {
    await streamDraft({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1100,
      model: activeModel(),
      signal,
      onToken: (delta) => {
        acc += delta;
        // Note: NOT appending to section.html — the live text the user
        // sees stays untouched. We accumulate locally and materialize as
        // a pendingChange when the stream completes.
      },
      // Retry re-streams from scratch — drop the truncated first attempt so
      // the proposed diff isn't first-attempt + full-second-attempt garbage.
      onRetry: (retryCount, delayMs, reason) => {
        acc = "";
        callbacks.onRetry?.(retryCount, delayMs, reason);
      },
    });
  } catch (err) {
    store.setSectionStatus(draft.id, section.id, restingStatus);
    throw err;
  }

  // Aborted right as the stream finished — restore status and don't surface a
  // proposal the user already cancelled (mirrors the mid-stream throw above).
  if (signal.aborted) {
    store.setSectionStatus(draft.id, section.id, restingStatus);
    return;
  }

  const html = sanitiseHtml(acc);
  store.setSectionStatus(draft.id, section.id, restingStatus);
  store.proposeSectionChange(draft.id, section.id, {
    id: uid("change"),
    createdAt: Date.now(),
    proposedHtml: html,
    instruction: refineInstruction ?? "AI regenerate",
    source,
    modelName: activeModel(),
  });
}

export async function regenerateSection(
  draft: Draft,
  section: Section,
  store: StoreActions,
  signal: AbortSignal,
  callbacks: GenerateCallbacks = {},
  /**
   * Optional freeform instruction to bias this single regeneration. Plumbed
   * into the section user prompt as USER REFINEMENT — overrides defaults
   * but the section's structural constraints still apply.
   */
  refineInstruction?: string
): Promise<void> {
  await ensureTemplate(draft);
  const system = buildSystemPrompt(draft);
  // Guard the not-found case: findIndex → -1 would make slice(0, -1) return
  // ALL sections except the last (a concurrent delete could remove `section`
  // between lookup and here), feeding the LLM the wrong prior-section context.
  const sectionIndex = draft.sections.findIndex((s) => s.id === section.id);
  const priorTitles = (sectionIndex < 0 ? [] : draft.sections.slice(0, sectionIndex))
    .map((s) => s.title);

  store.updateSection(draft.id, section.id, "");
  store.setSectionStatus(draft.id, section.id, "streaming");

  const userPrompt = buildSectionPrompt(draft, section, priorTitles, refineInstruction);
  let acc = "";

  await streamDraft({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 1100,
    model: activeModel(),
    signal,
    onToken: (delta) => {
      acc += delta;
      store.appendToSection(draft.id, section.id, delta);
    },
    // Retry re-streams from scratch — reset the accumulator and store copy so
    // the retried section isn't appended onto the truncated first attempt.
    onRetry: (retryCount, delayMs, reason) => {
      acc = "";
      store.updateSection(draft.id, section.id, "");
      callbacks.onRetry?.(retryCount, delayMs, reason);
    },
  });

  const html = sanitiseHtml(acc);
  store.updateSection(draft.id, section.id, html);
  store.setSectionStatus(draft.id, section.id, "ready");
  store.pushSectionVersion(draft.id, section.id, {
    id: uid("ver"),
    createdAt: Date.now(),
    html,
  });
}

/**
 * Strip ```html fences, stray code formatting, and any unresolved
 * {{placeholder}} tokens the model failed to substitute. Replace
 * unresolved placeholders with [TBD] so the user sees a clear gap
 * to fill rather than the raw template variable name.
 */
function sanitiseHtml(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");

  // Replace any leftover {{placeholder}} tokens — even when the system
  // prompt explicitly forbids them, smaller models occasionally echo
  // them back. Surface as [TBD] so users notice and fill in manually.
  out = out.replace(/\{\{[^{}]+\}\}/g, "[TBD]");

  // ensure paragraphs — if model returned plain prose without <p>, wrap
  if (!/^\s*<(p|h\d|table|div|ul|ol|blockquote)/i.test(out)) {
    out = out
      .split(/\n\s*\n/)
      .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }
  return sanitizeLetterHtml(out);
}
