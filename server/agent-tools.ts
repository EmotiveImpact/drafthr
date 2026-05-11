import { tool, type ToolSet } from "ai";
import { z } from "zod";

const addClauseSchema = z.object({
  section_id: z.string().describe("Section id from the SECTIONS index."),
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
    .describe("Which clause to insert."),
  position: z
    .enum(["append", "prepend", "replace_paragraph"])
    .default("append")
    .describe("Where to put the clause within the section."),
  note: z.string().optional().describe("Optional one-line tweak."),
});

export const agentTools = {
  regenerateSection: tool({
    description:
      "Rewrite ONE named section of the current letter with a freeform user refinement. " +
      "Use this whenever the user wants to change, refine, or restructure a single section. " +
      "For multi-section rewrites, call this tool once per affected section. Don't use for " +
      "purely informational replies. The instruction is appended as 'USER REFINEMENT' to the " +
      "section's existing prompt. The user must click Apply before the change commits.",
    inputSchema: z.object({
      section_id: z.string().describe("Section id from the SECTIONS index."),
      instruction: z
        .string()
        .describe("Plain-English instruction. State precisely what to change and why."),
    }),
  }),

  addClause: tool({
    description:
      "Insert a specific NAMED clause into a section. Use when the user asks to add a clause " +
      "by name. System has built-in patterns; only pick which clause and where. " +
      "Human-in-the-loop: user clicks Apply.",
    inputSchema: addClauseSchema,
  }),

  tightenSection: tool({
    description:
      "Rewrite ONE section to hit a specific word-count target. Use when the user asks to " +
      "shorten, tighten, cut by N words, or aim for M words. Preserves every fact and citation. " +
      "Human-in-the-loop.",
    inputSchema: z.object({
      section_id: z.string().describe("Section id from the SECTIONS index."),
      target_words: z
        .number()
        .int()
        .min(20)
        .max(2000)
        .describe("Target word count. Aim for about 80% of current length unless specified."),
    }),
  }),

  summariseForCounsel: tool({
    description:
      "Produce a counsel-grade summary of the current letter. Cover (1) what it says, " +
      "(2) what it relies on, (3) what it asks for, and (4) key risk points. Call this " +
      "tool when producing such a summary so the client renders it as a structured card.",
    inputSchema: z.object({
      audience: z
        .enum(["counsel", "hr_partner", "self"])
        .default("counsel")
        .describe("Who the summary is for."),
      note: z.string().optional().describe("Optional one-line context."),
    }),
  }),
} satisfies ToolSet;
