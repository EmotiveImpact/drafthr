/**
 * Production serverless function for /api/agent — the AI SDK v6 UIMessage
 * stream endpoint consumed by useChat() in the right-rail AIPanel.
 *
 * The client sends v6 UIMessages; we convert to ModelMessages so tool-call
 * history rides along correctly, then streamText with our typed tools.
 *
 * IMPORTANT: this file inlines buildModel + agentTools rather than
 * importing them from /server/*. Vercel's serverless bundler does NOT
 * trace cross-tree imports from /api/ into /server/ — the function
 * deploys but module-load fails at runtime with FUNCTION_INVOCATION_FAILED.
 * Keep this file in sync with server/llm-model.ts + server/agent-tools.ts.
 * server/proxy.ts (local dev) still uses the canonical /server/ versions.
 */

import {
  streamText,
  convertToModelMessages,
  tool,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

/* ============================================================================
 * Inlined from server/llm-model.ts — Anthropic only.
 * ==========================================================================*/

const DEFAULT_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

function resolveModelName(requested?: string): string {
  if (requested && ALLOWED_MODELS.has(requested)) return requested;
  return process.env.LLM_MODEL ?? DEFAULT_MODEL;
}

function buildModel(requested?: string) {
  const modelName = resolveModelName(requested);
  const apiKey =
    process.env.ANTHROPIC_API_KEY ??
    "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";
  return createAnthropic({ apiKey })(modelName);
}

/* ============================================================================
 * Inlined from server/agent-tools.ts
 * ==========================================================================*/

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

const agentTools = {
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

/* ============================================================================
 * Request handler
 * ==========================================================================*/

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type AgentRequest = {
  messages: UIMessage[];
  system?: string;
  model?: string;
};

export async function POST(req: Request): Promise<Response> {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages[] required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modelMessages: ModelMessage[] = await convertToModelMessages(body.messages);

  const result = streamText({
    model: buildModel(body.model),
    system: body.system,
    messages: modelMessages,
    tools: agentTools,
    temperature: 0.4,
    maxOutputTokens: 1100,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[api/agent] streamText error:", err);
    },
  });

  return result.toUIMessageStreamResponse();
}
