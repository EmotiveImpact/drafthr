import { describe, expect, it, vi } from "vitest";
import { createWorkspaceTransport } from "./workspace-transport";
import { toServerUuid } from "./remote-ids";
import type { Draft } from "./letters/types";

describe("workspace transport", () => {
  it("pins tenant identity, canonicalizes links and carries the original revision", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ revision: 4 }));
    const client = createWorkspaceTransport("tenant-A", fetcher);
    await client.write({ kind: "drafts", id: "draft_old", baseRevision: 3, snapshot: { id: "draft_old", matterId: "matter_old", employeeId: "emp_old" } as Draft });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/store/drafts");
    expect(init.headers["X-Workspace-ID"]).toBe("tenant-A");
    expect(JSON.parse(init.body)).toMatchObject({ id: toServerUuid("draft_old"), baseRevision: 3, matterId: toServerUuid("matter_old"), snapshot: { employeeId: toServerUuid("emp_old") } });
  });
  it("paginates and preserves deletion markers", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ documents: [{ id: "emp_one", revision: 1, snapshot: { id: "emp_one", legalName: "Alex" } }], nextCursor: "next" }))
      .mockResolvedValueOnce(Response.json({ documents: [{ id: "emp_two", revision: 2, snapshot: null, deletedAt: 42 }], nextCursor: null }));
    const documents = await createWorkspaceTransport("tenant-A", fetcher).read("employees");
    expect(documents).toHaveLength(2); expect(documents[1].deletedAt).toBe(42);
    expect(fetcher.mock.calls[1][0]).toContain("cursor=next");
  });
  it("stops repeated pages instead of mounting a partial workspace", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ documents: [], nextCursor: "repeat" }));
    await expect(createWorkspaceTransport("A", fetcher).read("employees")).rejects.toThrow("pagination did not advance");
  });
  it("preserves workspace-change and revision-conflict errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "workspace_changed", error: "Reload" }, { status: 409 }));
    await expect(createWorkspaceTransport("A", fetcher).read("drafts")).rejects.toMatchObject({ code: "workspace_changed" });
  });
});
