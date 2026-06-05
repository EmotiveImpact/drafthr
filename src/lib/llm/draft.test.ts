import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Draft, Section } from "@/lib/letters/types";

// Mock the streaming client so we can force success / failure without network.
const { streamDraftMock } = vi.hoisted(() => ({ streamDraftMock: vi.fn() }));
vi.mock("./client", () => ({ streamDraft: streamDraftMock }));
// Prompt builders + profile read are irrelevant to this test's assertions.
vi.mock("@/lib/prompts/system", () => ({ buildSystemPrompt: () => "sys" }));
vi.mock("@/lib/prompts/sections", () => ({ buildSectionPrompt: () => "user" }));

import { regenerateSectionAsPending } from "./draft";

function makeSection(html: string): Section {
  return {
    id: "section_1",
    sectionId: "intro",
    title: "Intro",
    html,
    required: true,
    status: "ready",
    versions: [],
  } as unknown as Section;
}

function makeDraft(section: Section): Draft {
  return { id: "draft_1", sections: [section] } as unknown as Draft;
}

function makeStore() {
  return {
    appendToSection: vi.fn(),
    setSectionStatus: vi.fn(),
    pushSectionVersion: vi.fn(),
    updateSection: vi.fn(),
    proposeSectionChange: vi.fn(),
  };
}

describe("regenerateSectionAsPending — status never stranded on 'streaming'", () => {
  beforeEach(() => {
    streamDraftMock.mockReset();
  });

  it("resets status to 'edited' (had content) when the AI stream throws", async () => {
    streamDraftMock.mockRejectedValue(new Error("network down"));
    const store = makeStore();
    const section = makeSection("<p>existing</p>");

    await expect(
      regenerateSectionAsPending(makeDraft(section), section, store, new AbortController().signal),
    ).rejects.toThrow("network down");

    // It flips to "streaming" first, then MUST reset — last call wins.
    const statuses = store.setSectionStatus.mock.calls.map((c) => c[2]);
    expect(statuses).toContain("streaming");
    expect(statuses[statuses.length - 1]).toBe("edited");
    // No pending change proposed on failure.
    expect(store.proposeSectionChange).not.toHaveBeenCalled();
  });

  it("resets status to 'empty' when an empty section's AI stream throws", async () => {
    streamDraftMock.mockRejectedValue(new Error("boom"));
    const store = makeStore();
    const section = makeSection("");

    await expect(
      regenerateSectionAsPending(makeDraft(section), section, store, new AbortController().signal),
    ).rejects.toThrow("boom");

    const statuses = store.setSectionStatus.mock.calls.map((c) => c[2]);
    expect(statuses[statuses.length - 1]).toBe("empty");
  });

  it("on success resets status and proposes the change (no stuck streaming)", async () => {
    streamDraftMock.mockImplementation(async (opts: { onToken: (d: string) => void }) => {
      opts.onToken("<p>new text</p>");
    });
    const store = makeStore();
    const section = makeSection("<p>existing</p>");

    await regenerateSectionAsPending(makeDraft(section), section, store, new AbortController().signal);

    const statuses = store.setSectionStatus.mock.calls.map((c) => c[2]);
    expect(statuses[statuses.length - 1]).toBe("edited");
    expect(store.proposeSectionChange).toHaveBeenCalledTimes(1);
  });
});
