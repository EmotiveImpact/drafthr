import { describe, expect, it } from "vitest";
import { anthropicBaseURL, toGatewayModelId } from "./anthropic-provider";

describe("anthropic provider", () => {
  it("defaults to Anthropic directly", () => {
    expect(anthropicBaseURL({} as NodeJS.ProcessEnv)).toBe("https://api.anthropic.com/v1");
  });

  it("uses ANTHROPIC_BASE_URL when set", () => {
    expect(
      anthropicBaseURL({ ANTHROPIC_BASE_URL: " https://ai-gateway.vercel.sh/v1 " } as NodeJS.ProcessEnv),
    ).toBe("https://ai-gateway.vercel.sh/v1");
  });

  it("maps model ids to gateway form", () => {
    expect(toGatewayModelId("claude-sonnet-4-6")).toBe("anthropic/claude-sonnet-4.6");
    expect(toGatewayModelId("claude-opus-4-8")).toBe("anthropic/claude-opus-4.8");
    expect(toGatewayModelId("claude-haiku-4-5")).toBe("anthropic/claude-haiku-4.5");
    expect(toGatewayModelId("anthropic/claude-opus-5")).toBe("anthropic/claude-opus-5");
  });
});
