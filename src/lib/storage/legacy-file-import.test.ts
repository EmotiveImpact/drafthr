import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { importLegacyDraftFiles, stagedFileUploader, sha256Bytes, type ImportFile } from "./legacy-file-import";
import type { Draft } from "../letters/types";
import type { WorkspaceFile } from "./workspace-file-types";
import { privateImageUrl } from "./privateImageUrl";

const tenant = "6342f430-7f39-4bf3-b59f-80ee1c65bd03", token = "47c3a124-7f09-462b-8f63-df21a8aa2938";
const image = "data:image/png;base64,iVBORw0KGgo=";
const draft = { id: "00da0f6b-3e50-4fc2-a343-1519166d78b0", createdAt: 1, updatedAt: 2,
  sections: [{ id: "section", html: `<p>Keep</p><img src='${image}' alt='Legacy'>`, versions: [{ id: "v1", html: `<img src="${image}">` }],
    pendingChange: { proposedHtml: `<p>Proposed<img src="${image}"></p>`, prevHtml: `<img src="${image}">` } }],
  evidence: [{ id: "ev", kind: "screenshot", filename: "legacy.png", fileDataUrl: image, content: "Keep caption" }],
} as unknown as Draft;
function receipt(file: ImportFile): WorkspaceFile {
  return { id: file.id, draftId: file.draftId, purpose: "evidence", format: null, filename: file.filename,
    contentType: file.contentType, size: file.size, sha256: file.sha256, draftRevision: 0, createdAt: 1, completedAt: 2 };
}
function hashing() {
  vi.stubGlobal("crypto", { subtle: { digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("verifies reusable image assets in draft history without linking them as evidence", async () => {
  const url = privateImageUrl(`letterheads/${tenant}/${"a".repeat(64)}.png`);
  const source = { ...draft, evidence: [], sections: [{ ...draft.sections[0], html: `<img src="${url}">`, versions: [], pendingChange: undefined }] };
  const stage = vi.fn(), persist = vi.fn(async () => url);
  const result = await importLegacyDraftFiles(source, tenant, token, stage, () => {}, persist);
  expect(result.sections[0].html).toContain(url); expect(result.evidence).toEqual([]);
  expect(stage).not.toHaveBeenCalled(); expect(persist).toHaveBeenCalledOnce();
});
it("rewrites image references across current text, versions and both sides of a pending edit", async () => {
  hashing(); const stage = vi.fn(async file => receipt(file)); const assertCurrent = vi.fn();
  const result = await importLegacyDraftFiles(draft, tenant, token, stage, assertCurrent);
  expect(stage).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain("data:image");
  expect(JSON.stringify(draft)).toContain("data:image");
  expect(result.evidence).toHaveLength(1); expect(result.evidence![0].content).toBe("Keep caption");
  expect(result.evidence![0].fileDataUrl).toBeUndefined();
  expect(result.sections[0].html).toContain(`/api/store/files?id=${result.evidence![0].fileId}`);
  expect(result.sections[0].pendingChange!.prevHtml).toContain("workspaceId=");
  const retried = await importLegacyDraftFiles(draft, tenant, token, stage, assertCurrent);
  expect(retried).toEqual(result); // Stable record/file IDs and timestamps.
});
it("links an image found only in historical HTML so restoring that version still works", async () => {
  hashing();
  const result = await importLegacyDraftFiles({ ...draft, evidence: [], sections: [{ ...draft.sections[0], html: "<p>Current text</p>", pendingChange: undefined }] }, tenant, token, async file => receipt(file), () => {});
  expect(result.evidence).toHaveLength(1); expect(result.evidence![0]).toMatchObject({ kind: "screenshot", displayMode: "inline" });
  expect(result.sections[0].versions[0].html).toContain(result.evidence![0].fileId);
});
it("removes a six-megabyte attachment from JSON while preserving every original byte", async () => {
  hashing();
  const bytes = Buffer.alloc(6 * 1024 * 1024, 65), dataUrl = `data:application/pdf;base64,${bytes.toString("base64")}`;
  const source = { ...draft, sections: [], evidence: [{ ...draft.evidence![0], kind: "document" as const, fileDataUrl: dataUrl, filename: "large.pdf" }] };
  const stage = vi.fn(async (file: ImportFile) => {
    expect(file.bytes.byteLength).toBe(bytes.length);
    expect(file.sha256).toBe(createHash("sha256").update(bytes).digest("hex")); return receipt(file);
  });
  const result = await importLegacyDraftFiles(source, tenant, token, stage, () => {});
  expect(JSON.stringify(result).length).toBeLessThan(2000);
  expect(source.evidence[0].fileDataUrl).toBe(dataUrl);
});
it.each(["data:text/html;base64,YQ==", "data:image/png;base64,@@bad", "data:image/png;base64,", "https://example.com/file"])("does not discard unsupported or corrupt legacy bytes: %s", async value => {
  hashing(); const stage = vi.fn();
  await expect(importLegacyDraftFiles({ ...draft, evidence: [{ ...draft.evidence![0], fileDataUrl: value }] }, tenant, token, stage, () => {})).rejects.toThrow();
  expect(stage).not.toHaveBeenCalled(); expect(draft.evidence![0].fileDataUrl).toBe(image);
});
it("keeps the source intact when an upload fails or the workspace changes", async () => {
  hashing();
  await expect(importLegacyDraftFiles(draft, tenant, token, async () => { throw new Error("Offline"); }, () => {})).rejects.toThrow("Offline");
  await expect(importLegacyDraftFiles(draft, tenant, token, async file => receipt(file), () => { throw new Error("Workspace changed"); })).rejects.toThrow("Workspace changed");
  expect(draft.evidence![0].fileDataUrl).toBe(image);
});
it("does not reinterpret a non-image attachment as an inline image", async () => {
  const source = { ...draft, evidence: [], sections: [{ ...draft.sections[0], html: '<img src="data:text/plain;base64,aGVsbG8=">' }] };
  const stage = vi.fn();
  await expect(importLegacyDraftFiles(source, tenant, token, stage, () => {})).rejects.toThrow("unsupported image type");
  expect(stage).not.toHaveBeenCalled();
});
it("pins metadata and raw upload requests and verifies the private byte round-trip", async () => {
  hashing(); const bytes = new Uint8Array([1, 2, 3]);
  const file: ImportFile = { id: token, draftId: draft.id, importToken: token, filename: "evidence.txt", contentType: "text/plain", size: 3, sha256: await sha256Bytes(bytes), bytes };
  let uploaded = false;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") {
      expect((init.headers as Record<string, string>)["X-Workspace-ID"]).toBe(tenant);
      const body = JSON.parse(String(init.body)); expect(body.bytes).toBeUndefined();
      if (body.action === "prepare-import") return Response.json({ provider: "local", ready: false });
      return uploaded ? Response.json({ file: receipt(file) }) : Response.json({ error: "Bytes missing" }, { status: 503 });
    }
    if (init.method === "PATCH") { expect((init.body as Blob).size).toBe(3); uploaded = true; return Response.json({ uploaded: true }); }
    expect(url).toContain(`workspaceId=${tenant}&importToken=${token}`);
    expect(init.headers).toEqual({ Range: "bytes=0-2" });
    return new Response(bytes, { status: 206, headers: { "Content-Range": "bytes 0-2/3" } });
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await stagedFileUploader(tenant, () => {})(file)).toEqual(receipt(file));
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("does not reupload bytes after an interrupted completion and rejects bad download bytes", async () => {
  hashing(); const bytes = new Uint8Array([1, 2, 3]);
  const file: ImportFile = { id: token, draftId: draft.id, importToken: token, filename: "evidence.txt", contentType: "text/plain", size: 3, sha256: await sha256Bytes(bytes), bytes };
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "POST") return JSON.parse(String(init.body)).action === "prepare-import"
      ? Response.json({ provider: "local", ready: false }) : Response.json({ file: receipt(file) });
    return new Response(new Uint8Array([9, 9, 9]), { status: 206, headers: { "Content-Range": "bytes 0-2/3" } });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(stagedFileUploader(tenant, () => {})(file)).rejects.toThrow("failed verification");
  expect(fetcher.mock.calls.some(([, init]) => init.method === "PATCH")).toBe(false);
});
it("imports a throttled multi-file batch with stable IDs and exact verified bytes", async () => {
  hashing(); vi.useFakeTimers();
  const source = { ...draft, sections: [], evidence: Array.from({ length: 65 }, (_, index) => ({
    ...draft.evidence![0], id: `evidence-${index}`, filename: `fixture-${index}.txt`,
    kind: "document" as const, fileDataUrl: `data:text/plain;base64,${Buffer.from(`Fictional ${index}`).toString("base64")}`,
  })) };
  const originals = JSON.stringify(source), stored = new Map<string, ImportFile>();
  let calls = 0, throttled = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (++calls % 11 === 0) { throttled++; return new Response(null, { status: 429, headers: { "Retry-After": "1" } }); }
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      expect(body.action).toBe("prepare-import");
      const index = Number(body.filename.match(/fixture-(\d+)/)[1]);
      const bytes = new Uint8Array(Buffer.from(`Fictional ${index}`));
      stored.set(body.id, { ...body, bytes });
      return Response.json({ ready: true, file: receipt({ ...body, bytes }) });
    }
    const file = stored.get(new URL(url, "http://localhost").searchParams.get("id")!)!;
    expect(init.headers).toEqual({ Range: `bytes=0-${file.size - 1}` });
    return new Response(file.bytes, { status: 206, headers: { "Content-Range": `bytes 0-${file.size - 1}/${file.size}` } });
  }));
  const pending = importLegacyDraftFiles(source, tenant, token, stagedFileUploader(tenant, () => {}), () => {});
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(throttled).toBeGreaterThan(1); expect(stored.size).toBe(65);
  expect(new Set(result.evidence!.map(item => item.fileId)).size).toBe(65);
  expect(JSON.stringify(result)).not.toContain("base64"); expect(JSON.stringify(source)).toBe(originals);
});
it("does not treat exhausted completion throttling as missing bytes and upload again", async () => {
  hashing(); vi.useFakeTimers(); const bytes = new Uint8Array([1, 2, 3]);
  const file: ImportFile = { id: token, draftId: draft.id, importToken: token, filename: "fixture.txt", contentType: "text/plain", size: 3, sha256: await sha256Bytes(bytes), bytes };
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => JSON.parse(String(init.body)).action === "prepare-import"
    ? Response.json({ provider: "local", ready: false })
    : new Response(null, { status: 429, headers: { "Retry-After": "1" } }));
  vi.stubGlobal("fetch", fetcher);
  const result = expect(stagedFileUploader(tenant, () => {})(file)).rejects.toThrow("original data is preserved");
  await vi.runAllTimersAsync(); await result;
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(fetcher.mock.calls.every(([, init]) => init.method === "POST")).toBe(true);
});
