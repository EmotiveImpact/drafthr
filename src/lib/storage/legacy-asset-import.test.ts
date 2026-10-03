import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { importEmployerAssets, importTemplateAssets, legacyAssetUploader } from "./legacy-asset-import";
import { privateImageUrl } from "./privateImageUrl";
import { workspaceFileUrl } from "./workspace-file-types";
import type { CustomTemplate } from "../letters/types";
const fake = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("./uploadImage", () => ({ uploadImage: fake.upload }));
const tenantId = "6342f430-7f39-4bf3-b59f-80ee1c65bd03";
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
const image = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
const sha = createHash("sha256").update(bytes).digest("hex");
const url = privateImageUrl(`letterheads/${tenantId}/${sha}.png`);
const scope = { tenantId, isCurrent: () => true };
const template = { id: "template", name: "Keep my wording", sectionHtml: { opening: `<p>Hello</p><img src='${image}' alt='Logo'>` } } as unknown as CustomTemplate;
beforeEach(() => {
  fake.upload.mockReset().mockResolvedValue(url);
  vi.stubGlobal("crypto", { subtle: { digest: async (_algorithm: string, data: Uint8Array) => Uint8Array.from(createHash("sha256").update(data).digest()).buffer } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { headers: { "Content-Type": "image/png" } })));
});
afterEach(() => vi.unstubAllGlobals());
it("deduplicates branding and template images, round-trips bytes and leaves originals unchanged", async () => {
  const persist = legacyAssetUploader(scope);
  const employer = { legalName: "Fictional", letterheadDataUrl: image, signatureDataUrl: image };
  expect(await importEmployerAssets(employer, persist)).toEqual({ ...employer, letterheadDataUrl: url, signatureDataUrl: url });
  const migrated = await importTemplateAssets(template, persist);
  expect(migrated.sectionHtml.opening).toContain(url); expect(migrated.sectionHtml.opening).toContain("Hello");
  expect(fake.upload).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  expect(employer.letterheadDataUrl).toBe(image); expect(template.sectionHtml.opening).toContain(image);
});
it("converts existing tenant-pinned draft images into reusable template assets", async () => {
  const source = workspaceFileUrl("47c3a124-7f09-462b-8f63-df21a8aa2938", tenantId);
  expect(await legacyAssetUploader(scope)(source, "Copied logo")).toBe(url);
  expect(fetch).toHaveBeenCalledWith(source, expect.objectContaining({ headers: { "X-Workspace-ID": tenantId }, credentials: "same-origin" }));
  expect(fake.upload).toHaveBeenCalledWith({ dataUrl: image, filename: "Copied logo" }, scope);
});
it.each(["https://external.test/image.png", privateImageUrl(`letterheads/7342f430-7f39-4bf3-b59f-80ee1c65bd03/${sha}.png`), "data:image/svg+xml;base64,YQ=="])("never fetches an unsupported or foreign image: %s", async source => {
  await expect(legacyAssetUploader(scope)(source, "Logo")).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled(); expect(fake.upload).not.toHaveBeenCalled();
});
it("preserves the source when byte verification fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("different", { headers: { "Content-Type": "image/png" } })));
  await expect(importTemplateAssets(template, legacyAssetUploader(scope))).rejects.toThrow("verification failed");
  expect(template.sectionHtml.opening).toContain(image);
});
it("rejects a wrong content-addressed receipt before fetching it", async () => {
  fake.upload.mockResolvedValue(privateImageUrl(`letterheads/${tenantId}/${"b".repeat(64)}.png`));
  await expect(legacyAssetUploader(scope)(image, "Logo")).rejects.toThrow("did not match");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not finish after its workspace or source changes", async () => {
  let current = true;
  fake.upload.mockImplementation(async () => { current = false; return url; });
  await expect(legacyAssetUploader({ tenantId, isCurrent: () => current })(image, "Logo")).rejects.toThrow("changed");
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects missing template image sources rather than dropping them", async () => {
  await expect(importTemplateAssets({ ...template, sectionHtml: { opening: "<img alt='Missing'>" } }, legacyAssetUploader(scope))).rejects.toThrow("no source");
});
