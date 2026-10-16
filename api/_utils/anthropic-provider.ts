import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Builds a Claude model for the AI SDK. Talks to Anthropic directly by
 * default. Set ANTHROPIC_BASE_URL (e.g. https://ai-gateway.vercel.sh/v1) to
 * route through Vercel AI Gateway instead; ANTHROPIC_API_KEY then holds the
 * gateway key. Gateway model ids are provider-prefixed and dotted
 * ("anthropic/claude-sonnet-4.6"), so ids are translated in that mode.
 */
const DIRECT_BASE_URL = "https://api.anthropic.com/v1";

export function anthropicBaseURL(env: NodeJS.ProcessEnv = process.env): string {
  return env.ANTHROPIC_BASE_URL?.trim() || DIRECT_BASE_URL;
}

export function toGatewayModelId(modelName: string): string {
  if (modelName.includes("/")) return modelName;
  // claude-sonnet-4-6 -> anthropic/claude-sonnet-4.6
  return `anthropic/${modelName.replace(/-(\d+)-(\d+)$/, "-$1.$2")}`;
}

export function anthropicModel(
  apiKey: string,
  modelName: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const baseURL = anthropicBaseURL(env);
  const id = baseURL === DIRECT_BASE_URL ? modelName : toGatewayModelId(modelName);
  return createAnthropic({ apiKey, baseURL })(id);
}
