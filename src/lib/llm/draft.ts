import type { Draft, Section } from "@/lib/letters/types";
import { buildSystemPrompt } from "@/lib/prompts/system";
import { buildSectionPrompt } from "@/lib/prompts/sections";
import { streamDraft } from "./client";
import { uid } from "@/lib/utils";

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
        signal,
        onToken: (delta) => {
          acc += delta;
          store.appendToSection(draft.id, section.id, delta);
        },
        onRetry: callbacks.onRetry,
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

export async function regenerateSection(
  draft: Draft,
  section: Section,
  store: StoreActions,
  signal: AbortSignal,
  callbacks: GenerateCallbacks = {}
): Promise<void> {
  const system = buildSystemPrompt(draft);
  const priorTitles = draft.sections
    .slice(0, draft.sections.findIndex((s) => s.id === section.id))
    .map((s) => s.title);

  store.updateSection(draft.id, section.id, "");
  store.setSectionStatus(draft.id, section.id, "streaming");

  const userPrompt = buildSectionPrompt(draft, section, priorTitles);
  let acc = "";

  await streamDraft({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 1100,
    signal,
    onToken: (delta) => {
      acc += delta;
      store.appendToSection(draft.id, section.id, delta);
    },
    onRetry: callbacks.onRetry,
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

/** Strip ```html fences and stray code formatting that Qwen sometimes wraps output in. */
function sanitiseHtml(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  // ensure paragraphs — if model returned plain prose without <p>, wrap
  if (!/^\s*<(p|h\d|table|div|ul|ol|blockquote)/i.test(out)) {
    out = out
      .split(/\n\s*\n/)
      .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }
  return out;
}
