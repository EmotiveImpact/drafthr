import { useState, type MutableRefObject } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft, Section } from "@/lib/letters/types";

import {
  PagedEditor,
  type PagedEditorActions,
  __pagedEditorInternals as editor,
} from "./PagedEditor";

const storeMock = vi.hoisted(() => {
  const mock: {
    currentDraft: Draft | null;
    applyUpdate?: (draftId: string, sectionId: string, html: string) => void;
    updateSection: ReturnType<typeof vi.fn>;
  } = {
    currentDraft: null,
    updateSection: vi.fn((draftId: string, sectionId: string, html: string) => {
      mock.applyUpdate?.(draftId, sectionId, html);
    }),
  };
  return mock;
});

vi.mock("@/lib/store", () => ({
  useDraftStore: (selector: (state: { updateSection: typeof storeMock.updateSection }) => unknown) =>
    selector({ updateSection: storeMock.updateSection }),
}));

vi.mock("pagedjs", () => ({
  Previewer: class {
    chunker = { stop: () => undefined, destroy: () => undefined };
    polisher = { destroy: () => undefined };

    async preview(content: string, _stylesheets: Array<string | Record<string, string>>, renderTo: HTMLElement) {
      const doc = new DOMParser().parseFromString(`<div>${content}</div>`, "text/html");
      const bodyHtml = doc.querySelector(".letter-body")?.innerHTML ?? "";
      renderTo.innerHTML = `
        <div class="pagedjs_pages">
          <div class="pagedjs_page">
            <div class="pagedjs_page_content">
              <div class="letter-body">${bodyHtml}</div>
            </div>
          </div>
        </div>
      `;
      return { total: 1 };
    }
  },
}));

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  if (!globalThis.CSS) {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value.replace(/"/g, '\\"') },
    });
  } else if (!globalThis.CSS.escape) {
    Object.defineProperty(globalThis.CSS, "escape", {
      configurable: true,
      value: (value: string) => value.replace(/"/g, '\\"'),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  storeMock.currentDraft = null;
  storeMock.applyUpdate = undefined;
  storeMock.updateSection.mockClear();
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("PagedEditor source reconstruction", () => {
  it("merges paged.js split clones and strips generated artifacts", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="pagedjs_page_content">
        <div class="letter-body">
          <div data-section-anchor data-section-id="sec-a"></div>
          <p data-paged-ref="0">Alpha <span class="pagedjs_hyphen">pre\u2011</span></p>
        </div>
      </div>
      <div class="pagedjs_page_content">
        <div class="letter-body">
          <p data-paged-ref="0">fix<br><img src="https://example.test/x.png" data-ref="paged" /></p>
          <p data-paged-ref="1" data-id="paged-id">Next</p>
        </div>
      </div>
    `;

    const html = editor.reconstructSourceHtml(container);

    expect(html).toContain('data-section-id="sec-a"');
    expect(html).toContain("pre</span>fix<br>");
    expect(html).toContain('<img src="https://example.test/x.png">');
    expect(html).toContain("<p>Next</p>");
    expect(html).not.toContain("pagedjs_");
    expect(html).not.toContain("data-paged-ref");
    expect(html).not.toContain("data-ref");
    expect(html).not.toContain("\u2011");
  });

  it("restores missing section anchors from the previous source instead of blanking sections", () => {
    const draft = makeDraft([
      makeSection("sec-a", "opening", "<p>Old A</p>"),
      makeSection("sec-b", "body", "<p>Old B</p>"),
    ]);
    const fallback = `
      <div data-section-anchor data-section-id="sec-a"></div><p>Old A</p>
      <div data-section-anchor data-section-id="sec-b"></div><p>Old B</p>
    `;
    const sourceAfterUserDeletedFirstAnchor = `
      <p>Changed A</p>
      <div data-section-anchor data-section-id="sec-b"></div><p>Changed B</p>
    `;

    const normalized = editor.normalizeSourceHtml(
      sourceAfterUserDeletedFirstAnchor,
      draft,
      fallback,
    );
    const splits = editor.splitBySection(normalized, "sec-a");

    expect(splits["sec-a"]).toContain("Changed A");
    expect(splits["sec-b"]).toContain("Changed B");
    expect(normalized.match(/data-section-anchor/g)).toHaveLength(2);
  });

  it("reconstructs section anchors from rendered block section ids", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="pagedjs_page_content">
        <div class="letter-body">
          <p data-section-id="sec-a" data-paged-ref="0">Alpha</p>
          <p data-section-id="sec-b" data-paged-ref="1">Beta</p>
        </div>
      </div>
    `;

    const html = editor.reconstructSourceHtml(container);
    const splits = editor.splitBySection(html);

    expect(splits["sec-a"]).toBe("<p>Alpha</p>");
    expect(splits["sec-b"]).toBe("<p>Beta</p>");
    expect(html).not.toContain("<p data-section-id");
  });

  it("preserves loose top-level text and inline nodes when saving", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="pagedjs_page_content">
        <div class="letter-body">
          <div data-section-anchor data-section-id="sec-a"></div>
          Loose <strong>inline</strong><br>tail
          <p data-paged-ref="1">Next paragraph</p>
        </div>
      </div>
    `;

    const html = editor.reconstructSourceHtml(container);
    const splits = editor.splitBySection(html);

    expect(splits["sec-a"]).toContain("<p>Loose <strong>inline</strong><br>tail</p>");
    expect(splits["sec-a"]).toContain("<p>Next paragraph</p>");
  });

  it("reconstructs from a snapshot without mutating the selected live DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="pagedjs_page_content">
        <div class="letter-body">
          <div data-section-anchor data-section-id="sec-a"></div>
          <p>Selected text</p>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    const text = container.querySelector("p")?.firstChild;
    expect(text).toBeInstanceOf(Text);
    setCaret(text as Text, "Selected".length);
    const before = container.innerHTML;

    const html = editor.reconstructSourceHtml(container);

    expect(html).toContain("Selected text");
    expect(container.innerHTML).toBe(before);
    expect(window.getSelection()?.anchorNode).toBe(text);
    expect(window.getSelection()?.anchorOffset).toBe("Selected".length);
  });
});

describe("PagedEditor paste cleanup", () => {
  it("converts Word list paragraphs into real lists and scrubs Office chrome", () => {
    const html = `
      <html>
        <head><style>.MsoListParagraph { color: red; }</style><meta name="Generator" content="Word" /></head>
        <body>
          <!--StartFragment-->
          <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1. First item</p>
          <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">2. Second item</p>
          <p>Normal paragraph</p>
          <!--EndFragment-->
        </body>
      </html>
    `;

    const cleaned = editor.sanitizePastedHtml(html);

    expect(cleaned).toContain("<ol>");
    expect(cleaned).toContain("<li>First item</li>");
    expect(cleaned).toContain("<li>Second item</li>");
    expect(cleaned).toContain("<p>Normal paragraph</p>");
    expect(cleaned).not.toContain("MsoListParagraph");
    expect(cleaned).not.toContain("mso-list");
    expect(cleaned).not.toContain("<style");
    expect(cleaned).not.toContain("StartFragment");
  });
});

describe("PagedEditor oversized content normalization", () => {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      const textLength = this.textContent?.length ?? 0;
      const rowCount = this.querySelectorAll?.("tr").length ?? 0;
      const height = Math.max(20, Math.ceil(textLength / 18) * 24, rowCount * 260);
      return {
        x: 0,
        y: 0,
        width: 582,
        height,
        top: 0,
        right: 582,
        bottom: height,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  it("splits a very tall rich paragraph without flattening inline formatting", () => {
    const words = Array.from({ length: 900 }, (_, index) => `word${index}`).join(" ");
    const html = `<p><strong>${words}</strong><br><img src="https://example.test/sig.png" alt="sig" /> <em>final words</em></p>`;

    const normalized = editor.normalizeOversizedSourceHtml(html);

    expect(normalized.match(/<p/g)?.length ?? 0).toBeGreaterThan(1);
    expect(normalized).toContain("<strong>");
    expect(normalized).toContain("<br>");
    expect(normalized).toContain('<img src="https://example.test/sig.png" alt="sig"');
    expect(normalized).toContain("<em>");
    expect(normalized).toContain("final words");
  });

  it("splits an oversized table row without flattening formatted cell content", () => {
    const words = Array.from({ length: 260 }, (_, index) => `cell${index}`).join(" ");
    const html = `
      <table>
        <tbody>
          <tr><td><strong>${words}</strong></td><td><em>${words}</em></td></tr>
        </tbody>
      </table>
    `;

    const normalized = editor.normalizeOversizedSourceHtml(html);

    expect(normalized.match(/<tr/g)?.length ?? 0).toBeGreaterThan(1);
    expect(normalized).toContain("<strong>");
    expect(normalized).toContain("<em>");
    expect(normalized).toContain("cell259");
  });
});

describe("PagedEditor cursor offsets", () => {
  it("captures and restores a caret inside the second clone of a split block", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="pagedjs_page_content">
        <div class="letter-body" contenteditable="true">
          <p data-paged-ref="0">Alpha </p>
        </div>
      </div>
      <div class="pagedjs_page_content">
        <div class="letter-body" contenteditable="true">
          <p data-paged-ref="0">Beta</p>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const secondText = container.querySelectorAll("[data-paged-ref='0']")[1].firstChild;
    expect(secondText).toBeInstanceOf(Text);

    const range = document.createRange();
    range.setStart(secondText as Text, 2);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const cursor = editor.captureCursor(container);
    expect(cursor?.start).toEqual({ ref: "0", offset: "Alpha ".length + 2 });

    editor.restoreCursor(container, cursor!);
    const restored = window.getSelection();
    expect(restored?.anchorNode).toBe(secondText);
    expect(restored?.anchorOffset).toBe(2);
  });
});

describe("PagedEditor undo and redo", () => {
  it("keeps undo and redo coherent after a dirty DOM re-pagination", async () => {
    const draft = makeDraft([makeSection("sec-a", "body", "<p>Original text</p>")]);

    render(<PagedEditorHarness draft={draft} />);
    expect(await screen.findByRole("textbox")).toBeTruthy();

    const body = document.querySelector<HTMLElement>(".letter-body");
    expect(body).not.toBeNull();
    const paragraph = body!.querySelector("p");
    expect(paragraph).not.toBeNull();
    paragraph!.textContent = "Original text changed";
    setCaret(paragraph!.firstChild as Text, "Original text changed".length);

    fireEvent.input(body!, { bubbles: true });

    await act(async () => {
      await sleep(650);
      await flushMicrotasks();
    });

    expect(storeMock.currentDraft?.sections[0].html).toContain("Original text changed");
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => {
      await flushMicrotasks();
    });

    expect(storeMock.currentDraft?.sections[0].html).toContain("Original text");
    expect(storeMock.currentDraft?.sections[0].html).not.toContain("changed");
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    await act(async () => {
      await flushMicrotasks();
    });

    expect(storeMock.currentDraft?.sections[0].html).toContain("Original text changed");
  });

  it("lets an external undo handler see dirty DOM before React republishes actions", async () => {
    const draft = makeDraft([makeSection("sec-a", "body", "<p>Original text</p>")]);
    const actionsRef: MutableRefObject<PagedEditorActions | null> = { current: null };

    render(<PagedEditorHarness draft={draft} actionsRef={actionsRef} />);
    expect(await screen.findByRole("textbox")).toBeTruthy();
    const staleUndo = actionsRef.current?.undo;
    expect(staleUndo).toBeTypeOf("function");

    const body = document.querySelector<HTMLElement>(".letter-body");
    const paragraph = body?.querySelector("p");
    expect(body).not.toBeNull();
    expect(paragraph).not.toBeNull();
    paragraph!.textContent = "Original text changed";
    setCaret(paragraph!.firstChild as Text, "Original text changed".length);

    fireEvent.input(body!, { bubbles: true });

    await act(async () => {
      staleUndo?.();
      await flushMicrotasks();
    });

    expect(storeMock.currentDraft?.sections[0].html).toContain("Original text");
    expect(storeMock.currentDraft?.sections[0].html).not.toContain("changed");
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("PagedEditor toolbar selection state", () => {
  it("keeps toolbar formatting selected during editor toolbar focus changes", async () => {
    const restoreQueries = mockCommandQueries({
      states: { bold: true },
      values: { formatBlock: "p" },
    });

    try {
      const draft = makeDraft([makeSection("sec-a", "body", "<p>Bold text</p>")]);
      render(<PagedEditorHarness draft={draft} />);
      const body = await screen.findByRole("textbox");
      const text = body.querySelector("p")?.firstChild;
      expect(text).toBeInstanceOf(Text);

      act(() => {
        setCaret(text as Text, "Bold".length);
        document.dispatchEvent(new Event("selectionchange"));
      });

      const boldButton = screen.getByRole("button", { name: "Bold" });
      await waitFor(() => expect(boldButton.getAttribute("aria-pressed")).toBe("true"));

      act(() => {
        boldButton.focus();
        window.getSelection()?.removeAllRanges();
        document.dispatchEvent(new Event("selectionchange"));
      });

      expect(boldButton.getAttribute("aria-pressed")).toBe("true");
    } finally {
      restoreQueries();
    }
  });

  it("keeps a selected range active across repeated alignment commands", async () => {
    const restoreExecCommand = mockExecCommandCollapsingAlignment();

    try {
      const draft = makeDraft([makeSection("sec-a", "body", "<p>Selected alignment text</p>")]);
      render(<PagedEditorHarness draft={draft} />);
      const body = await screen.findByRole("textbox");
      const text = body.querySelector("p")?.firstChild;
      expect(text).toBeInstanceOf(Text);

      setSelection(text as Text, 0, text as Text, "Selected alignment".length);
      expect(currentSelectionText()).toBe("Selected alignment");

      fireEvent.click(screen.getByRole("button", { name: "Align center" }));
      expect(currentSelectionText()).toBe("Selected alignment");

      fireEvent.click(screen.getByRole("button", { name: "Align right" }));
      expect(currentSelectionText()).toBe("Selected alignment");
    } finally {
      restoreExecCommand();
    }
  });
});

function makeDraft(sections: Section[]): Draft {
  return {
    id: "draft-test",
    mode: "employee",
    letterType: "grievance",
    context: {
      mode: "employee",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "grievance",
      effectiveDate: "2026-05-13",
      issueDate: "2026-05-13",
      deliveryMethod: "email",
      tone: "formal",
      employeeTone: "assertive",
      confidentiality: "private_and_confidential",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: false,
      signatoryName: "",
      signatoryTitle: "",
    },
    employee: {
      legalName: "Alex Example",
      jobTitle: "",
      address: "",
      startDate: "",
      serviceMonths: 0,
    },
    answers: {},
    sections,
    evidence: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeSection(id: string, sectionId: Section["sectionId"], html: string): Section {
  return {
    id,
    sectionId,
    title: id,
    html,
    required: true,
    versions: [],
    status: "ready",
  };
}

function PagedEditorHarness({
  draft,
  actionsRef,
}: {
  draft: Draft;
  actionsRef?: MutableRefObject<PagedEditorActions | null>;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  storeMock.currentDraft = currentDraft;
  storeMock.applyUpdate = (draftId, sectionId, html) => {
    setCurrentDraft((previous) => {
      if (previous.id !== draftId) return previous;
      const next = {
        ...previous,
        sections: previous.sections.map((section) =>
          section.id === sectionId ? { ...section, html, status: "edited" as const } : section,
        ),
      };
      storeMock.currentDraft = next;
      return next;
    });
  };
  return <PagedEditor draft={currentDraft} onDone={vi.fn()} actionsRef={actionsRef} />;
}

function setCaret(node: Text, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setSelection(startNode: Text, startOffset: number, endNode: Text, endOffset: number): void {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function collapseCurrentSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function currentSelectionText(): string {
  return window.getSelection()?.toString() ?? "";
}

function mockCommandQueries({
  states = {},
  values = {},
}: {
  states?: Record<string, boolean>;
  values?: Record<string, string>;
}): () => void {
  const originalQueryCommandState = document.queryCommandState;
  const originalQueryCommandValue = document.queryCommandValue;
  Object.defineProperty(document, "queryCommandState", {
    configurable: true,
    value: vi.fn((command: string) => Boolean(states[command])),
  });
  Object.defineProperty(document, "queryCommandValue", {
    configurable: true,
    value: vi.fn((command: string) => values[command] ?? ""),
  });
  return () => {
    Object.defineProperty(document, "queryCommandState", {
      configurable: true,
      value: originalQueryCommandState,
    });
    Object.defineProperty(document, "queryCommandValue", {
      configurable: true,
      value: originalQueryCommandValue,
    });
  };
}

function mockExecCommandCollapsingAlignment(): () => void {
  const originalExecCommand = document.execCommand;
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string) => {
      if (command.startsWith("justify")) {
        applyMockAlignment(command);
        collapseCurrentSelection();
      }
      return true;
    }),
  });
  return () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: originalExecCommand,
    });
  };
}

function applyMockAlignment(command: string): void {
  const align =
    command === "justifyCenter"
      ? "center"
      : command === "justifyRight"
      ? "right"
      : command === "justifyFull"
      ? "justify"
      : "left";
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode ?? null;
  const anchorElement =
    anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
  const root = anchorElement instanceof HTMLElement
    ? anchorElement.closest<HTMLElement>(".letter-body")
    : null;
  if (!root) return;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,li,div"))) {
    if (block.textContent?.trim()) block.style.textAlign = align;
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}
