import { describe, expect, it } from "vitest";
import { resolveModelName } from "./llm-model";

describe("resolveModelName", () => {
  it("uses an allow-listed requested model before env defaults", () => {
    expect(
      resolveModelName("qwen-plus", {
        env: {
          LLM_MODEL: "claude-sonnet-4-6",
          QWEN_API_KEY: "qwen-key",
        },
      })
    ).toBe("qwen-plus");
  });

  it("ignores unrecognised requested models", () => {
    expect(
      resolveModelName("made-up-model", {
        env: {
          LLM_MODEL: "qwen-max",
          QWEN_API_KEY: "qwen-key",
        },
      })
    ).toBe("qwen-max");
  });

  it("falls from Claude to Qwen when only Qwen is configured", () => {
    expect(
      resolveModelName("claude-sonnet-4-6", {
        env: {
          QWEN_API_KEY: "qwen-key",
        },
      })
    ).toBe("qwen3-max");
  });

  it("falls from Qwen to Claude when only Anthropic is configured", () => {
    expect(
      resolveModelName("qwen3-max", {
        env: {
          ANTHROPIC_API_KEY: "anthropic-key",
        },
      })
    ).toBe("claude-sonnet-4-6");
  });

  it("honours LLM_PROVIDER=claude when no model is specified", () => {
    expect(
      resolveModelName(undefined, {
        env: {
          LLM_PROVIDER: "claude",
          ANTHROPIC_API_KEY: "anthropic-key",
          QWEN_API_KEY: "qwen-key",
        },
      })
    ).toBe("claude-sonnet-4-6");
  });
});
