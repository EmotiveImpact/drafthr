import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";

/**
 * Regression for stripMark (comment deletion / resolution).
 *
 * CommentMark has `excludes: ""`, so two comments over overlapping/nested
 * ranges render as nested <mark> elements. The old regex unwrap stopped at the
 * FIRST </mark> and mis-paired the tags, so deleting the OUTER comment dragged
 * trailing text into the surviving inner comment's highlight. The DOM-based
 * unwrap must pair tags correctly and leave the inner anchor intact.
 */
describe("deleteComment / stripMark — nested comment marks", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("unwraps only the targeted comment without expanding a nested one", async () => {
    const { useDraftStore } = await import("./store");
    // Outer comment A wraps "foo bar baz"; inner comment B wraps only "bar".
    const html =
      '<p><mark data-comment-id="A">foo ' +
      '<mark data-comment-id="B">bar</mark> baz</mark></p>';
    useDraftStore.setState({
      drafts: {
        draft_1: makeDraft(html, [
          { id: "A", sectionId: "section_1" },
          { id: "B", sectionId: "section_1" },
        ]),
      },
      matters: {},
    });

    useDraftStore.getState().deleteComment("draft_1", "A");

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    // A's wrapper is gone; B still wraps EXACTLY "bar" (not "bar baz"), and the
    // trailing " baz" stays outside any highlight.
    expect(sec.html).not.toContain('data-comment-id="A"');
    expect(sec.html).toContain('<mark data-comment-id="B">bar</mark>');
    expect(sec.html).not.toContain("bar baz</mark>");
    expect(sec.html).toContain("baz");
  });

  it("is a no-op (no reserialize) when the comment id isn't present", async () => {
    const { useDraftStore } = await import("./store");
    const html = '<p><mark data-comment-id="B">bar</mark></p>';
    useDraftStore.setState({
      drafts: { draft_1: makeDraft(html, [{ id: "B", sectionId: "section_1" }]) },
      matters: {},
    });

    useDraftStore.getState().deleteComment("draft_1", "does-not-exist");

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.html).toBe(html);
  });
});

function makeDraft(html: string, comments: { id: string; sectionId: string }[]): Draft {
  return {
    id: "draft_1",
    mode: "employer",
    letterType: "offer",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      ukRegion: "England & Wales",
      workerClass: "employee",
      letterType: "offer",
      effectiveDate: "2026-05-13",
      issueDate: "2026-05-13",
      deliveryMethod: "email",
      tone: "neutral",
      confidentiality: "confidential",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "1 Road",
      hasLetterhead: false,
      signatoryName: "HR",
      signatoryTitle: "People",
    },
    employee: {
      legalName: "Jane Doe",
      jobTitle: "Analyst",
      address: "2 Street",
      startDate: "2025-01-01",
      serviceMonths: 12,
    },
    answers: {},
    sections: [
      {
        id: "section_1",
        sectionId: "body",
        title: "Body",
        html,
        required: true,
        versions: [],
        status: "ready",
      },
    ],
    comments: comments.map((c) => ({
      id: c.id,
      sectionId: c.sectionId,
      authorName: "HR",
      body: "note",
      quote: "",
      createdAt: 1_000,
      resolved: false,
    })),
    createdAt: 1_000,
    updatedAt: 1_000,
  } as unknown as Draft;
}

function installMemoryLocalStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}
