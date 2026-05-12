import { createAnthropic } from "@ai-sdk/anthropic";

const DEFAULT_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

type ModelEnv = Partial<
  Pick<NodeJS.ProcessEnv, "ANTHROPIC_API_KEY" | "LLM_MODEL">
>;

type ResolveOptions = {
  env?: ModelEnv;
  logPrefix?: string;
};

export function resolveModelName(
  requestedModel?: string,
  { env = process.env }: ResolveOptions = {}
): string {
  if (requestedModel && ALLOWED_MODELS.has(requestedModel)) return requestedModel;
  return env.LLM_MODEL ?? DEFAULT_MODEL;
}

export function buildModel(requestedModel?: string) {
  const modelName = resolveModelName(requestedModel);
  // Use || (not ??) so empty-string env vars fall back to the hardcoded
  // key. Empty exports happen on some shells and Vercel projects.
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    "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";
  return createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" })(modelName);
}
