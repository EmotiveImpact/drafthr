import { afterEach, expect, it, vi } from "vitest";
import { resolveEvidenceFiles } from "./workspace-files";
import { workspaceFileUrl } from "./workspace-file-types";
import type { Draft } from "../letters/types";
import { privateImageUrl } from "./privateImageUrl";
const tenant = "6342f430-7f39-4bf3-b59f-80ee1c65bd03", id = "47c3a124-7f09-462b-8f63-df21a8aa2938";
const draft = { id: "draft", sections: [{ id: "section", html: `<p>Text</p><img src="${workspaceFileUrl(id, tenant)}" />` }],
  evidence: [{ id: "ev", fileId: id, kind: "screenshot", mimeType: "image/png", displayMode: "inline" }] } as unknown as Draft;
afterEach(() => vi.unstubAllGlobals());
it("resolves private inline images transiently without changing the saved draft", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["fictional"], { type: "image/png" }) });
  vi.stubGlobal("fetch", fetcher);
  const resolved = await resolveEvidenceFiles(draft, tenant, { imagesOnly: true });
  expect(fetcher).toHaveBeenCalledWith(workspaceFileUrl(id, tenant), expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  expect(resolved.sections[0].html).toContain('src="data:image/png;base64,');
  expect(draft.sections[0].html).toContain("/api/store/files?");
  expect(draft.evidence![0].fileDataUrl).toBeUndefined();
});
it.each([workspaceFileUrl(id, "7342f430-7f39-4bf3-b59f-80ee1c65bd03"), "https://evil.test/image.png"])("fails closed for unlinked image %s", async src => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(resolveEvidenceFiles({ ...draft, evidence: [], sections: [{ ...draft.sections[0], html: `<img src="${src}" />` }] }, tenant)).rejects.toThrow("not linked");
  expect(fetcher).not.toHaveBeenCalled();
});
it("fails export instead of silently omitting an unreadable image", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "File unavailable" }) }));
  await expect(resolveEvidenceFiles(draft, tenant)).rejects.toThrow("File unavailable");
});
it("resolves reusable template images and branding once without requiring draft evidence", async () => {
  const url = privateImageUrl(`letterheads/${tenant}/${"a".repeat(64)}.png`);
  const source = { ...draft, evidence: [], employer: { ...draft.employer, letterheadDataUrl: url, signatureDataUrl: url }, sections: [{ ...draft.sections[0], html: `<img src="${url}">` }] };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["fictional"], { type: "image/png" }) });
  vi.stubGlobal("fetch", fetcher);
  const result = await resolveEvidenceFiles(source, tenant);
  expect(fetcher).toHaveBeenCalledOnce(); expect(result.sections[0].html).toContain("data:image/png");
  expect(result.employer.letterheadDataUrl).toContain("data:image/png"); expect(source.employer.letterheadDataUrl).toBe(url);
});
