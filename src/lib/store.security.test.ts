import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";

describe("draft store security", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("sanitizes pending AI HTML when a single proposal is accepted", async () => {
    const { useDraftStore } = await import("./store");

    useDraftStore.setState({
      drafts: {
        draft_1: draftWithPending(
          '<p>Safe</p><script>alert(1)</script><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" /><a href="https://example.com" target="_blank">link</a>'
        ),
      },
      matters: {},
    });

    useDraftStore.getState().acceptSectionPending("draft_1", "section_1");

    const html = useDraftStore.getState().drafts.draft_1.sections[0].html;
    expect(html).toContain("<p>Safe</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

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
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function draftWithPending(proposedHtml: string): Draft {
  const now = Date.now();
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
        html: "<p>Original</p>",
        required: true,
        versions: [],
        status: "ready",
        pendingChange: {
          id: "change_1",
          createdAt: now,
          proposedHtml,
          instruction: "test",
          source: "manual",
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
