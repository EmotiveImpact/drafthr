import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft, PendingChange } from "./letters/types";

/**
 * Regression tests for proposeSectionChange:
 *   #2 — inline diff flattens non-text content (img/table/link/figure-ref) and
 *        Accept makes the loss permanent → must fall back to CARD mode so the
 *        proposal is applied verbatim.
 *   #5 — a second proposal over an unresolved pending inline change must diff
 *        against the CLEAN canonical text and preserve the original prevHtml,
 *        not the already-marked-up html.
 */
describe("proposeSectionChange", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("#2: falls back to card mode when the section contains an image (no flattening)", async () => {
    const { useDraftStore } = await import("./store");
    const img =
      '<p>See:</p><img src="data:image/png;base64,iVBORw0KGgo=" /><p>Per <span class="figure-ref" data-fig-id="e1">[See Fig 1]</span>.</p>';
    useDraftStore.setState({ drafts: { draft_1: baseDraft(img) }, matters: {} });

    useDraftStore.getState().proposeSectionChange("draft_1", "section_1", change("<p>Rewritten.</p>"));

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    // Card mode: section.html stays the clean original (image + figure-ref intact),
    // proposal lives in pendingChange. Accept will swap in proposedHtml verbatim.
    expect(sec.pendingChange?.diffViewMode).toBe("card");
    expect(sec.html).toContain("<img");
    expect(sec.html).toContain('data-fig-id="e1"');
    expect(sec.html).not.toContain("<ins");
  });

  it("#2: also falls back to card mode when the PROPOSAL adds a table", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { draft_1: baseDraft("<p>plain</p>") }, matters: {} });

    useDraftStore
      .getState()
      .proposeSectionChange("draft_1", "section_1", change("<table><tr><td>x</td></tr></table>"));

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.pendingChange?.diffViewMode).toBe("card");
  });

  it("#2: plain-text section still uses inline diff (no regression)", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { draft_1: baseDraft("<p>Old plain text.</p>") }, matters: {} });

    useDraftStore.getState().proposeSectionChange("draft_1", "section_1", change("<p>New plain text.</p>"));

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.pendingChange?.diffViewMode).toBe("inline");
    // Inline diff stages suggestion marks (class-based after sanitisation).
    expect(sec.html).toContain("ds-suggestion");
    expect(sec.pendingChange?.prevHtml).toBe("<p>Old plain text.</p>");
  });

  it("#5: a second inline proposal preserves the CLEAN prevHtml (not the marked-up html)", async () => {
    const { useDraftStore } = await import("./store");
    const clean = "<p>Original sentence.</p>";
    useDraftStore.setState({ drafts: { draft_1: baseDraft(clean) }, matters: {} });
    const store = useDraftStore.getState();

    // First proposal → inline, prevHtml = clean original, html now has marks.
    store.proposeSectionChange("draft_1", "section_1", change("<p>First revision.</p>"));
    const afterFirst = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(afterFirst.html).toContain("ds-suggestion");
    expect(afterFirst.pendingChange?.prevHtml).toBe(clean);
    // Sanity: html now carries marks, so it is NOT the clean text.
    expect(afterFirst.html).not.toBe(clean);

    // Second proposal WITHOUT resolving the first.
    store.proposeSectionChange("draft_1", "section_1", change("<p>Second revision.</p>"));
    const afterSecond = useDraftStore.getState().drafts.draft_1.sections[0];

    // prevHtml must still be the clean original — so a reject restores clean text,
    // and the diff was computed against clean text (no stale <ins>/<del> baked in).
    expect(afterSecond.pendingChange?.prevHtml).toBe(clean);
    // And the diff base was the clean text: the staged html must not contain a
    // nested/double-marked artifact (no <ins> inside <del> or vice-versa).
    expect(afterSecond.html).not.toMatch(/<(ins|del)[^>]*>[^<]*<(ins|del)/i);
  });
  it("refuses to stage a plain-text proposal that is textually identical (no marks → no flattening)", async () => {
    const { useDraftStore } = await import("./store");
    const plain = "<p>Same plain text.</p>";
    useDraftStore.setState({ drafts: { draft_1: baseDraft(plain) }, matters: {} });

    useDraftStore.getState().proposeSectionChange("draft_1", "section_1", change("<p>Same plain text.</p>"));

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.pendingChange).toBeUndefined();
    expect(sec.html).toBe(plain);
  });

  it("routes formatted sections to card mode so the inline rebuild can't flatten them", async () => {
    const { useDraftStore } = await import("./store");
    const rich = "<p>Same <strong>rich</strong> text.</p>";
    useDraftStore.setState({ drafts: { draft_1: baseDraft(rich) }, matters: {} });

    // Textually identical proposal (formatting differs, words don't) — the
    // word diff yields no marks; staging it anyway would silently replace the
    // section with a flattened-plain rebuild and leave a phantom card.
    useDraftStore.getState().proposeSectionChange("draft_1", "section_1", change("<p>Same rich text.</p>"));

    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.pendingChange?.diffViewMode).toBe("card");
    expect(sec.html).toBe(rich); // untouched: <strong> intact
  });

  it("accept folds the inline diff in regardless of mark attribute order", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { draft_1: baseDraft("<p>Pay is 100.</p>") }, matters: {} });
    const store = useDraftStore.getState();
    store.proposeSectionChange("draft_1", "section_1", change("<p>Pay is 200.</p>"));

    // Simulate a round-trip (pagedly serializer) REORDERING attributes so
    // data-status precedes data-suggestion-id — the old regex flip required
    // the opposite order and silently degraded accept to a discard.
    const staged = useDraftStore.getState().drafts.draft_1.sections[0].html;
    const reordered = staged.replace(
      /<(ins|del)([^>]*?)\sdata-suggestion-id="([^"]+)"([^>]*?)\sdata-status="pending"/g,
      '<$1 data-status="pending"$2 data-suggestion-id="$3"$4',
    );
    useDraftStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        draft_1: {
          ...s.drafts.draft_1,
          sections: s.drafts.draft_1.sections.map((sec) => ({ ...sec, html: reordered })),
        },
      },
    }));

    useDraftStore.getState().acceptSectionPending("draft_1", "section_1");
    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.html).toContain("200");
    expect(sec.html).not.toContain("100");
    expect(sec.html).not.toContain("data-suggestion-id");
    expect(sec.pendingChange).toBeUndefined();
  });

  it("reject preserves author edits made AROUND the pending marks", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState(
      { drafts: { draft_1: baseDraft("<p>Salary is 100 per week.</p>") }, matters: {} },
    );
    const store = useDraftStore.getState();
    store.proposeSectionChange("draft_1", "section_1", change("<p>Salary is 200 per week.</p>"));

    // The author edits prose AROUND the pending marks on the review page
    // (pagedly persists the whole marked section in review mode).
    const staged = useDraftStore.getState().drafts.draft_1.sections[0].html;
    const edited = staged.replace("per week", "per calendar week");
    expect(edited).not.toBe(staged);
    useDraftStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        draft_1: {
          ...s.drafts.draft_1,
          sections: s.drafts.draft_1.sections.map((sec) => ({ ...sec, html: edited })),
        },
      },
    }));

    useDraftStore.getState().rejectSectionPending("draft_1", "section_1");
    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    // Rejected: the suggested "200" is gone, the original "100" restored…
    expect(sec.html).toContain("100");
    expect(sec.html).not.toContain("200");
    // …and the author's own edit SURVIVES (a wholesale prevHtml restore
    // would have destroyed it).
    expect(sec.html).toContain("per calendar week");
    expect(sec.html).not.toContain("data-suggestion-id");
  });
});

function change(proposedHtml: string): PendingChange {
  return {
    id: `change_${Math.floor(performance.now())}`,
    createdAt: 1_000,
    proposedHtml,
    instruction: "test",
    source: "manual",
  };
}

function baseDraft(html: string): Draft {
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

describe("reject restores the original formatting", () => {
  it("returns the clean snapshot when nothing was edited around the marks", async () => {
    const { useDraftStore } = await import("./store");
    const original = "<p>Pay is 100.</p>";
    useDraftStore.setState({ drafts: { draft_1: baseDraft(original) }, matters: {} });
    useDraftStore.getState().proposeSectionChange("draft_1", "section_1", change("<p>Pay is 200.</p>"));
    useDraftStore.getState().rejectSectionPending("draft_1", "section_1");
    const sec = useDraftStore.getState().drafts.draft_1.sections[0];
    expect(sec.html).toBe(original);
    expect(sec.pendingChange).toBeUndefined();
  });
});
