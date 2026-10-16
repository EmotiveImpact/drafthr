import { describe, expect, it } from "vitest";
import { DefaultChatTransport, convertToModelMessages, type UIMessage } from "ai";
import {
  AGENT_UNREACHABLE_MESSAGE,
  LETTER_CONTEXT_MAX_CHARS,
  agentErrorMessage,
  buildAgentSystemPrompt,
  buildLetterContextMessage,
  draftPlainTextForAgent,
} from "./agent";
import type { Draft } from "@/lib/letters/types";

function draftWith(sections: Array<{ id: string; title: string; html: string }>): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: { jurisdiction: "UK", mode: "employer", letterType: "warning" },
    employer: { legalName: "Acme Ltd" },
    employee: { legalName: "Jamie Worker" },
    answers: {},
    sections: sections.map((s) => ({ ...s, sectionId: "body", required: true, status: "ready", versions: [] })),
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Draft;
}

describe("letter context for the AI side panel", () => {
  const draft = draftWith([
    { id: "s1", title: "Opening", html: "<p>Dear Jamie,</p>" },
    {
      id: "s2",
      title: "Allegation",
      html: '<p>On 3 March you were <strong>late</strong> &amp; absent.</p><ul><li>First</li><li>Second</li></ul><p>Keep <ins data-suggestion-id="x" data-status="pending">pending words</ins>this.</p>',
    },
  ]);

  it("turns every section into plain text with its title and id, without pending suggestions", () => {
    const { text, truncated } = draftPlainTextForAgent(draft);
    expect(truncated).toBe(false);
    expect(text).toContain('## Opening (section_id="s1")\nDear Jamie,');
    expect(text).toContain("On 3 March you were late & absent.");
    expect(text).toContain("- First");
    expect(text).not.toContain("<");
    expect(text).not.toContain("pending words");
  });

  it("caps the text and says it was truncated", () => {
    const long = draftWith([{ id: "s1", title: "Body", html: `<p>${"word ".repeat(20_000)}</p>` }]);
    const { text, truncated, totalChars } = draftPlainTextForAgent(long);
    expect(truncated).toBe(true);
    expect(totalChars).toBeGreaterThan(LETTER_CONTEXT_MAX_CHARS);
    expect(text.length).toBeLessThan(LETTER_CONTEXT_MAX_CHARS + 400);
    expect(text).toMatch(/Letter text truncated: showing the first 60,000 of [\d,]+ characters/);
  });

  it("is a user-role message the agent endpoint accepts (no system role)", async () => {
    const msg = buildLetterContextMessage(draft);
    expect(msg.role).toBe("user");
    const userTurn: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Summarise for counsel" }] };
    const model = await convertToModelMessages([msg, userTurn]);
    expect(model.some((m) => m.role === "system")).toBe(false);
    expect(JSON.stringify(model)).toContain("On 3 March you were late");
    // Well inside the endpoint's 200k-character conversation cap.
    expect(JSON.stringify(model).length).toBeLessThan(200_000);
  });

  it("the worst case still fits the endpoint's conversation cap with room for the chat", async () => {
    const huge = draftWith([{ id: "s1", title: "Body", html: `<p>${'"quoted" text\n'.repeat(20_000)}</p>` }]);
    const model = await convertToModelMessages([buildLetterContextMessage(huge)]);
    expect(JSON.stringify(model).length).toBeLessThan(80_000);
  });

  it("the system prompt tells the agent to work from the letter text", () => {
    const prompt = buildAgentSystemPrompt(draft);
    expect(prompt).toContain("LETTER CONTEXT");
    expect(prompt).toMatch(/Never invent content/);
  });
});

describe("agent error message in the side panel", () => {
  async function transportError(status: number, body: string): Promise<unknown> {
    const transport = new DefaultChatTransport({
      api: "/api/agent",
      fetch: async () => new Response(body, { status, headers: { "Content-Type": "application/json" } }),
    });
    try {
      await transport.sendMessages({
        trigger: "submit-message",
        chatId: "c1",
        messageId: undefined,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }],
        abortSignal: undefined,
      });
    } catch (err) {
      return err;
    }
    throw new Error("expected the transport to reject");
  }

  it("shows the endpoint's reason (plan gate, conversation cap) instead of a connection error", async () => {
    const tooLong = await transportError(413, JSON.stringify({ error: "This conversation is too long. Start a new chat." }));
    expect(agentErrorMessage(tooLong)).toBe("This conversation is too long. Start a new chat.");
    const plan = await transportError(402, JSON.stringify({ error: "Choose a plan or buy a letter to keep drafting.", needPlan: true }));
    expect(agentErrorMessage(plan)).toBe("Choose a plan or buy a letter to keep drafting.");
  });

  it("falls back to the connection message for anything else", () => {
    expect(agentErrorMessage(new TypeError("Failed to fetch"))).toBe(AGENT_UNREACHABLE_MESSAGE);
    expect(agentErrorMessage(new Error("null"))).toBe(AGENT_UNREACHABLE_MESSAGE);
    expect(agentErrorMessage(undefined)).toBe(AGENT_UNREACHABLE_MESSAGE);
  });
});
