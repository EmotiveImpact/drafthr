import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveDraftAsTemplate } from "./save-draft-template";
import { useDraftStore } from "./store";
import type { Draft } from "./letters/types";
import { workspaceFileUrl } from "./storage/workspace-file-types";
import { privateImageUrl } from "./storage/privateImageUrl";

const fake = vi.hoisted(() => ({ current: true, savedDraft: vi.fn(), confirm: vi.fn(), asset: vi.fn() }));
vi.mock("./database-workspace", () => ({ workspaceFileContext: () => ({ tenantId: "6342f430-7f39-4bf3-b59f-80ee1c65bd03", isCurrent: () => fake.current }),
  savedWorkspaceDraft: fake.savedDraft, confirmSavedWorkspaceTemplate: fake.confirm }));
vi.mock("./storage/legacy-asset-import", async () => {
  const actual = await vi.importActual<typeof import("./storage/legacy-asset-import")>("./storage/legacy-asset-import");
  return { ...actual, legacyAssetUploader: () => fake.asset };
});
const tenant = "6342f430-7f39-4bf3-b59f-80ee1c65bd03", templateId = "c1299627-e5b9-4327-a206-c0cb6dd1eb95";
const fileUrl = workspaceFileUrl("47c3a124-7f09-462b-8f63-df21a8aa2938", tenant);
const assetUrl = privateImageUrl(`letterheads/${tenant}/${"a".repeat(64)}.png`);
const draft = { id: "draft_source", mode: "employer", letterType: "offer", context: { jurisdiction: "UK" }, answers: {}, employer: {}, employee: {},
  sections: [{ id: "s1", sectionId: "opening", title: "Opening", html: `<p>Fictional clause</p><img src="${fileUrl}">`, versions: [], status: "edited" }], createdAt: 1, updatedAt: 2 } as unknown as Draft;
const input = () => ({ draft: useDraftStore.getState().drafts[draft.id], templateId, name: "Reusable wording" });
beforeEach(() => {
  vi.stubEnv("VITE_DRAFTHR_DATABASE_WORKSPACE", "true"); fake.current = true;
  fake.savedDraft.mockReset().mockResolvedValue({ revision: 1 }); fake.confirm.mockReset().mockResolvedValue(undefined);
  fake.asset.mockReset().mockResolvedValue(assetUrl);
  useDraftStore.setState({ drafts: { [draft.id]: structuredClone(draft) }, customTemplates: {} });
});
afterEach(() => vi.unstubAllEnvs());
it("copies private images to reusable assets before saving and acknowledges the exact template", async () => {
  fake.confirm.mockImplementation(async template => { expect(useDraftStore.getState().customTemplates[templateId]).toEqual(template); });
  const result = await saveDraftAsTemplate(input());
  expect(fake.savedDraft).toHaveBeenCalledWith(draft);
  expect(fake.asset).toHaveBeenCalledWith(fileUrl, "Template image");
  expect(result.sectionHtml.opening).toContain(assetUrl); expect(JSON.stringify(result)).not.toContain("/api/store/files?");
  expect(fake.confirm).toHaveBeenCalledWith(result);
  expect(useDraftStore.getState().drafts[draft.id].sections[0].html).toContain(fileUrl);
  // A newly created draft no longer needs the source draft's evidence metadata.
  useDraftStore.setState({ drafts: {} });
  const newId = useDraftStore.getState().createDraftFromCustomTemplate(templateId)!;
  expect(useDraftStore.getState().drafts[newId].sections.find(s => s.sectionId === "opening")?.html).toContain(assetUrl);
});
it("does not enqueue a template after source edits during asset preparation", async () => {
  fake.asset.mockImplementation(async () => {
    useDraftStore.setState({ drafts: { [draft.id]: { ...draft, title: "Newer edit" } } }); return assetUrl;
  });
  await expect(saveDraftAsTemplate(input())).rejects.toThrow("draft changed");
  expect(useDraftStore.getState().customTemplates).toEqual({}); expect(fake.confirm).not.toHaveBeenCalled();
});
it.each([
  '<span data-fig-id="e1" class="figure-ref">[See Fig 1]</span>',
  "<span class='attachment-ref' data-att-id='e2'>[See Attachments]</span>",
])("rejects draft-specific evidence references without changing the source: %s", async reference => {
  const source = structuredClone(draft);
  source.sections[0].html += reference;
  useDraftStore.setState({ drafts: { [draft.id]: source } });
  await expect(saveDraftAsTemplate(input())).rejects.toThrow("Replace those references with reusable wording");
  expect(useDraftStore.getState().drafts[draft.id]).toEqual(source);
  expect(useDraftStore.getState().customTemplates).toEqual({});
  expect(fake.asset).not.toHaveBeenCalled();
  expect(fake.savedDraft).not.toHaveBeenCalled();
});
it("rejects changed workspaces or closed editors before committing", async () => {
  fake.asset.mockImplementation(async () => { fake.current = false; return assetUrl; });
  await expect(saveDraftAsTemplate(input())).rejects.toThrow("Workspace or editor changed");
  expect(useDraftStore.getState().customTemplates).toEqual({});
  fake.current = true;
  await expect(saveDraftAsTemplate({ ...input(), isCurrent: () => false })).rejects.toThrow("Workspace or editor changed");
});
it("keeps one pending template ID on failed confirmation and reuses it on retry", async () => {
  fake.confirm.mockRejectedValueOnce(new Error("Not confirmed"));
  await expect(saveDraftAsTemplate(input())).rejects.toThrow("Not confirmed");
  const createdAt = useDraftStore.getState().customTemplates[templateId].createdAt;
  await saveDraftAsTemplate(input());
  expect(Object.keys(useDraftStore.getState().customTemplates)).toEqual([templateId]);
  expect(useDraftStore.getState().customTemplates[templateId].createdAt).toBe(createdAt);
});
it("registers a template-source link in the same local update and never overwrites other draft changes", async () => {
  fake.confirm.mockImplementation(async template => {
    expect(useDraftStore.getState().drafts[draft.id].templateSourceId).toBe(template.id);
  });
  await saveDraftAsTemplate({ ...input(), linkSource: true });
  expect(useDraftStore.getState().drafts[draft.id].sections).toEqual(draft.sections);
});
it("does not overwrite a concurrently edited template", async () => {
  const first = await saveDraftAsTemplate(input());
  fake.asset.mockImplementation(async () => {
    useDraftStore.setState({ customTemplates: { [templateId]: { ...first, name: "Newer name" } } }); return assetUrl;
  });
  await expect(saveDraftAsTemplate(input())).rejects.toThrow("template changed");
  expect(useDraftStore.getState().customTemplates[templateId].name).toBe("Newer name");
});
