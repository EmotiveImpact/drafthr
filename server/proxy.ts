import type { ServerResponse } from "node:http";
import { streamText, type CoreMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type DraftRequest = {
  messages: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
};

const provider = (process.env.LLM_PROVIDER ?? "qwen").toLowerCase();

function buildModel() {
  if (provider === "claude") {
    throw new Error(
      "Claude provider not configured. Install @ai-sdk/anthropic and set ANTHROPIC_API_KEY."
    );
  }
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const modelName = process.env.QWEN_MODEL ?? "qwen3-max";
  const qwen = createOpenAICompatible({
    name: "qwen",
    apiKey,
    baseURL,
  });
  return qwen(modelName);
}

export async function handleDraftRequest(
  body: DraftRequest,
  res: ServerResponse
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const encoder = new TextEncoder();
  const writeEvent = (payload: object) => {
    res.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };
  const writeRaw = (line: string) => {
    res.write(encoder.encode(`data: ${line}\n\n`));
  };

  let totalTokens = 0;
  try {
    const result = streamText({
      model: buildModel(),
      messages: body.messages,
      temperature: body.temperature ?? 0.4,
      maxTokens: body.maxTokens ?? 1200,
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("[qwen-proxy] streamText onError:", err);
      },
    });

    for await (const chunk of result.textStream) {
      if (!chunk) continue;
      totalTokens += 1;
      writeEvent({ delta: chunk });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    // eslint-disable-next-line no-console
    console.error("[qwen-proxy] error:", err);
    writeEvent({ error: msg });
  }

  if (totalTokens === 0) {
    writeEvent({
      error:
        "Model returned no tokens. Check the API key, model name (QWEN_MODEL), and that the prompt is valid.",
    });
  }

  writeRaw("[DONE]");
  res.end();
}
