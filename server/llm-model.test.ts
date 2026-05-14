import { describe, expect, it } from "vitest";
import { requireAnthropicApiKey, resolveModelName } from "./llm-model";

describe("resolveModelName", () => {
  it("uses an allow-listed requested model", () => {
    expect(
      resolveModelName("claude-haiku-4-5", {
        env: { ANTHROPIC_API_KEY: "anthropic-key" },
      })
    ).toBe("claude-haiku-4-5");
  });

  it("ignores unrecognised requested models", () => {
    expect(
      resolveModelName("made-up-model", {
        env: { LLM_MODEL: "claude-opus-4-7", ANTHROPIC_API_KEY: "anthropic-key" },
      })
    ).toBe("claude-opus-4-7");
  });

  it("defaults to Sonnet when no model is specified", () => {
    expect(resolveModelName(undefined, { env: {} })).toBe("claude-sonnet-4-6");
  });

  it("requires a server-side Anthropic key", () => {
    expect(() => requireAnthropicApiKey({})).toThrow("ANTHROPIC_API_KEY");
    expect(requireAnthropicApiKey({ ANTHROPIC_API_KEY: " anthropic-key " })).toBe(
      "anthropic-key"
    );
  });
});
