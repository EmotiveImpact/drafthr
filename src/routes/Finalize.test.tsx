import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { Finalize } from "./Finalize";
vi.mock("@/components/editor/LetterPreview", () => ({ LetterPreview: ({ exportMode }: { exportMode: boolean }) => <p>{exportMode ? "Export-mode letter preview" : "Editor preview"}</p> }));

beforeEach(() => {
  const memory = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
    clear: () => memory.clear(),
  } });
  useDraftStore.setState({ drafts: {}, employees: {}, matters: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function create(type: "reference" | "termination" = "reference") {
  const id = useDraftStore.getState().createDraft(type, {
    jurisdiction: "UK", employeeLegalName: "Jordan Example",
    employerLegalName: "Example Ltd", signatoryName: "Manager",
  }, "employer");
  for (const section of useDraftStore.getState().drafts[id].sections) {
    useDraftStore.getState().updateSection(id, section.id, "<p>Completed letter content.</p>");
  }
  return id;
}

function open(id: string) {
  render(<MemoryRouter initialEntries={["/editor/" + id + "/finalize"]}>
    <Routes><Route path="/editor/:draftId/finalize" element={<Finalize />} /></Routes>
  </MemoryRouter>);
}

function finalActions() {
  return screen.getAllByRole("button").filter((button) =>
    /^(PDF|DOCX|TXT|ZIP|Mark as sent)/.test(button.textContent?.trim() ?? ""));
}

it("exposes the export-mode preview on demand without inventing a page count", async () => {
  open(create());
  expect(screen.queryByText("2 · A4")).not.toBeInTheDocument();
  expect(screen.queryByText("Export-mode letter preview")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preview letter and exhibits" }));
  expect(await screen.findByText("Export-mode letter preview")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Hide letter preview" }));
  expect(screen.queryByText("Export-mode letter preview")).not.toBeInTheDocument();
});

it("disables desktop and mobile export/send while streaming, then enables them after completion", async () => {
  const id = create();
  const section = useDraftStore.getState().drafts[id].sections[0];
  useDraftStore.getState().setSectionStatus(id, section.id, "streaming");
  open(id);
  expect(finalActions().length).toBeGreaterThanOrEqual(5);
  finalActions().forEach(button => {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  });
  expect(useDraftStore.getState().drafts[id].exports).toBeUndefined();
  await act(async () => useDraftStore.getState().setSectionStatus(id, section.id, "ready"));
  finalActions().forEach(button => expect(button).toBeEnabled());
});

it("shows broken evidence references and blocks export until the draft is repaired", async () => {
  const id = create();
  const section = useDraftStore.getState().drafts[id].sections[0];
  useDraftStore.getState().updateSection(id, section.id, "<p>[See Fig 99]</p>");
  open(id);
  expect(screen.getAllByText("1 broken evidence reference").length).toBeGreaterThan(0);
  finalActions().forEach(button => expect(button).toBeDisabled());
  await act(async () => useDraftStore.getState().updateSection(id, section.id, "<p>Repaired text.</p>"));
  finalActions().forEach(button => expect(button).toBeEnabled());
});

it("shows the current reviewer and re-locks Finalise when that decision is cleared", async () => {
  const id = create("termination");
  useDraftStore.setState(state => ({ drafts: { ...state.drafts, [id]: {
    ...state.drafts[id],
    evidence: [
      { id: "minutes", kind: "document", filename: "hearing minutes.txt", content: "hearing minutes", uploadedAt: 1, includeVerbatim: false },
      { id: "evidence", kind: "document", filename: "allegation evidence.txt", content: "allegation evidence", uploadedAt: 1, includeVerbatim: false },
    ],
    answers: { ...state.drafts[id].answers, _counselReview: { reviewedBy: "Current Reviewer", reviewedOn: "2026-09-14" } },
    exports: [{ id: "old", format: "pdf", exportedAt: 1, reviewedBy: "Old Reviewer", reviewedOn: "2026-01-01" }],
  } } }));
  open(id);
  finalActions().forEach(button => expect(button).toBeEnabled());
  expect(screen.getAllByText(/Current Reviewer/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Old Reviewer/)).not.toBeInTheDocument();
  await act(async () => {
    const answers = { ...useDraftStore.getState().drafts[id].answers };
    delete answers._counselReview;
    useDraftStore.getState().updateAnswers(id, answers);
  });
  finalActions().forEach(button => expect(button).toBeDisabled());
  expect(screen.getByText("Counsel review required")).toBeInTheDocument();
  expect(useDraftStore.getState().drafts[id].exports).toHaveLength(1);
});

it("goes to Activity immediately after marking a ready letter as sent", () => {
  const id = create();
  render(<MemoryRouter initialEntries={[`/editor/${id}/finalize`]}>
    <Routes>
      <Route path="/editor/:draftId/finalize" element={<Finalize />} />
      <Route path="/activity" element={<p>Activity destination</p>} />
    </Routes>
  </MemoryRouter>);

  const sendButton = screen.getAllByRole("button", { name: "Mark as sent" })[0];
  expect(sendButton).toBeEnabled();
  fireEvent.click(sendButton);

  expect(screen.getByText("Activity destination")).toBeInTheDocument();
  expect(useDraftStore.getState().drafts[id].exports?.at(-1)?.format).toBe("marked-sent");
});
