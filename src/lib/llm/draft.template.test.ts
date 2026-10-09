import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";

const { streamDraftMock, loadTemplateMock } = vi.hoisted(() => ({
  streamDraftMock: vi.fn(async () => {}),
  loadTemplateMock: vi.fn(),
}));
vi.mock("./client", () => ({ streamDraft: streamDraftMock }));
vi.mock("@/lib/letters/templates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/letters/templates")>()),
  loadTemplate: loadTemplateMock,
}));

import { generateAllSections, TEMPLATE_LOAD_FAILED_MESSAGE } from "./draft";

function makeDraft(): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: { jurisdiction: "UK" },
    employer: {},
    employee: {},
    answers: {},
    sections: [{ id: "s1", sectionId: "opening", title: "Opening", html: "", required: true, status: "empty", versions: [] }],
  } as unknown as Draft;
}

function makeStore() {
  return { appendToSection: vi.fn(), setSectionStatus: vi.fn(), pushSectionVersion: vi.fn(), updateSection: vi.fn() };
}

describe("drafting with a lazily loaded template", () => {
  beforeEach(() => {
    streamDraftMock.mockClear();
    loadTemplateMock.mockReset();
  });

  it("stops with a clear error, before any AI call, when the template chunk fails to load", async () => {
    loadTemplateMock.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    const store = makeStore();
    await expect(generateAllSections(makeDraft(), store, new AbortController().signal)).rejects.toThrow(
      TEMPLATE_LOAD_FAILED_MESSAGE,
    );
    expect(streamDraftMock).not.toHaveBeenCalled();
    expect(store.updateSection).not.toHaveBeenCalled();
  });

  it("drafts with the generic instructions when the letter type has no template", async () => {
    loadTemplateMock.mockResolvedValue(undefined);
    await generateAllSections(makeDraft(), makeStore(), new AbortController().signal);
    expect(streamDraftMock).toHaveBeenCalledTimes(1);
  });
});
