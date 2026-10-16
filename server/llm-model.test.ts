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

describe("temperatureFor", () => {
  it("keeps the temperature for models that still accept sampling", async () => {
    const { temperatureFor } = await import("./llm-model");
    expect(temperatureFor("claude-sonnet-4-6", 0.3)).toBe(0.3);
    expect(temperatureFor("claude-haiku-4-5", 0.7)).toBe(0.7);
  });
  it("drops it for Opus 4.7 and later, which reject sampling parameters", async () => {
    const { temperatureFor } = await import("./llm-model");
    for (const m of ["claude-opus-4-7", "claude-opus-4-8", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]) {
      expect(temperatureFor(m, 0.4)).toBeUndefined();
    }
  });
});
