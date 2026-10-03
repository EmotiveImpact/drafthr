// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { findEvidenceUploads } from "./evidence-upload-recovery";
import type { Draft } from "../letters/types";
const fake = vi.hoisted(() => ({ current: vi.fn(), saved: vi.fn(), getState: vi.fn(), setEvidence: vi.fn() }));
vi.mock("../database-workspace", () => ({ workspaceFileContext: () => ({ tenantId: "tenant", isCurrent: fake.current }), savedWorkspaceDraft: fake.saved }));
vi.mock("../store", () => ({ useDraftStore: { getState: fake.getState } }));
const draftId = "47c3a124-7f09-462b-8f63-df21a8aa2938";
const file = { id: "e09643e9-c137-4515-9f50-8d5c3cb6eb05", draftId, purpose: "evidence", status: "ready", filename: "fictional.txt", contentType: "text/plain", size: 9, sha256: "a".repeat(64), createdAt: 123, completedAt: 456 };
let draft: Draft;
beforeEach(() => {
  vi.clearAllMocks(); fake.current.mockReturnValue(true); fake.saved.mockResolvedValue({ revision: 2 });
  draft = { id: draftId, evidence: [] } as unknown as Draft;
  fake.setEvidence.mockImplementation((_id, evidence) => { draft = { ...draft, evidence }; });
  fake.getState.mockImplementation(() => ({ drafts: { [draftId]: draft }, setEvidence: fake.setEvidence }));
});
afterEach(() => vi.unstubAllGlobals());
function transport(pending = false) {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect((init.headers as Record<string, string>)["X-Workspace-ID"]).toBe("tenant");
    return Response.json(init.method === "POST" ? { file } : { files: [{ ...file, status: pending ? "pending" : "ready", completedAt: pending ? null : 456 }], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
it("finds completed uploads without reattaching them automatically", async () => {
  const fetcher = transport();
  const recovery = await findEvidenceUploads(draftId);
  expect(recovery.files).toHaveLength(1); expect(fake.setEvidence).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][0]).toContain(`draftId=${draftId}&recovery=true`);
  await recovery.attach(file.id);
  expect(draft.evidence![0]).toMatchObject({ fileId: file.id, fileSize: 9, uploadedAt: 123 });
  expect(draft.evidence![0].fileDataUrl).toBeUndefined();
  expect(fake.saved).toHaveBeenCalledWith(draft);
  await recovery.attach(file.id);
  expect(fake.setEvidence).toHaveBeenCalledTimes(1); // An interrupted acknowledgement retries the same reference.
  expect((await findEvidenceUploads(draftId)).files).toEqual([]);
});
it("completes pending bytes before attaching and preserves intervening evidence", async () => {
  const fetcher = transport(true);
  const recovery = await findEvidenceUploads(draftId);
  draft.evidence = [{ id: "other", kind: "note", content: "Later edit", uploadedAt: 1, includeVerbatim: false }];
  await recovery.attach(file.id);
  expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ action: "complete", id: file.id });
  expect(draft.evidence).toHaveLength(2); expect(draft.evidence![0].content).toBe("Later edit");
});
it("keeps failed draft saves pending and retries without duplicate attachments", async () => {
  transport(); const recovery = await findEvidenceUploads(draftId);
  fake.saved.mockRejectedValueOnce(new Error("Save not confirmed"));
  await expect(recovery.attach(file.id)).rejects.toThrow("Save not confirmed");
  expect(draft.evidence).toHaveLength(1);
  await recovery.attach(file.id); expect(fake.setEvidence).toHaveBeenCalledTimes(1);
});
it("does not attach bytes whose completion failed", async () => {
  const fetcher = transport(true); const recovery = await findEvidenceUploads(draftId);
  fetcher.mockResolvedValueOnce(Response.json({ error: "Incomplete bytes" }, { status: 503 }));
  await expect(recovery.attach(file.id)).rejects.toThrow("Incomplete bytes");
  expect(fake.setEvidence).not.toHaveBeenCalled();
});
it("rejects stale recovery receipts and mismatched completion metadata", async () => {
  const fetcher = transport(true); const recovery = await findEvidenceUploads(draftId);
  fake.current.mockReturnValue(false);
  await expect(recovery.attach(file.id)).rejects.toThrow("Workspace or letter changed");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fake.current.mockReturnValue(true);
  fetcher.mockResolvedValueOnce(Response.json({ file: { ...file, sha256: "b".repeat(64) } }));
  await expect(recovery.attach(file.id)).rejects.toThrow("did not match");
  expect(fake.setEvidence).not.toHaveBeenCalled();
});
it("refuses a late completion after the letter panel was unmounted", async () => {
  const fetcher = transport(true); let active = true;
  const recovery = await findEvidenceUploads(draftId, () => active);
  fetcher.mockImplementationOnce(async () => { active = false; return Response.json({ file }); });
  await expect(recovery.attach(file.id)).rejects.toThrow("Workspace or letter changed");
  expect(fake.setEvidence).not.toHaveBeenCalled();
});
it("follows recovery pages and rejects a repeated cursor", async () => {
  const fetcher = transport();
  fetcher.mockResolvedValueOnce(Response.json({ files: [file], nextCursor: "next" }));
  fetcher.mockResolvedValueOnce(Response.json({ files: [], nextCursor: "next" }));
  await expect(findEvidenceUploads(draftId)).rejects.toThrow("pagination did not advance");
  expect(fetcher.mock.calls[1][0]).toContain("cursor=next");
});
