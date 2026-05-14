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
  return env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

export function requireAnthropicApiKey(env: ModelEnv = process.env): string {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }
  return apiKey;
}

export function buildModel(requestedModel?: string) {
  const modelName = resolveModelName(requestedModel);
  const apiKey = requireAnthropicApiKey();
  return createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" })(modelName);
}
