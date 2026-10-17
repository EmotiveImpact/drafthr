/**
 * /api/case/*: the case interview's server steps.
 *
 *   POST /api/case/read   The Reader: turns a typed story into facts, people
 *                         and dated moments for the case file.
 *
 * The case history itself lives in the browser for now (src/lib/case-engine/
 * case-store.ts); this endpoint only runs the AI step and keeps nothing.
 * The model's answer is checked by cleanReading before it is returned, so a
 * fact without a quote from the story never reaches the case file.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { anthropicModel } from "../_utils/anthropic-provider.js";
import { rejectAiGeneration } from "../_utils/ai-access.js";
import { rateLimit } from "../_utils/rate-limit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { PLAYBOOKS } from "../../src/lib/case-engine/playbooks/index.js";
import { cleanReading, readerSystemPrompt } from "../../src/lib/case-engine/reader.js";
import { isIsoDate } from "../../src/lib/case-engine/dates.js";
import type { Lens, SituationId } from "../../src/lib/case-engine/types.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_STORY_CHARS = 12_000;

const readingSchema = z.object({
  situation: z.enum(["disciplinary", "grievance", "redundancy"]),
  title: z.string(),
  facts: z.array(
    z.object({
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      quote: z.string(),
    }),
  ),
  people: z.array(z.object({ name: z.string(), role: z.string(), quote: z.string() })),
  moments: z.array(
    z.object({ date: z.string().nullable(), when: z.string(), what: z.string(), quote: z.string() }),
  ),
});

type ReadRequest = { situation?: string; lens?: string; story?: string; today?: string };

async function read(req: Request): Promise<Response> {
  const parsed = await readJsonRequest<ReadRequest>(req, 40_000);
  if (!parsed.ok) return parsed.response;
  const { situation, story, today } = parsed.body;
  const lens: Lens = parsed.body.lens === "employee" ? "employee" : "hr";
  if (situation !== "disciplinary" && situation !== "grievance" && situation !== "redundancy") {
    return jsonError("Unknown situation", 400);
  }
  if (typeof story !== "string" || story.trim().length < 20) return jsonError("Tell me a little more first", 400);
  if (story.length > MAX_STORY_CHARS) return jsonError("That story is too long to read in one go", 413);
  const day = typeof today === "string" && isIsoDate(today) ? today : new Date().toISOString().slice(0, 10);

  const modelName = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const accessError = await rejectAiGeneration(req, modelName);
  if (accessError) return accessError;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return jsonError("The AI is not set up on the server yet", 503);

  const playbook = PLAYBOOKS[situation as SituationId];
  try {
    const { object } = await generateObject({
      model: anthropicModel(apiKey, modelName),
      schema: readingSchema,
      system: readerSystemPrompt(playbook, lens, day),
      prompt: `The story:\n\n${story}`,
      maxOutputTokens: 4_000,
    });
    const reading = cleanReading(object, playbook, lens, story);
    return Response.json(reading, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[case/read] reader failed", err instanceof Error ? err.message : err);
    return jsonError("I couldn't read that just now. Try again in a moment.", 502);
  }
}

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, { name: "ai", max: 40, windowMs: 60_000 });
  if (limited) return limited;

  const action = new URL(req.url).pathname.split("/").filter(Boolean)[2] ?? "";
  switch (action) {
    case "read":
      return read(req);
    default:
      return jsonError(`Unknown case path: ${action}`, 404);
  }
}
