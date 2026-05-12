import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const DEFAULT_MODEL = "moonshotai/kimi-k2.6" as const;
const NVIDIA_FALLBACK_MODEL = "moonshotai/kimi-k2.6" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "moonshotai/kimi-k2.6",
  "z-ai/glm4.7",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "mistralai/mistral-large-2-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

type ModelEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "ANTHROPIC_API_KEY"
    | "NVIDIA_API_KEY"
    | "NVIDIA_MODEL"
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
  const envModel = env.LLM_MODEL ?? env.NVIDIA_MODEL;
  const providerDefault =
    envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : NVIDIA_FALLBACK_MODEL;
  return fromRequest ?? envModel ?? providerDefault ?? DEFAULT_MODEL;
}

export function buildModel(requestedModel?: string, logPrefix?: string) {
  const modelName = resolveModelName(requestedModel, { logPrefix } as ResolveOptions);

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  // NVIDIA NIM (default for everything else)
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY missing in environment.");
  return createOpenAICompatible({
    name: "nvidia-nim",
    apiKey,
    baseURL: NVIDIA_BASE_URL,
  })(modelName);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function warn(logPrefix: string | undefined, message: string): void {
  if (!logPrefix) return;
  // eslint-disable-next-line no-console
  console.warn(`[${logPrefix}] ${message}`);
}
