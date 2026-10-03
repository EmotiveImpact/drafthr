import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { insertInlineEvidenceImage } from "./inline-evidence";
import { sanitizeLetterHtml } from "../sanitize";
import { inlineEvidenceHtml } from "../evidence-html";
import { parseWorkspaceFileUrl, workspaceFileUrl } from "./workspace-file-types";
import type { EvidenceItem } from "../letters/types";

const fake = vi.hoisted(() => ({ store: vi.fn(), current: vi.fn(), setEvidence: vi.fn(), getState: vi.fn() }));
const tenant = "6342f430-7f39-4bf3-b59f-80ee1c65bd03", id = "47c3a124-7f09-462b-8f63-df21a8aa2938";
vi.mock("../database-workspace", () => ({ workspaceFileContext: () => ({ tenantId: "6342f430-7f39-4bf3-b59f-80ee1c65bd03", isCurrent: fake.current }) }));
vi.mock("./workspace-files", () => ({ storeEvidenceFile: fake.store }));
vi.mock("../workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => true }));
vi.mock("../store", () => ({ useDraftStore: { getState: fake.getState } }));
let editor: Editor;
const file = new File(["fictional"], "test.png", { type: "image/png" });
beforeEach(() => {
  vi.clearAllMocks(); fake.current.mockReturnValue(true);
  fake.store.mockResolvedValue({ fileId: id, fileSize: 9, mimeType: "image/png" });
  fake.getState.mockReturnValue({ drafts: { draft: { evidence: [] } }, setEvidence: fake.setEvidence });
  editor = new Editor({ extensions: [StarterKit, Image.configure({ allowBase64: true })], content: "<p>Original</p>" });
});
afterEach(() => editor.destroy());
it("persists only references and round-trips the private image through Tiptap and sanitization", async () => {
  await insertInlineEvidenceImage(editor.view, "draft", file);
  const item = fake.setEvidence.mock.calls[0][1][0] as EvidenceItem;
  expect(item.fileDataUrl).toBeUndefined(); expect(item.fileId).toBe(id); expect(item.displayMode).toBe("inline");
  const html = sanitizeLetterHtml(editor.getHTML());
  const root = document.createElement("div"); root.innerHTML = html;
  expect(root.querySelector("img")?.getAttribute("src")).toBe(workspaceFileUrl(id, tenant));
  editor.commands.setContent(inlineEvidenceHtml({ ...item, content: "Caption <escaped>" }, tenant));
  expect(editor.getHTML()).toContain("Caption &lt;escaped&gt;");
  expect(editor.getHTML()).not.toContain("data:image");
});
it.each([
  "https://evil.test/image.png", "//evil.test/image.png", "/api/auth/sign-out",
  `${workspaceFileUrl(id, tenant)}&id=${id}`, `${workspaceFileUrl(id, tenant)}#fragment`,
  `/api/store/files?id=${id}&other=${tenant}`, `${workspaceFileUrl(id, tenant)}&download=1`,
  "data:image/svg+xml;base64,PHN2Zy8+",
])("rejects unsafe inline source %s", src => {
  expect(parseWorkspaceFileUrl(src)).toBeNull();
  expect(sanitizeLetterHtml(`<p>Keep</p><img src="${src}" />`)).not.toContain("<img");
});
it("does not insert or attach after switching workspace", async () => {
  fake.current.mockReturnValue(false);
  await expect(insertInlineEvidenceImage(editor.view, "draft", file)).rejects.toThrow("Workspace changed");
  expect(fake.setEvidence).not.toHaveBeenCalled(); expect(editor.getHTML()).not.toContain("img");
});
it("keeps the uploaded evidence but never uses stale document positions", async () => {
  fake.store.mockImplementation(async () => {
    editor.commands.setContent("<p>Newer text</p>");
    return { fileId: id, mimeType: "image/png" };
  });
  await expect(insertInlineEvidenceImage(editor.view, "draft", file, 8)).rejects.toThrow("editor changed");
  expect(fake.setEvidence).toHaveBeenCalledOnce(); expect(editor.getHTML()).toBe("<p>Newer text</p>");
});
it.each(["destroyed", "readonly"])("does not dispatch into a %s editor after upload", async mode => {
  fake.store.mockImplementation(async () => {
    if (mode === "destroyed") editor.destroy(); else editor.setEditable(false);
    return { fileId: id, mimeType: "image/png" };
  });
  await expect(insertInlineEvidenceImage(editor.view, "draft", file)).rejects.toThrow("editor changed");
  expect(fake.setEvidence).toHaveBeenCalledOnce();
});
it("does not mutate the draft if uploading fails", async () => {
  fake.store.mockRejectedValue(new Error("Storage unavailable"));
  await expect(insertInlineEvidenceImage(editor.view, "draft", file)).rejects.toThrow("Storage unavailable");
  expect(fake.setEvidence).not.toHaveBeenCalled(); expect(editor.getHTML()).toBe("<p>Original</p>");
});
