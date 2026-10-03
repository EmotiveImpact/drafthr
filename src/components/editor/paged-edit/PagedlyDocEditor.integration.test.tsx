import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { PagedlyDocEditor } from "./PagedlyDocEditor";

type Emit = (change: { sections: Record<string, string> }) => void;
const engine = vi.hoisted(() => ({
  emitters: [] as (Emit | undefined)[],
  mounts: 0,
  flush: vi.fn<() => Promise<void>>(),
}));

// Keep the real app/store/adapter lifecycle; model the vendor's mount-once
// document and debounced onChange contract without jsdom pagination metrics.
vi.mock("pagedly", async () => {
  const React = await import("react");
  return {
    LetterEditor: (props: {
      draft: { sections: { html: string }[] };
      editorRef: { current: unknown };
      onChange?: Emit;
    }) => {
      const [initial] = React.useState(props.draft);
      React.useLayoutEffect(() => {
        engine.mounts++;
        engine.emitters.push(props.onChange);
        props.editorRef.current = { flush: engine.flush };
      }, []);
      return <div data-testid="page-content">{initial.sections.map(s => s.html).join("")}</div>;
    },
  };
});

let draft: Draft;
beforeEach(() => {
  const memory = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
    clear: () => memory.clear(),
  } });
  engine.mounts = 0;
  engine.emitters = [];
  engine.flush.mockReset().mockResolvedValue(undefined);
  useDraftStore.setState({ drafts: {}, employees: {}, matters: {} });
  const id = useDraftStore.getState().createDraft("reference", {
    employeeLegalName: "Test Person", employerLegalName: "Example Ltd", signatoryName: "Manager",
  }, "employer");
  for (const section of useDraftStore.getState().drafts[id].sections) {
    useDraftStore.getState().updateSection(id, section.id, "<p>Original text.</p>");
  }
  draft = useDraftStore.getState().drafts[id];
});
afterEach(cleanup);

function Harness({ reviewMode = false }: { reviewMode?: boolean }) {
  const current = useDraftStore(s => s.drafts[draft.id]);
  return <PagedlyDocEditor draft={current} reviewMode={reviewMode} />;
}

describe("Pagedly store integration", () => {
  it.each([false, true])("refreshes completed streams with unchanged final HTML (review=%s)", async (reviewMode) => {
    render(<Harness reviewMode={reviewMode} />);
    await act(async () => {
      useDraftStore.getState().setSections(draft.id, draft.sections.map((section, index) =>
        index === 0 ? { ...section, html: "<p>Streamed replacement.</p>", status: "streaming" } : section));
    });
    expect(engine.mounts).toBe(1);
    expect(screen.getByTestId("page-content")).not.toHaveTextContent("Streamed replacement.");
    await act(async () => {
      useDraftStore.getState().setSectionStatus(draft.id, draft.sections[0].id, "ready");
    });
    expect(screen.getByTestId("page-content")).toHaveTextContent("Streamed replacement.");
    expect(engine.mounts).toBe(2);
  });

  it("persists Page typing without remounting or resetting undo state", async () => {
    render(<Harness />);
    await act(async () => {
      engine.emitters[0]?.({ sections: { [draft.sections[0].id]: "<p>Typed on Page.</p>" } });
    });
    expect(useDraftStore.getState().drafts[draft.id].sections[0].html).toBe("<p>Typed on Page.</p>");
    expect(engine.mounts).toBe(1);
  });

  it("flushes pending edits but never overwrites the externally changed section", async () => {
    render(<Harness />);
    const emit = engine.emitters[0]!;
    engine.flush.mockImplementationOnce(async () => emit({ sections: {
      [draft.sections[0].id]: "<p>Old Page copy.</p>",
      [draft.sections[1].id]: "<p>Pending user typing.</p>",
    } }));
    await act(async () => {
      useDraftStore.getState().updateSection(draft.id, draft.sections[0].id, "<p>External update.</p>");
    });
    const current = useDraftStore.getState().drafts[draft.id];
    expect(current.sections[0].html).toBe("<p>External update.</p>");
    expect(current.sections[1].html).toBe("<p>Pending user typing.</p>");
    expect(screen.getByTestId("page-content")).toHaveTextContent("External update.");
    expect(screen.getByTestId("page-content")).toHaveTextContent("Pending user typing.");
    // A late vendor emission from the retired instance cannot clobber the new baseline.
    await act(async () => emit({ sections: { [draft.sections[0].id]: "<p>Late stale copy.</p>" } }));
    expect(useDraftStore.getState().drafts[draft.id].sections[0].html).toBe("<p>External update.</p>");
  });

  it("refreshes added and removed sections while preserving surviving content", async () => {
    render(<Harness />);
    const added = { ...draft.sections[0], id: "added", html: "<p>Added section.</p>" };
    await act(async () => useDraftStore.getState().setSections(draft.id, [...draft.sections, added]));
    expect(screen.getByTestId("page-content")).toHaveTextContent("Added section.");
    await act(async () => useDraftStore.getState().setSections(draft.id, draft.sections));
    expect(screen.getByTestId("page-content")).not.toHaveTextContent("Added section.");
    expect(screen.getByTestId("page-content")).toHaveTextContent("Original text.");
  });

  it("keeps comment and figure markup when Page cannot round-trip it", async () => {
    const marked = '<p><mark data-comment-id="c1">Original text.</mark></p>';
    useDraftStore.getState().updateSection(draft.id, draft.sections[0].id, marked);
    render(<Harness />);
    await act(async () => {
      engine.emitters[0]?.({ sections: { [draft.sections[0].id]: "<p>Vendor stripped marks.</p>" } });
    });
    expect(useDraftStore.getState().drafts[draft.id].sections[0].html).toBe(marked);
  });
});
