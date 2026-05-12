import { describe, expect, it } from "vitest";
import { resolveModelName } from "./llm-model";

describe("resolveModelName", () => {
  it("uses an allow-listed requested model before env defaults", () => {
    expect(
      resolveModelName("qwen/qwen3-next-80b-a3b-instruct:free", {
        env: { LLM_MODEL: "claude-sonnet-4-6", OPENROUTER_API_KEY: "or-key" },
      })
    ).toBe("qwen/qwen3-next-80b-a3b-instruct:free");
  });

  it("ignores unrecognised requested models", () => {
    expect(
      resolveModelName("made-up-model", {
        env: { LLM_MODEL: "openai/gpt-oss-20b:free", OPENROUTER_API_KEY: "or-key" },
      })
    ).toBe("openai/gpt-oss-20b:free");
  });

  it("honours LLM_PROVIDER=claude when no model is specified", () => {
    expect(
      resolveModelName(undefined, {
        env: { LLM_PROVIDER: "claude", ANTHROPIC_API_KEY: "anthropic-key" },
      })
    ).toBe("claude-sonnet-4-6");
  });

  it("defaults to GPT-OSS 120B when no provider or model is specified", () => {
    expect(resolveModelName(undefined, { env: {} })).toBe("openai/gpt-oss-120b:free");
  });
});
