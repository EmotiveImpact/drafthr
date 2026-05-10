# Qwen API Reference for HR Letter Drafting

A practical reference for wiring Alibaba's Qwen models (DashScope International) into a Vite + React SPA that drafts formal English HR letters section-by-section. Opinionated. Validated against a working production integration in `/Users/augustusedem/Code/meridian/apps/api/src/ai/models.ts`.

---

## 1. Model lineup (early 2026) and recommendation

Alibaba's DashScope International catalogue is in flux — the Qwen3 series has effectively replaced the Qwen2.5 line for hosted use, and the `-latest` aliases now float to whatever Alibaba has most recently shipped.

| Model | Context | Max output | Approx price (USD / 1M tok in / out) | Best at |
|---|---|---|---|---|
| `qwen3-max` | 262,144 | 32,768 | $1.20–$3.00 / $6.00–$15.00 (tiered) | Frontier reasoning, long inputs, formal tone |
| `qwen-max` / `qwen-max-latest` | 32,768 | 8,192 | $1.60 / $6.40 | Stable previous-gen flagship |
| `qwen-plus` / `qwen-plus-latest` | 1,000,000 | 32,768 | $0.40–$1.20 / $1.20–$3.60 (tiered) | Balanced day-to-day default |
| `qwen3.5-plus` | 1,000,000 | 65,536 | $0.40–$0.50 / tiered | Newest balanced tier, multimodal |
| `qwen-flash` / `qwen3.5-flash` | 1,000,000 | 32–65k | $0.029–$0.25 in | Cheap, high-throughput |
| `qwen-turbo` | 131,072–1M | 16,384 | $0.05 / $0.20 | Legacy cheap tier (now superseded by qwen-flash) |
| `qwen3-235b-a22b-instruct` | 128k | 8k | $0.70 / $2.80 (non-thinking) | Open-weights MoE, ensemble diversity |
| `qwen2.5-72b-instruct` | 128k | 8k | ~$0.40 / ~$1.20 | Older but rock-solid; still on the menu for fallback |

**Recommendation for HR letters: `qwen3-max`.**

Cost is secondary, output is short (≤800 tokens per section), and `qwen3-max` is markedly more disciplined on register, idiom, and paragraph cohesion than `qwen-plus`. It also handles UK-vs-US spelling and honorifics on instruction (e.g. "British English, second-person where addressing the recipient"). Set `qwen-plus-latest` as your fallback when `qwen3-max` rate-limits — the prose quality drop is small, the cost drop is roughly 4×.

---

## 2. Endpoints

There are two endpoints worth caring about. Use the **OpenAI-compatible Singapore endpoint**. Skip the native DashScope shape unless you are using Alibaba-specific features (Qwen-VL image pipelines, search grounding) — for plain chat completions it's strictly more friction.

```
# OpenAI-compatible (use this)
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions

# Native DashScope (don't bother for chat)
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation
```

Auth on both is `Authorization: Bearer $DASHSCOPE_API_KEY`. The mainland China endpoint (`dashscope.aliyuncs.com`) is the same shape but data residency moves to mainland — outside China you want the `-intl` host.

---

## 3. Request / response shape

### OpenAI-compatible — curl

```bash
curl https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-max",
    "messages": [
      {"role": "system", "content": "You are an HR letter drafter."},
      {"role": "user", "content": "Draft the salutation and opening paragraph..."}
    ],
    "stream": true,
    "temperature": 0.4,
    "max_tokens": 800
  }'
```

Response is standard OpenAI chat-completions JSON when `stream: false`, or `data: {...}\n\ndata: [DONE]` SSE chunks when `stream: true`. Each delta chunk is `{ choices: [{ delta: { content: "..." } }] }`.

### Native DashScope — for completeness

```bash
curl https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-DashScope-SSE: enable" \
  -d '{
    "model": "qwen3-max",
    "input": { "messages": [...] },
    "parameters": { "result_format": "message", "incremental_output": true }
  }'
```

Streaming requires the `X-DashScope-SSE: enable` header and `incremental_output: true`. The chunk shape is `{ output: { choices: [{ message: { content: "..." } }] } }` — different from OpenAI. Stick with the compat endpoint and you avoid having to handle two shapes.

---

## 4. Streaming — SSE through the OpenAI-compat endpoint

Yes, fully supported. `stream: true` returns `text/event-stream` with `data:`-prefixed JSON chunks. From the browser you have two reasonable paths:

1. **Vercel AI SDK `streamText` + `useChat`** — the default. Handles parsing, backpressure, and reconnects.
2. **Native `fetch` + `ReadableStream`** — when you want zero dependencies. `EventSource` doesn't work because it can't send POST bodies.

Native consumption sketch:

```ts
const res = await fetch("/api/qwen/stream", { method: "POST", body: JSON.stringify(req) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  for (const line of buf.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") return;
    const json = JSON.parse(payload);
    const token = json.choices?.[0]?.delta?.content;
    if (token) onToken(token);
  }
  buf = buf.slice(buf.lastIndexOf("\n") + 1);
}
```

Note the buffer carry-over — chunks split on arbitrary byte boundaries.

---

## 5. Vercel AI SDK compatibility

There is no first-party `@ai-sdk/qwen`. There is a community provider (`qwen-ai-provider` by Younis-Ahmed) but it lags the AI SDK release train. **Use `@ai-sdk/openai-compatible` directly** — it's a Vercel-maintained package and the compat endpoint is genuinely OpenAI-shaped.

```ts
// shared/llm/qwen.ts (server-side only)
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

const qwen = createOpenAICompatible({
  name: "qwen",
  apiKey: process.env.QWEN_API_KEY!,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  includeUsage: true,
});

export const draftSection = (system: string, user: string) =>
  streamText({
    model: qwen("qwen3-max"),
    system,
    prompt: user,
    temperature: 0.4,
    // qwen3-max max output is 32k but HR sections want ~800
    maxOutputTokens: 1000,
  });
```

The same pattern works in the meridian codebase today (`apps/api/src/ai/models.ts`), so this is battle-tested, not aspirational.

---

## 6. Browser-safe vs server-side — proxy pattern

**Never put `QWEN_API_KEY` in a Vite `import.meta.env.VITE_*` variable.** Vite inlines those at build time and they end up in the JS bundle, fully readable. The key needs to live server-side.

For a Vite SPA, the cheapest workable shape:

- **Dev**: a Vite plugin that mounts a tiny middleware on the dev server. The browser hits `/api/draft`, the middleware proxies to DashScope.
- **Prod**: a serverless function (Vercel Function, Cloudflare Worker, Netlify Function) at the same `/api/draft` path. Same code, different deploy target.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { qwenProxyPlugin } from "./dev/qwen-proxy-plugin";

export default defineConfig({
  plugins: [react(), qwenProxyPlugin()],
});
```

```ts
// dev/qwen-proxy-plugin.ts
import type { Plugin } from "vite";
import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const qwenProxyPlugin = (): Plugin => ({
  name: "qwen-proxy",
  configureServer(server) {
    server.middlewares.use("/api/draft", async (req, res) => {
      if (req.method !== "POST") return res.end();
      const body = await new Promise<string>((r) => {
        let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s));
      });
      const { system, prompt } = JSON.parse(body);
      const qwen = createOpenAICompatible({
        name: "qwen",
        apiKey: process.env.QWEN_API_KEY!,
        baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      });
      const result = streamText({ model: qwen("qwen3-max"), system, prompt });
      res.setHeader("Content-Type", "text/event-stream");
      result.toTextStreamResponse().body!.pipeTo(
        new WritableStream({ write: (c) => res.write(c) }),
      ).then(() => res.end());
    });
  },
});
```

For prod on Vercel, the same handler becomes `api/draft.ts` returning `result.toTextStreamResponse()` — identical logic, no key in the browser.

---

## 7. Costs — per HR letter

Assume one letter = 6 sections × (1500 input tokens + 800 output tokens). Each section is one call, so:

- **Total input**: 9,000 tokens
- **Total output**: 4,800 tokens

| Model | Input cost | Output cost | **Per letter** |
|---|---|---|---|
| `qwen3-max` | 9k × $1.20 = $0.0108 | 4.8k × $6.00 = $0.0288 | **~$0.040** |
| `qwen-plus` | 9k × $0.40 = $0.0036 | 4.8k × $1.20 = $0.0058 | **~$0.009** |
| `qwen-flash` | 9k × $0.05 = $0.00045 | 4.8k × $0.20 = $0.00096 | **~$0.0014** |

At forty cents a letter even `qwen3-max` is functionally free at any reasonable HR volume. Don't over-engineer cost optimisation.

---

## 8. Rate limits and context

DashScope publishes loose tier-based limits, typically 60–600 RPM and 100k–1M TPM at the standard paid tier. Free tier is much tighter (~10 RPM). Hit either RPM or RPS and you get a `429`. Build a single retry-with-backoff helper around the call site — three tries with exponential backoff (1s, 4s, 16s) covers the realistic transient cases.

Context windows are not a constraint for HR letters: 3–5k tokens of system prompt + question answers fits inside `qwen-max`'s 32k, and any of the `-plus`/`-flash` lines have 1M-token windows.

---

## 9. System prompt patterns for Qwen on formal English

A few quirks worth knowing — Qwen's pre-training has a Chinese-language gravity that occasionally shows through:

- **It defaults to bullet lists.** Whenever the user prompt is structured (questions, fields), Qwen tends to answer in bullets. For flowing prose, instruct explicitly: "Respond in flowing paragraphs. Do not use bullet points, numbered lists, or section headers unless the user explicitly requests them."
- **Register drift.** It can slip from "formal business" toward "encouraging blog post." Anchor the register: "Use the formal register of a UK HR department. Avoid second-person colloquialisms ('you'll', 'we're excited'). Prefer 'we are pleased to confirm' over 'we're happy to share'."
- **Honorifics.** Tell it which to use — "Address the recipient as Mr./Ms./Dr. {Surname} unless instructed otherwise. Do not invent honorifics."
- **Em-dashes and ASCII.** Qwen will sometimes emit Chinese punctuation (`，`, `。`) in mixed-language prompts. Specify "Use only ASCII punctuation."
- **Temperature.** 0.3–0.5 for HR letters. Higher and it editorialises; lower and it reads stilted.

A working system-prompt skeleton:

```
You are an HR letter drafter for a UK company. Write only the section
requested — never the whole letter. Use formal British English in
flowing paragraphs (no bullets, no headings). Address the recipient as
Mr./Ms./Dr. {Surname}. Use ASCII punctuation only. Where facts are
uncertain, write "[TBD]" rather than inventing them.
```

---

## 10. Migration path to Claude — the abstraction layer

The whole point of this design is that swapping providers is a one-file change. Define a narrow interface, not a wrapper around `streamText`'s entire surface — you only need the slice you actually use.

```ts
// shared/llm/provider.ts
export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type DraftRequest = {
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type LlmProvider = {
  /** Streams text tokens. Caller iterates the AsyncIterable. */
  streamDraft(req: DraftRequest): AsyncIterable<string>;
  /** Provider identifier — for telemetry only, never branch on this. */
  readonly name: string;
};
```

Two implementations behind the same interface:

```ts
// shared/llm/qwen-provider.ts
import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LlmProvider, DraftRequest } from "./provider";

export const qwenProvider = (apiKey: string): LlmProvider => {
  const qwen = createOpenAICompatible({
    name: "qwen",
    apiKey,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
  return {
    name: "qwen3-max",
    async *streamDraft(req: DraftRequest) {
      const r = streamText({
        model: qwen("qwen3-max"),
        messages: req.messages,
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 1000,
        abortSignal: req.signal,
      });
      for await (const chunk of r.textStream) yield chunk;
    },
  };
};
```

```ts
// shared/llm/claude-provider.ts
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LlmProvider, DraftRequest } from "./provider";

export const claudeProvider = (): LlmProvider => ({
  name: "claude-sonnet-4-5",
  async *streamDraft(req: DraftRequest) {
    const r = streamText({
      model: anthropic("claude-sonnet-4-5"),
      messages: req.messages,
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxOutputTokens ?? 1000,
      abortSignal: req.signal,
    });
    for await (const chunk of r.textStream) yield chunk;
  },
});
```

Pick at the edge:

```ts
// server.ts
import { qwenProvider } from "./shared/llm/qwen-provider";
import { claudeProvider } from "./shared/llm/claude-provider";

const provider =
  process.env.LLM_PROVIDER === "claude"
    ? claudeProvider()
    : qwenProvider(process.env.QWEN_API_KEY!);

// every other call site uses `provider.streamDraft(...)` and never knows the difference
```

The migration when it happens is: `pnpm add @ai-sdk/anthropic`, set `LLM_PROVIDER=claude` and `ANTHROPIC_API_KEY=...` in env. No surface-level code changes elsewhere. Verify the prompt still gives you the register you want — Claude's formal English needs slightly less anti-bullet-list nagging than Qwen's, so you may end up trimming the system prompt rather than rewriting it.

---

## Sources

- [Alibaba Cloud Model Studio — Model Pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [Alibaba Cloud Model Studio — Supported Models](https://www.alibabacloud.com/help/en/model-studio/models)
- [Alibaba Cloud Model Studio — OpenAI-Compatible API](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)
- [Alibaba Cloud Model Studio — Streaming Output](https://www.alibabacloud.com/help/en/model-studio/stream)
- [Alibaba Cloud Model Studio — Rate Limits](https://www.alibabacloud.com/help/en/model-studio/rate-limit)
- [Vercel AI SDK — OpenAI Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Vercel AI SDK — Community Qwen provider](https://ai-sdk.dev/providers/community-providers/qwen)
- [qwen-ai-provider on GitHub](https://github.com/Younis-Ahmed/qwen-ai-provider)
- Existing working integration: `/Users/augustusedem/Code/meridian/apps/api/src/ai/models.ts`
