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

/**
 * Whether a model still accepts sampling parameters. Opus 4.7 and every later
 * model reject `temperature`/`top_p`/`top_k` with a 400; only these older
 * models take one. Mirrored in api/draft.ts and api/agent.ts.
 */
const SAMPLING_MODELS = /^claude-(sonnet-4-6|haiku-4-5|opus-4-6|sonnet-4-5|opus-4-5)\b/;
export function temperatureFor(modelName: string, temperature: number | undefined): number | undefined {
  return SAMPLING_MODELS.test(modelName) ? temperature : undefined;
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
