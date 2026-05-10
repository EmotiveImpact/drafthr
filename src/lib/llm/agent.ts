import type { AIAction, AIChatMessage, Draft } from "@/lib/letters/types";
import { uid } from "@/lib/utils";
import { getLetterMeta } from "@/lib/letters/catalog";

/**
 * The AI agent system prompt. The agent is a "drafting assistant" — it can
 * read every section of the current draft, the wizard answers, and the
 * conversation history, and propose section-level changes that the user
 * confirms before they're applied.
 *
 * Output protocol (kept lightweight to stay compatible with the Qwen models
 * we use today; no JSON tool-use):
 *
 *   - The agent replies in plain prose / markdown.
 *   - When it wants to propose a change, it embeds a sentinel block:
 *
 *       <<APPLY section_id="opening">>
 *       More conciliatory; keep the s.95(1)(c) reference.
 *       <</APPLY>>
 *
 *     The sentinel is parsed out before display. Each block becomes a
 *     proposed AIAction shown to the user with an Apply button. When the
 *     user clicks Apply, the editor calls regenerateSection with the
 *     instruction inside the block.
 *
 * Multiple <<APPLY>> blocks in one reply produce multiple proposed actions.
 */
export function buildAgentSystemPrompt(draft: Draft): string {
  const meta = getLetterMeta(draft.letterType);
  const sections = draft.sections
    .map((s, i) => `  ${i + 1}. id="${s.id}" title="${s.title}" status=${s.status}`)
    .join("\n");

  return `You are DRAFTHR's drafting assistant. You are helping the user iterate on a "${meta.title}" letter (jurisdiction: ${draft.context.jurisdiction}, mode: ${draft.mode}).

You can do four things:
  1. Answer questions about the draft, the law, the structure, or the workflow.
  2. Propose section-level edits via the <<APPLY>> sentinel below.
  3. Suggest follow-up questions to clarify intent.
  4. Summarise the letter for a third party (counsel, the recipient, the user).

OUTPUT PROTOCOL:
- Reply in plain prose. Be concise. No markdown headers; ordinary paragraphs.
- To propose a section change, embed one or more sentinel blocks of the form:

<<APPLY section_id="<id>">>
<refinement instruction in plain English>
<</APPLY>>

  Where <id> is one of the section ids listed below, and the inner text is a single instruction the editor will pass to the section regenerator (it will be appended to the section's prompt as USER REFINEMENT).
- Do NOT echo letter content inside <<APPLY>>; only the instruction.
- For "rewrite the whole letter" requests, emit one <<APPLY>> per affected section.
- Always summarise what you're proposing in prose around the sentinels so the user understands.
- If the user asks something that doesn't require an edit (e.g. "summarise this for my lawyer"), do NOT emit <<APPLY>> blocks.
- Sections you cannot edit (status=streaming) — skip and tell the user.

DRAFT META:
  - Letter type: ${meta.id} — ${meta.title}
  - Jurisdiction: ${draft.context.jurisdiction}${draft.context.ukRegion ? ` (${draft.context.ukRegion})` : ""}${draft.context.usState ? ` (${draft.context.usState})` : ""}
  - Mode: ${draft.mode} (${draft.mode === "employer" ? "HR / sender" : "employee / sender"})
  - Recipient: ${draft.mode === "employer" ? draft.employee.legalName || "[employee]" : draft.employer.legalName || "[employer]"}

SECTIONS (use these section_id values verbatim):
${sections}

RULES:
- British English when jurisdiction = UK; American when US.
- Tribunal-bound letters: never advise the user to speculate, admit, or use intensifiers. Frame protected-characteristic claims as belief.
- High-risk letters: remind the user that counsel review is required before export.
- If the user asks for "tribunal-ready", "more formal", "warmer" — translate to a precise instruction in the <<APPLY>> body. Don't rely on adjectives alone; say WHY (e.g. "drop concession language; add explicit statutory anchor s.43A ERA").

Be brief. Be useful. Don't editorialise.`;
}

/**
 * Build the chat-history payload for the model. We send recent turns only
 * (cap at 12) plus the latest user message — the system prompt carries the
 * full draft state so the agent has the live picture.
 */
export function buildAgentMessages(
  draft: Draft,
  history: AIChatMessage[],
  userMessage: string,
  scopeLabel: string
): { role: "system" | "user" | "assistant"; content: string }[] {
  const system = buildAgentSystemPrompt(draft);
  const recent = history.slice(-12).filter((m) => !m.streaming).map((m) => {
    if (m.role === "assistant") return { role: "assistant" as const, content: m.body };
    const scopeBit = m.scope === "section" && m.sectionId
      ? ` [scope: section ${m.sectionId}]`
      : m.scope === "selection" && m.quote
      ? ` [scope: selection "${m.quote}"]`
      : ` [scope: whole letter]`;
    return { role: "user" as const, content: `${m.body}${scopeBit}` };
  });
  return [
    { role: "system", content: system },
    ...recent,
    { role: "user", content: `${userMessage}\n[scope: ${scopeLabel}]` },
  ];
}

/**
 * Parse an assistant reply for <<APPLY section_id="...">>...<</APPLY>>
 * sentinels. Returns the cleaned body (sentinels stripped) and a list of
 * proposed actions to show under the message.
 */
export function parseAgentReply(reply: string, sections: Draft["sections"]):
  { body: string; actions: AIAction[] } {
  const re = /<<APPLY\s+section_id="([^"]+)"\s*>>([\s\S]*?)<<\/APPLY>>/g;
  const actions: AIAction[] = [];
  let body = reply.replace(re, (_match, sectionId: string, instruction: string) => {
    const section = sections.find((s) => s.id === sectionId);
    actions.push({
      id: uid("act"),
      kind: "regenerate",
      sectionId,
      sectionTitle: section?.title ?? sectionId,
      instruction: instruction.trim(),
      status: "proposed",
    });
    return "";
  });
  // Tidy up extra blank lines left by the strip.
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return { body, actions };
}
