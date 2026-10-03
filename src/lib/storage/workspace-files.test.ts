// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveWorkspaceFile, storeEvidenceFile } from "./workspace-files";
import type { Draft } from "../letters/types";
const fixture = vi.hoisted(() => ({
  saved: vi.fn(), matches: vi.fn(), put: vi.fn(), getState: vi.fn(),
}));
vi.mock("../database-workspace", () => ({ savedWorkspaceDraft: fixture.saved, workspaceFileContext: () => ({ tenantId: "6342f430-7f39-4bf3-b59f-80ee1c65bd03", isCurrent: fixture.matches }) }));
vi.mock("../workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => true }));
vi.mock("../store", () => ({ useDraftStore: { getState: fixture.getState } }));
vi.mock("@vercel/blob/client", () => ({ put: fixture.put }));
const draft = { id: "47c3a124-7f09-462b-8f63-df21a8aa2938" } as Draft;
const tenantId = "6342f430-7f39-4bf3-b59f-80ee1c65bd03";
beforeEach(() => {
  vi.clearAllMocks();
  fixture.saved.mockResolvedValue({ tenantId, identity: "user:tenant", revision: 7 });
  fixture.matches.mockReturnValue(true); fixture.put.mockResolvedValue({});
  fixture.getState.mockReturnValue({ drafts: { [draft.id]: draft } });
});
afterEach(() => vi.unstubAllGlobals());
function transport(provider = "local", failCompletion = false) {
  let prepared: Record<string, unknown>;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect((init.headers as Record<string, string>)["X-Workspace-ID"]).toBe(tenantId);
    if (init.method === "PATCH") return Response.json({ uploaded: true });
    const body = JSON.parse(String(init.body));
    if (body.action === "prepare") {
      prepared = body;
      return Response.json({ provider, pathname: `workspace-files/${tenantId}/${body.id}`, token: "scoped", id: body.id });
    }
    if (failCompletion) return Response.json({ error: "Storage unavailable" }, { status: 503 });
    return Response.json({ file: { ...prepared, completedAt: 1 } });
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
it("pins every local stage and confirms the exact saved draft revision", async () => {
  const fetcher = transport();
  const file = await saveWorkspaceFile(draft, new Blob(["fictional"], { type: "text/plain" }), "test.txt", "export", "txt");
  expect(file.draftRevision).toBe(7); expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(fetcher).toHaveBeenCalledTimes(3); expect(fixture.saved).toHaveBeenCalledWith(draft);
});
it("uses direct private uploads for hosted files", async () => {
  transport("vercel");
  const blob = new Blob(["fictional"], { type: "text/plain" });
  await saveWorkspaceFile(draft, blob, "test.txt", "export", "txt");
  expect(fixture.put).toHaveBeenCalledWith(expect.stringContaining(`workspace-files/${tenantId}/`), blob,
    expect.objectContaining({ access: "private", token: "scoped", contentType: "text/plain" }));
});
it("does not return success or fall back to browser storage when confirmation fails", async () => {
  transport("local", true);
  await expect(storeEvidenceFile(draft.id, new File(["fictional"], "evidence.txt", { type: "text/plain" }))).rejects.toThrow("Storage unavailable");
});
it("returns only the file reference, never bytes, for database evidence", async () => {
  transport();
  const stored = await storeEvidenceFile(draft.id, new File(["fictional"], "evidence.txt", { type: "text/plain" }));
  expect(stored.fileId).toBeTruthy(); expect(stored.fileSize).toBe(9); expect(stored.fileDataUrl).toBeUndefined();
});
it("refuses to start an upload after a workspace change", async () => {
  const fetcher = transport(); fixture.matches.mockReturnValue(false);
  await expect(saveWorkspaceFile(draft, new Blob(["fictional"], { type: "text/plain" }), "test.txt", "export", "txt")).rejects.toThrow("Workspace changed");
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not send completion when a session transition invalidates the upload", async () => {
  const fetcher = transport();
  fixture.matches.mockImplementation(() => fetcher.mock.calls.length < 2);
  await expect(saveWorkspaceFile(draft, new Blob(["fictional"], { type: "text/plain" }), "test.txt", "export", "txt")).rejects.toThrow("Workspace changed");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
