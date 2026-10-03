import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseWorkspaceBoundary } from "./DatabaseWorkspaceBoundary";

const fake = vi.hoisted(() => ({ load: vi.fn(), recover: vi.fn(), resolve: vi.fn(), reviewLinks: vi.fn(), reviewTabs: vi.fn(), recoverTabs: vi.fn(), otherCount: 0, pending: 1 }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isLoaded: true, activeTenant: { id: "tenant", name: "Fictional" }, user: { id: "user" } }) }));
vi.mock("@/lib/workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => true }));
vi.mock("@/lib/database-workspace", () => ({
  useDatabaseWorkspaceStatus: () => ({ identity: "user:tenant", phase: "ready", pending: fake.pending, failed: fake.pending, recoverySafe: true, otherRecoveryCount: fake.otherCount }),
  initializeDatabaseWorkspace: async () => {}, stopDatabaseWorkspace: () => {}, loadWorkspaceConflicts: fake.load,
  recoverWorkspaceConflictAsCopy: fake.recover, workspaceFileContext: () => ({ isCurrent: () => true }),
  reviewWorkspaceRecoveryLinks: fake.reviewLinks,
  resolveWorkspaceConflict: fake.resolve,
  reviewClosedWorkspaceTabs: fake.reviewTabs, recoverClosedWorkspaceTabs: fake.recoverTabs,
}));
const conflict = { identity: "user:tenant", operation: { kind: "drafts", id: "old", baseRevision: 1, snapshot: { id: "old", title: "Pending letter" } },
  latest: { id: "old", revision: 2, snapshot: null, deletedAt: 100 }, message: "This draft was deleted." };
function Location() { return <p>Location: {useLocation().pathname}</p>; }
beforeEach(() => { fake.load.mockReset().mockResolvedValue([conflict]); fake.recover.mockReset(); fake.resolve.mockReset().mockResolvedValue(undefined); fake.reviewLinks.mockReset().mockResolvedValue({ conflict, issues: [] }); fake.reviewTabs.mockReset(); fake.recoverTabs.mockReset().mockResolvedValue(undefined); fake.otherCount = 0; fake.pending = 1; });
afterEach(() => vi.restoreAllMocks());
async function comparison() {
  render(<MemoryRouter><DatabaseWorkspaceBoundary><Location /></DatabaseWorkspaceBoundary></MemoryRouter>);
  await act(async () => { screen.getByRole("button", { name: "Review unsaved changes" }).click(); });
}
it("offers a separate copy for deleted content, waits for acknowledgement and opens the recovered draft", async () => {
  let finish!: (id: string) => void;
  fake.recover.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await comparison();
  expect(screen.queryByRole("button", { name: "Save my version over this database version" })).not.toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Recover my edit as a new record" }).click(); });
  expect(screen.getByRole("button", { name: "Recover my edit as a new record" })).toBeDisabled();
  expect(screen.getByText("Location: /")).toBeInTheDocument();
  fake.load.mockResolvedValue([]);
  await act(async () => { finish("copy-id"); });
  expect(screen.getByText("Location: /editor/copy-id")).toBeInTheDocument();
  expect(fake.recover).toHaveBeenCalledWith(conflict);
});
it("keeps the comparison visible on a failed copy", async () => {
  fake.recover.mockRejectedValue(new Error("Copy not confirmed. Original preserved."));
  await comparison();
  await act(async () => { screen.getByRole("button", { name: "Recover my edit as a new record" }).click(); });
  expect(screen.getByRole("alert")).toHaveTextContent("Original preserved");
  expect(screen.getByRole("button", { name: "Recover my edit as a new record" })).toBeEnabled();
  expect(screen.getByText("Location: /")).toBeInTheDocument();
});
it.each([true, false])("finishes recovery when the last pending operation retires before the promise returns (deleted=%s)", async deleted => {
  const current = deleted ? conflict : { ...conflict, latest: { id: "old", revision: 2, snapshot: { id: "old", title: "Database letter" }, deletedAt: null } };
  fake.load.mockResolvedValue([current]); fake.reviewLinks.mockResolvedValue({ conflict: current, issues: [] });
  let finish!: (id: string) => void;
  (deleted ? fake.recover : fake.resolve).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const ui = () => <MemoryRouter><DatabaseWorkspaceBoundary><Location /></DatabaseWorkspaceBoundary></MemoryRouter>;
  const view = render(ui());
  await act(async () => { screen.getByRole("button", { name: "Review unsaved changes" }).click(); });
  await act(async () => { screen.getByRole("button", { name: deleted ? "Recover my edit as a new record" : "Save my version over this database version" }).click(); });
  // The real coordinator publishes pending=0 during verified persistence,
  // before its promise returns to the control that owns the completion action.
  fake.pending = 0;
  view.rerender(ui());
  fake.load.mockResolvedValue([]);
  await act(async () => { finish("copy-id"); });
  expect(fake.load).toHaveBeenCalledTimes(2);
  expect(screen.getByText(deleted ? "Location: /editor/copy-id" : "Location: /")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Database save status" })).not.toBeInTheDocument();
});
it("requires an explicit optional unlink choice before creating the recovered copy", async () => {
  const issue = { key: "matters:gone", kind: "matters", id: "gone", label: "Letter matter", required: false, candidates: [] };
  const review = { conflict, issues: [issue] };
  fake.reviewLinks.mockResolvedValue(review); fake.recover.mockResolvedValue("copy-id");
  await comparison();
  await act(async () => { screen.getByRole("button", { name: "Recover my edit as a new record" }).click(); });
  expect(fake.recover).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Recover my edit as a new record" })).toBeDisabled();
  await act(async () => { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); });
  await act(async () => { screen.getByRole("option", { name: "Remove this link; keep all copied content" }).click(); });
  await act(async () => { screen.getByRole("button", { name: "Recover my edit as a new record" }).click(); });
  expect(fake.recover).toHaveBeenCalledWith(conflict, { review, choices: { "matters:gone": null } });
});
it("uses the guided choices for a live letter without creating or navigating to a copy", async () => {
  const live = { ...conflict, latest: { id: "old", revision: 2, snapshot: { id: "old", title: "Database letter" }, deletedAt: null } };
  const review = { conflict: live, issues: [{ key: "matters:gone", kind: "matters", id: "gone", label: "Letter matter", required: false, candidates: [] }] };
  fake.load.mockResolvedValue([live]); fake.reviewLinks.mockResolvedValue(review);
  await comparison();
  await act(async () => { screen.getByRole("button", { name: "Save my version over this database version" }).click(); });
  expect(fake.resolve).not.toHaveBeenCalled(); expect(screen.getByText(/clears its current approval/)).toBeInTheDocument();
  await act(async () => { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); });
  await act(async () => { screen.getByRole("option", { name: "Remove this link; keep all copied content" }).click(); });
  fake.load.mockResolvedValue([]);
  await act(async () => { screen.getByRole("button", { name: "Save my version over this database version" }).click(); });
  expect(fake.resolve).toHaveBeenCalledWith(live, "mine", { review, choices: { "matters:gone": null } });
  expect(fake.recover).not.toHaveBeenCalled(); expect(screen.getByText("Location: /")).toBeInTheDocument();
});
it("keeps required-parent recovery disabled when no matter is available and permits a refresh", async () => {
  fake.reviewLinks.mockResolvedValue({ conflict, issues: [{ key: "matters:gone", kind: "matters", id: "gone", label: "Parent matter", required: true, candidates: [] }] });
  await comparison();
  await act(async () => { screen.getByRole("button", { name: "Recover my edit as a new record" }).click(); });
  expect(screen.getByText(/No available matter/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recover my edit as a new record" })).toBeDisabled();
  fake.reviewLinks.mockResolvedValue({ conflict, issues: [] });
  await act(async () => { screen.getByRole("button", { name: "Check linked records again" }).click(); });
  expect(screen.getByRole("button", { name: "Recover my edit as a new record" })).toBeEnabled();
  expect(fake.recover).not.toHaveBeenCalled();
});
it("requires a version choice and destructive confirmation before recovering competing tab edits", async () => {
  fake.otherCount = 2;
  const review = { identity: "user:tenant", files: [], pending: [], groups: [{ key: "employees:person", variants: [
    { source: "first", label: "Older tab 1", operation: { kind: "employees", id: "person", baseRevision: 1, snapshot: { id: "person", legalName: "First version" } } },
    { source: "second", label: "Older tab 2", operation: { kind: "employees", id: "person", baseRevision: 1, snapshot: { id: "person", legalName: "Second version" } } },
  ] }] };
  fake.reviewTabs.mockReturnValue(review);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MemoryRouter><DatabaseWorkspaceBoundary><Location /></DatabaseWorkspaceBoundary></MemoryRouter>);
  await act(async () => { screen.getByRole("button", { name: "Older tabs are closed — recover their edits" }).click(); });
  const apply = screen.getByRole("button", { name: "Recover selected versions and discard the others" });
  expect(apply).toBeDisabled(); expect(fake.recoverTabs).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("radio", { name: /Older tab 2/ }).click(); });
  expect(apply).toBeEnabled();
  await act(async () => { apply.click(); });
  expect(confirm).toHaveBeenCalledOnce(); expect(fake.recoverTabs).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await act(async () => { apply.click(); });
  expect(fake.recoverTabs).toHaveBeenCalledWith({ review, choices: { "employees:person": "second" } });
  expect(screen.queryByRole("region", { name: "Choose recovery versions" })).not.toBeInTheDocument();
});
