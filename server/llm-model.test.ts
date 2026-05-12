import { describe, expect, it } from "vitest";
import { resolveModelName } from "./llm-model";

describe("resolveModelName", () => {
  it("uses an allow-listed requested model before env defaults", () => {
    expect(
      resolveModelName("meta/llama-3.3-70b-instruct", {
        env: { LLM_MODEL: "claude-sonnet-4-6", NVIDIA_API_KEY: "nv-key" },
      })
    ).toBe("meta/llama-3.3-70b-instruct");
  });

  it("ignores unrecognised requested models", () => {
    expect(
      resolveModelName("made-up-model", {
        env: { LLM_MODEL: "moonshotai/kimi-k2.6", NVIDIA_API_KEY: "nv-key" },
      })
    ).toBe("moonshotai/kimi-k2.6");
  });

  it("honours LLM_PROVIDER=claude when no model is specified", () => {
    expect(
      resolveModelName(undefined, {
        env: { LLM_PROVIDER: "claude", ANTHROPIC_API_KEY: "anthropic-key" },
      })
    ).toBe("claude-sonnet-4-6");
  });

  it("defaults to Kimi K2.6 when no provider or model is specified", () => {
    expect(resolveModelName(undefined, { env: {} })).toBe("moonshotai/kimi-k2.6");
  });
});
