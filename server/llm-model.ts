import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Keep in sync with src/lib/llm/default-model.ts. The API functions avoid
// importing from /src because Vercel's serverless bundler has previously
// failed to trace that path in production.
const DEFAULT_MODEL = "qwen3-max" as const;
const QWEN_FALLBACK_MODEL = "qwen3-max" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;

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

type ModelEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "ANTHROPIC_API_KEY"
    | "LLM_MODEL"
    | "LLM_PROVIDER"
    | "QWEN_API_KEY"
    | "QWEN_BASE_URL"
    | "QWEN_MODEL"
  >
>;

type ResolveOptions = {
  env?: ModelEnv;
  logPrefix?: string;
};

/**
 * Resolve the concrete provider model from user preference and environment.
 * The client may send only allow-listed ids; deployment env can still override
 * to a provider-specific model for emergency rollbacks.
 */
export function resolveModelName(
  requestedModel?: string,
  { env = process.env, logPrefix }: ResolveOptions = {}
): string {
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const envProvider = (env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = env.LLM_MODEL ?? env.QWEN_MODEL;
  const providerDefault =
    envProvider === "qwen"
      ? QWEN_FALLBACK_MODEL
      : envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : DEFAULT_MODEL;
  let modelName = fromRequest ?? envModel ?? providerDefault;

  if (isClaudeModel(modelName) && !env.ANTHROPIC_API_KEY && env.QWEN_API_KEY) {
    warn(
      logPrefix,
      `Requested ${modelName} but ANTHROPIC_API_KEY is missing. Falling back to ${QWEN_FALLBACK_MODEL}.`
    );
    modelName = QWEN_FALLBACK_MODEL;
  } else if (!isClaudeModel(modelName) && !env.QWEN_API_KEY && env.ANTHROPIC_API_KEY) {
    warn(
      logPrefix,
      `Requested ${modelName} but QWEN_API_KEY is missing. Falling back to ${ANTHROPIC_FALLBACK_MODEL}.`
    );
    modelName = ANTHROPIC_FALLBACK_MODEL;
  }

  return modelName;
}

export function buildModel(requestedModel?: string, logPrefix?: string) {
  const modelName = resolveModelName(requestedModel, { logPrefix });

  if (isClaudeModel(modelName)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  return createOpenAICompatible({ name: "qwen", apiKey, baseURL })(modelName);
}

function isClaudeModel(modelName: string): boolean {
  return modelName.startsWith("claude-");
}

function warn(logPrefix: string | undefined, message: string): void {
  if (!logPrefix) return;
  // eslint-disable-next-line no-console
  console.warn(`[${logPrefix}] ${message}`);
}
