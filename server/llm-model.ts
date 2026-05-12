import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_MODEL = "openai/gpt-oss-120b:free" as const;
const OPENROUTER_FALLBACK_MODEL = "openai/gpt-oss-120b:free" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

type ModelEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "ANTHROPIC_API_KEY"
    | "OPENROUTER_API_KEY"
    | "OPENROUTER_MODEL"
    | "LLM_MODEL"
    | "LLM_PROVIDER"
  >
>;

type ResolveOptions = {
  env?: ModelEnv;
  logPrefix?: string;
};

export function resolveModelName(
  requestedModel?: string,
  { env = process.env }: ResolveOptions = {}
): string {
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const envProvider = (env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = env.LLM_MODEL ?? env.OPENROUTER_MODEL;
  const providerDefault =
    envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : OPENROUTER_FALLBACK_MODEL;
  return fromRequest ?? envModel ?? providerDefault ?? DEFAULT_MODEL;
}

export function buildModel(requestedModel?: string, logPrefix?: string) {
  const modelName = resolveModelName(requestedModel, { logPrefix } as ResolveOptions);

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  // OpenRouter (default). Hardcoded fallback so production works without env vars.
  const apiKey =
    process.env.OPENROUTER_API_KEY ??
    "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";
  return createOpenAICompatible({
    name: "openrouter",
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    headers: {
      "HTTP-Referer": "https://drafthr.vercel.app",
      "X-Title": "DraftHR",
    },
  })(modelName);
}
