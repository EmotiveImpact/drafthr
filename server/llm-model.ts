import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Keep in sync with api/draft.ts. The API functions avoid importing from /src
// because Vercel's serverless bundler has previously failed to trace that path.
const DEFAULT_MODEL = "gemini-3.1-flash-lite" as const;
const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;
const NVIDIA_FALLBACK_MODEL = "z-ai/glm4.7" as const;
const QWEN_FALLBACK_MODEL = "qwen3-max" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "z-ai/glm4.7",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "mistralai/mistral-large-2-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
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
    | "GEMINI_API_KEY"
    | "GEMINI_MODEL"
    | "NVIDIA_API_KEY"
    | "NVIDIA_MODEL"
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
  const envModel = env.LLM_MODEL ?? env.GEMINI_MODEL ?? env.NVIDIA_MODEL ?? env.QWEN_MODEL;
  const providerDefault =
    envProvider === "gemini" || envProvider === "google"
      ? GEMINI_FALLBACK_MODEL
      : envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : envProvider === "nvidia" || envProvider === "nim"
      ? NVIDIA_FALLBACK_MODEL
      : envProvider === "qwen"
      ? QWEN_FALLBACK_MODEL
      : DEFAULT_MODEL;
  return fromRequest ?? envModel ?? providerDefault;
}

function isNvidiaModel(name: string): boolean {
  return ["meta/", "mistralai/", "nvidia/", "microsoft/", "z-ai/"].some((p) => name.startsWith(p));
}

export function buildModel(requestedModel?: string, logPrefix?: string) {
  const modelName = resolveModelName(requestedModel, { logPrefix });

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  if (modelName.startsWith("gemini-")) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing in environment.");
    return createGoogleGenerativeAI({ apiKey })(modelName);
  }

  if (isNvidiaModel(modelName)) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("NVIDIA_API_KEY missing in environment.");
    return createOpenAICompatible({
      name: "nvidia-nim",
      apiKey,
      baseURL: NVIDIA_BASE_URL,
    })(modelName);
  }

  // Qwen / OpenAI-compatible fallback
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL = process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  return createOpenAICompatible({ name: "qwen", apiKey, baseURL })(modelName);
}

function warn(logPrefix: string | undefined, message: string): void {
  if (!logPrefix) return;
  // eslint-disable-next-line no-console
  console.warn(`[${logPrefix}] ${message}`);
}
