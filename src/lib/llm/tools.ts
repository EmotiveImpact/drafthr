import { tool, type ToolSet } from "ai";
import { z } from "zod";

/**
 * AI SDK v6 tools exposed to the right-rail agent.
 *
 * `regenerateSection` is a HUMAN-IN-THE-LOOP tool: it has no `execute`
 * function on the server, so the SDK streams a `tool-regenerateSection`
 * part to the client with state `input-available`. The user reviews the
 * proposed instruction and clicks Apply, which:
 *
 *   1. runs the actual regeneration via `regenerateSection()` in
 *      src/lib/llm/draft.ts,
 *   2. calls `addToolResult({ toolCallId, output })` on the useChat
 *      helper, sending the outcome back to the agent so it can continue
 *      reasoning ("OK, I rewrote 2 sections, want me to do the closing
 *      next?").
 *
 * The Zod schema gives the model a strict typed contract. We don't
 * validate section_id against the live draft at the model layer — the
 * client checks before applying and surfaces a `failed` state if the
 * id is stale.
 */
export const regenerateSectionTool = tool({
  description:
    "Rewrite ONE named section of the current letter with a freeform user refinement. " +
    "Use this whenever the user wants to change, refine, or restructure a single section. " +
    "For multi-section rewrites (e.g. 'tribunal-ready the whole letter'), call this tool " +
    "once per affected section. Don't use this for purely informational replies (questions, " +
    "summaries). The instruction is appended to the section's existing prompt as " +
    "'USER REFINEMENT' — be specific about what to change and ideally why. The user must " +
    "click Apply before the change is committed.",
  inputSchema: z.object({
    section_id: z
      .string()
      .describe(
        "The section's id from the SECTIONS index in the system prompt. Use the exact id string."
      ),
    instruction: z
      .string()
      .describe(
        "Plain-English instruction. State precisely what to change and, where helpful, why. " +
          "E.g. 'drop the concession language; add explicit s.43A ERA anchor'."
      ),
  }),
});

export const agentTools = {
  regenerateSection: regenerateSectionTool,
} satisfies ToolSet;

export type AgentToolName = keyof typeof agentTools;
