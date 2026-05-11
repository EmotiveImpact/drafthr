/**
 * Production serverless function for /api/agent — the AI SDK v6 UIMessage
 * stream endpoint consumed by useChat() in the right-rail AIPanel.
 *
 * The client sends v6 UIMessages; we convert to ModelMessages so tool-call
 * history rides along correctly, then streamText with our typed tools.
 */

import {
  streamText,
  convertToModelMessages,
  tool,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// Vercel's serverless bundler doesn't reliably follow cross-tree imports
// out of /api/ into /src/, so we keep the server-side tool schemas inline
// here. The client (src/lib/llm/tools.ts) has CLAUSE_TEMPLATES + ClauseType
// for the apply-time flow; the server only needs the schemas the model
// uses to pick a tool. The two surfaces evolve together — when adding a
// new tool, update both.
const DEFAULT_MODEL = "qwen3-max" as const;

const regenerateSectionTool = tool({
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
});

const addClauseTool = tool({
  description:
    "Insert a specific NAMED clause into a section. Use when the user asks to add a clause " +
    "by name (e.g. 'add an IP-assignment clause'). System has built-in patterns; only pick " +
    "which clause and where. Human-in-the-loop — user clicks Apply.",
  inputSchema: z.object({
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
  }),
});

const tightenSectionTool = tool({
  description:
    "Rewrite ONE section to hit a specific word-count target. Use when the user asks to " +
    "shorten / tighten / cut by N words / aim for M words. Preserves every fact and citation. " +
    "Human-in-the-loop.",
  inputSchema: z.object({
    section_id: z.string().describe("Section id from the SECTIONS index."),
    target_words: z
      .number()
      .int()
      .min(20)
      .max(2000)
      .describe("Target word count. Aim for ~80% of current length unless specified."),
  }),
});

const summariseForCounselTool = tool({
  description:
    "Produce a counsel-grade summary of the current letter. Cover (1) what it says, " +
    "(2) what it relies on, (3) what it asks for, (4) key risk points. Call this tool when " +
    "producing such a summary so the client renders it as a structured card.",
  inputSchema: z.object({
    audience: z
      .enum(["counsel", "hr_partner", "self"])
      .default("counsel")
      .describe("Who the summary is for."),
    note: z.string().optional().describe("Optional one-line context."),
  }),
});

const agentTools = {
  regenerateSection: regenerateSectionTool,
  addClause: addClauseTool,
  tightenSection: tightenSectionTool,
  summariseForCounsel: summariseForCounselTool,
} satisfies ToolSet;

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type AgentRequest = {
  messages: UIMessage[];
  system?: string;
  model?: string;
};

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "qwen3-max",
  "qwen-flash",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
]);

function buildModel(requestedModel?: string) {
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.LLM_MODEL ?? process.env.QWEN_MODEL;
  let modelName =
    fromRequest ?? envModel ?? (envProvider === "qwen" ? "qwen3-max" : DEFAULT_MODEL);

  // Transparent fallback when the requested provider's key isn't on this
  // server. Matches server/proxy.ts + api/draft.ts.
  if (modelName.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY) {
    const fallback = envModel ?? "qwen3-max";
    // eslint-disable-next-line no-console
    console.warn(
      `[api/agent] Requested ${modelName} but ANTHROPIC_API_KEY is missing. ` +
        `Falling back to ${fallback}.`
    );
    modelName = fallback;
  } else if (
    !modelName.startsWith("claude-") &&
    !process.env.QWEN_API_KEY &&
    process.env.ANTHROPIC_API_KEY
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[api/agent] Requested ${modelName} but QWEN_API_KEY is missing. ` +
        `Falling back to ${DEFAULT_MODEL}.`
    );
    modelName = DEFAULT_MODEL;
  }

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelName);
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const qwen = createOpenAICompatible({ name: "qwen", apiKey, baseURL });
  return qwen(modelName);
}

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
