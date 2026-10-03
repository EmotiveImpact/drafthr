import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { handleDatabaseImagePaste, insertPastedHtmlImages, normalizePastedImages } from "./pasted-images";
import { privateImageUrl } from "./privateImageUrl";
import { workspaceFileUrl } from "./workspace-file-types";
const fake = vi.hoisted(() => ({ persist: vi.fn(), current: vi.fn(), enabled: true }));
vi.mock("../database-workspace", () => ({ workspaceFileContext: () => ({ tenantId: "6342f430-7f39-4bf3-b59f-80ee1c65bd03", isCurrent: fake.current }) }));
vi.mock("../workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => fake.enabled }));
vi.mock("./legacy-asset-import", () => ({ legacyAssetUploader: (scope: { isCurrent: () => boolean }) => async (src: string, name: string) => {
  if (!scope.isCurrent()) throw new Error("Scope changed");
  return fake.persist(src, name);
} }));
const tenantId = "6342f430-7f39-4bf3-b59f-80ee1c65bd03";
const source = "data:image/png;base64,iVBORw0KGgo=";
const privateUrl = privateImageUrl(`letterheads/${tenantId}/${"a".repeat(64)}.png`);
const html = `<p>Before <strong>bold</strong></p><img src="${source}" alt="Fictional" onerror="alert(1)"><p>After</p>`;
let editor: Editor;
beforeEach(() => {
  vi.clearAllMocks(); fake.enabled = true; fake.current.mockReturnValue(true); fake.persist.mockResolvedValue(privateUrl);
  editor = new Editor({ extensions: [StarterKit, Image.configure({ allowBase64: true })], content: "<p>Original</p>" });
  editor.commands.setTextSelection(9);
});
afterEach(() => editor.destroy());
it("stores embedded images before inserting the whole sanitized formatted paste", async () => {
  let finish!: (url: string) => void;
  fake.persist.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = insertPastedHtmlImages(editor.view, html);
  expect(editor.getHTML()).toBe("<p>Original</p>");
  finish(privateUrl); await pending;
  const saved = editor.getHTML();
  expect(saved).toContain("Original"); expect(saved).toContain("<strong>bold</strong>"); expect(saved).toContain("After");
  expect(saved).toContain("/api/upload/image?"); expect(saved).not.toContain("data:image"); expect(saved).not.toContain("onerror");
});
it.each(["https://external.test/a.png", "blob:missing", "file:///image.png", "data:image/svg+xml;base64,PHN2Zy8+", "", workspaceFileUrl("47c3a124-7f09-462b-8f63-df21a8aa2938", "7342f430-7f39-4bf3-b59f-80ee1c65bd03")])("rejects an unsafe image before uploading earlier images: %s", async src => {
  await expect(insertPastedHtmlImages(editor.view, `${html}<img src="${src}">`)).rejects.toThrow("pasted image");
  expect(fake.persist).not.toHaveBeenCalled(); expect(editor.getHTML()).toBe("<p>Original</p>");
});
it.each(["edit", "selection", "readonly", "destroy", "workspace"])("never inserts at stale positions after %s during upload", async change => {
  fake.persist.mockImplementationOnce(async () => {
    if (change === "edit") editor.commands.setContent("<p>Newer work</p>");
    if (change === "selection") editor.commands.setTextSelection(1);
    if (change === "readonly") editor.setEditable(false);
    if (change === "destroy") editor.destroy();
    if (change === "workspace") fake.current.mockReturnValue(false);
    return privateUrl;
  });
  await expect(insertPastedHtmlImages(editor.view, html)).rejects.toThrow("changed");
  if (change !== "destroy") expect(editor.getHTML()).not.toContain("<img");
});
it("leaves text and selection untouched if any private upload fails", async () => {
  fake.persist.mockRejectedValueOnce(new Error("Storage unavailable"));
  const selection = editor.state.selection;
  await expect(insertPastedHtmlImages(editor.view, html)).rejects.toThrow("Storage unavailable");
  expect(editor.getHTML()).toBe("<p>Original</p>"); expect(editor.state.selection.eq(selection)).toBe(true);
});
it("normalizes copied private file and asset references through the same bounded uploader", async () => {
  const file = workspaceFileUrl("47c3a124-7f09-462b-8f63-df21a8aa2938", tenantId);
  const normalized = await normalizePastedImages(`<img src="${file}"><img src="${privateUrl}">`, { tenantId, isCurrent: () => true });
  expect(fake.persist).toHaveBeenCalledTimes(2);
  expect(normalized).not.toContain("/api/store/files"); expect(normalized).toContain("/api/upload/image?");
});
it("canonicalizes only same-origin absolute private URLs before uploading", async () => {
  await normalizePastedImages(`<img src="${window.location.origin}${privateUrl}">`, { tenantId, isCurrent: () => true });
  expect(fake.persist).toHaveBeenCalledWith(privateUrl, "Pasted image 1");
  fake.persist.mockClear();
  await expect(normalizePastedImages(`<img src="${window.location.origin}${privateUrl}#fragment">`, { tenantId, isCurrent: () => true })).rejects.toThrow("pasted image");
  expect(fake.persist).not.toHaveBeenCalled();
});
it("handles rich HTML before the clipboard's duplicate image-file representation", async () => {
  const event = { clipboardData: { getData: () => html, items: [{ kind: "file", type: "image/png" }] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
  let pending!: Promise<void>;
  expect(handleDatabaseImagePaste(editor.view, event, result => { pending = result; })).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce(); await pending;
  expect(editor.getText()).toContain("Before bold"); expect(editor.getText()).toContain("After");
});
it("does not take over text-only or legacy-mode paste", () => {
  const event = { clipboardData: { getData: () => "<p>Text only</p>" }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
  const report = vi.fn(); expect(handleDatabaseImagePaste(editor.view, event, report)).toBe(false);
  fake.enabled = false;
  expect(handleDatabaseImagePaste(editor.view, { ...event, clipboardData: { getData: () => html } } as unknown as ClipboardEvent, report)).toBe(false);
  expect(report).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it("bounds clipboard size and image count before uploading", async () => {
  const scope = { tenantId, isCurrent: () => true };
  await expect(normalizePastedImages("x".repeat(12 * 1024 * 1024 + 1), scope)).rejects.toThrow("smaller selection");
  await expect(normalizePastedImages(`<img src="${source}">`.repeat(21), scope)).rejects.toThrow("20 images");
  expect(fake.persist).not.toHaveBeenCalled();
});
