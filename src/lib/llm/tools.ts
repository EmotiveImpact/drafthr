import { tool, type ToolSet } from "ai";
import { z } from "zod";

/**
 * AI SDK v6 tools exposed to the right-rail agent.
 *
 * All mutating tools are HUMAN-IN-THE-LOOP — no server-side `execute`,
 * so the SDK streams a `tool-<name>` part to the client with state
 * `input-available`. The user reviews and clicks Apply; the client
 * runs the work and calls `addToolResult()` to push the outcome back
 * to the model so it can continue reasoning.
 *
 * Tools today:
 *  1. regenerateSection — rewrite a named section with a freeform instruction
 *  2. addClause         — insert a specific clause type into a section
 *  3. tightenSection    — rewrite a section with an explicit word-count target
 *  4. summariseForCounsel — non-mutating; produce a structured summary
 *                          (what the letter says, relies on, asks for, risks)
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

/**
 * Inserts a named clause type into a section. We resolve the clause to a
 * specific instruction template at apply-time so the model only has to
 * pick the right clause name + scope — no need to author the clause text.
 */
/** Standalone Zod schema so we can z.infer it for the client-side types. */
const addClauseSchema = z.object({
  section_id: z
    .string()
    .describe("Section id from the SECTIONS index. The clause is inserted into this section."),
  clause_type: z
    .enum([
      "confidentiality",
      "non_compete",
      "non_solicitation",
      "ip_assignment",
      "indemnification",
      "right_of_appeal",
      "reservation_of_rights",
      "without_prejudice_header",
      "garden_leave",
      "data_protection",
    ])
    .describe("Which clause to insert. Pick the closest match from the enum."),
  position: z
    .enum(["append", "prepend", "replace_paragraph"])
    .default("append")
    .describe(
      "Where to put the clause within the section. 'append' is usually right; use 'replace_paragraph' " +
        "only when explicitly replacing an existing clause."
    ),
  note: z
    .string()
    .optional()
    .describe(
      "Optional one-line tweak (e.g. 'three-year period not five', 'limit to UK only'). Free-form."
    ),
});

export const addClauseTool = tool({
  description:
    "Insert a specific NAMED clause into a section. Use this when the user asks to add a clause " +
    "by name (e.g. 'add an IP-assignment clause to the body', 'put a confidentiality clause in the terms'). " +
    "The system has built-in patterns for common clauses; you only pick which clause and where. " +
    "For clauses we don't recognise, use regenerateSection with an explicit instruction instead. " +
    "Human-in-the-loop — the user clicks Apply before the change commits.",
  inputSchema: addClauseSchema,
});

/**
 * Tightens a section to an explicit word-count target. Useful for users
 * who want to cap section length without the vagueness of "make it shorter".
 */
export const tightenSectionTool = tool({
  description:
    "Rewrite ONE section to hit a specific word-count target. Use this when the user asks to " +
    "shorten / tighten / cut by N words / aim for M words. Preserves every fact, citation, and " +
    "structural requirement — just trims redundancy. Human-in-the-loop.",
  inputSchema: z.object({
    section_id: z.string().describe("Section id from the SECTIONS index."),
    target_words: z
      .number()
      .int()
      .min(20)
      .max(2000)
      .describe(
        "Target word count for the new section. Be conservative — aim for ~80% of the current length " +
          "unless the user specified otherwise."
      ),
  }),
});

/**
 * Non-mutating. The agent generates a structured summary directly in its
 * reply. We don't enforce an `outputSchema` — the model just produces
 * the summary in prose inside its text part. The client renders it as a
 * neat "Summary for counsel" card with a Copy button.
 *
 * Calling this tool is the model's way of saying "I produced a counsel-
 * grade summary, not just casual prose" — it lets us style the reply
 * appropriately.
 */
export const summariseForCounselTool = tool({
  description:
    "Produce a counsel-grade summary of the current letter. Use this when the user asks to " +
    "summarise / brief / explain the letter for a lawyer or HR partner. The summary should " +
    "cover (in this order): (1) what the letter says, (2) what it relies on (statutes / " +
    "contractual provisions / facts in evidence), (3) what it asks for (remedies / outcomes), " +
    "(4) key risk points the recipient might exploit. Call this tool when producing such a " +
    "summary so the client can render it as a structured card with a Copy button. The summary " +
    "itself goes in the regular text reply — this tool is a marker.",
  inputSchema: z.object({
    audience: z
      .enum(["counsel", "hr_partner", "self"])
      .default("counsel")
      .describe("Who the summary is for. Tunes the register: counsel = lean and technical."),
    note: z
      .string()
      .optional()
      .describe("Optional one-line context (e.g. 'we're sending this to a barrister tonight')."),
  }),
});

export const agentTools = {
  regenerateSection: regenerateSectionTool,
  addClause: addClauseTool,
  tightenSection: tightenSectionTool,
  summariseForCounsel: summariseForCounselTool,
} satisfies ToolSet;

export type AgentToolName = keyof typeof agentTools;

/**
 * Map a clause_type enum to a concrete refinement instruction. Called
 * client-side when the user clicks Apply on an addClause tool call.
 */
export const CLAUSE_TEMPLATES: Record<
  z.infer<typeof addClauseSchema>["clause_type"],
  string
> = {
  confidentiality:
    "Add a confidentiality clause obliging the recipient to keep proprietary information confidential, surviving termination. UK: reference the implied duty + any contract clause. US: tie to applicable trade-secrets law and any signed NDA.",
  non_compete:
    "Add a post-termination non-compete clause. UK: must be no broader than reasonably necessary in scope, geography, and duration to be enforceable (12 months max typically). US: do NOT add in CA, ND, OK, MN.",
  non_solicitation:
    "Add a post-termination non-solicitation of customers / employees clause. Cap duration and scope explicitly.",
  ip_assignment:
    "Add an intellectual-property assignment clause: any work created in the course of employment vests in the employer; recipient assigns all rights and waives moral rights so far as the law permits.",
  indemnification:
    "Add a mutual indemnification clause limited to direct losses arising from the indemnifying party's gross negligence or wilful misconduct. Cap at the fees paid in the preceding 12 months.",
  right_of_appeal:
    "Add a mandatory right-of-appeal paragraph: name the appeal officer, give a 5-working-day deadline, reference s.10 ERelA 1999 for the right to be accompanied (UK).",
  reservation_of_rights:
    "Add a reservation-of-rights paragraph: 'I reserve all my rights, including statutory, contractual, and common-law remedies, and the right to bring proceedings before the Employment Tribunal / EEOC / state agency.'",
  without_prejudice_header:
    "Prepend the header '<p><strong>Without Prejudice and Subject to Contract</strong></p>' as the first paragraph of the section.",
  garden_leave:
    "Add a garden-leave clause: employee remains employed and paid during the notice period but is required not to attend the workplace or contact clients. Only enforceable if contractually provided for.",
  data_protection:
    "Add a data-protection clause: the parties will process personal data in compliance with UK GDPR / GDPR / applicable state privacy law; include the lawful basis being relied on.",
};

export type ClauseType = keyof typeof CLAUSE_TEMPLATES;
