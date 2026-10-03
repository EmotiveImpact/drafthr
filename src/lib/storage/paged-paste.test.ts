import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorHandle } from "pagedly";
import { handlePagedImagePaste } from "./paged-paste";
const fake = vi.hoisted(() => ({ normalize: vi.fn(), current: vi.fn(), enabled: true }));
vi.mock("../database-workspace", () => ({ workspaceFileContext: () => ({ tenantId: "tenant", isCurrent: fake.current }) }));
vi.mock("../workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => fake.enabled }));
vi.mock("./pasted-images", () => ({ normalizePastedImages: fake.normalize }));
let wrapper: HTMLDivElement, root: HTMLDivElement, handle: EditorHandle;
const html = '<p>Pasted text</p><img src="data:image/png;base64,YQ==">';
beforeEach(() => {
  vi.clearAllMocks(); fake.enabled = true; fake.current.mockReturnValue(true);
  fake.normalize.mockResolvedValue('<p>Pasted text</p><img src="/verified-private-image">');
  wrapper = document.createElement("div"); root = document.createElement("div");
  root.className = "pagedly-ce-content"; root.setAttribute("contenteditable", "true"); root.innerHTML = "<p>Original</p>";
  wrapper.append(root); document.body.append(wrapper);
  const range = document.createRange(); range.setStart(root.firstChild!.firstChild!, 8); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  handle = { insertHtml: vi.fn(), flush: vi.fn().mockResolvedValue("") } as unknown as EditorHandle;
});
afterEach(() => { wrapper.remove(); window.getSelection()?.removeAllRanges(); });
function start(isCurrent = () => true, pastedHtml = html) {
  const event = { clipboardData: { getData: () => pastedHtml }, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ClipboardEvent;
  let pending: Promise<void> | undefined;
  const handled = handlePagedImagePaste(event, { wrapper, editor: handle, isCurrent }, task => { pending = task; });
  return { handled, event, pending };
}
it("intercepts before native paste and uses the public insertion and flush methods", async () => {
  const paste = start(); expect(paste.handled).toBe(true);
  expect(paste.event.preventDefault).toHaveBeenCalledOnce(); expect(paste.event.stopPropagation).toHaveBeenCalledOnce();
  expect(handle.insertHtml).not.toHaveBeenCalled(); await paste.pending;
  expect(handle.insertHtml).toHaveBeenCalledWith('<p>Pasted text</p><img src="/verified-private-image">');
  expect(handle.flush).toHaveBeenCalledOnce();
});
it.each(["text", "selection", "readonly", "unmounted", "workspace", "instance"])("cancels asynchronous insertion after %s changes", async change => {
  let current = true;
  fake.normalize.mockImplementationOnce(async (_html, scope) => {
    expect(scope.isCurrent()).toBe(true);
    if (change === "text") root.firstChild!.textContent = "Newer text";
    if (change === "selection") window.getSelection()!.collapse(root.firstChild!.firstChild!, 1);
    if (change === "readonly") root.setAttribute("contenteditable", "false");
    if (change === "unmounted") wrapper.remove();
    if (change === "workspace") fake.current.mockReturnValue(false);
    if (change === "instance") current = false;
    expect(scope.isCurrent()).toBe(false);
    return "<p>Stale paste</p>";
  });
  await expect(start(() => current).pending).rejects.toThrow("changed");
  expect(handle.insertHtml).not.toHaveBeenCalled();
});
it("preserves the document when private image normalization fails", async () => {
  fake.normalize.mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(start().pending).rejects.toThrow("Storage unavailable");
  expect(root.innerHTML).toBe("<p>Original</p>"); expect(handle.insertHtml).not.toHaveBeenCalled();
});
it("rejects selections outside this editor before uploading", async () => {
  const outside = document.createTextNode("Outside"); document.body.append(outside);
  try {
    window.getSelection()!.collapse(outside, 1);
    await expect(start().pending).rejects.toThrow("editable letter");
    expect(fake.normalize).not.toHaveBeenCalled();
  } finally { outside.remove(); }
});
it("refuses generated non-editable content inside the letter", async () => {
  (root.firstChild as HTMLElement).setAttribute("contenteditable", "false");
  await expect(start().pending).rejects.toThrow("editable letter");
  expect(fake.normalize).not.toHaveBeenCalled(); expect(handle.insertHtml).not.toHaveBeenCalled();
});
it("refuses a selection spanning generated content even with editable endpoints", async () => {
  root.innerHTML = '<p>Before</p><p contenteditable="false">Generated footer</p><p>After</p>';
  const range = document.createRange(); range.setStart(root.firstChild!.firstChild!, 2); range.setEnd(root.lastChild!.firstChild!, 2);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  await expect(start().pending).rejects.toThrow("editable letter");
  expect(fake.normalize).not.toHaveBeenCalled();
});
it("distinguishes a failed flush from a paste that never inserted", async () => {
  vi.mocked(handle.flush).mockRejectedValueOnce(new Error("flush failed"));
  await expect(start().pending).rejects.toThrow("Pasted content was inserted");
  expect(handle.insertHtml).toHaveBeenCalledOnce();
});
it("leaves text-only and legacy paste with the existing editor", () => {
  expect(start(() => true, "<p>Text only</p>").handled).toBe(false);
  fake.enabled = false; expect(start().handled).toBe(false);
  expect(fake.normalize).not.toHaveBeenCalled();
});
it("normalizes a raw clipboard screenshot before invoking Pagedly", async () => {
  const file = new File(["fictional"], "Screenshot.png", { type: "image/png" });
  const event = { clipboardData: { getData: () => "", items: [{ kind: "file", type: "image/png", getAsFile: () => file }] }, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ClipboardEvent;
  let pending!: Promise<void>;
  expect(handlePagedImagePaste(event, { wrapper, editor: handle, isCurrent: () => true }, task => { pending = task; })).toBe(true);
  expect(handle.insertHtml).not.toHaveBeenCalled(); await pending;
  expect(fake.normalize.mock.calls[0][0]).toContain("data:image/png;base64,");
  expect(fake.normalize.mock.calls[0][0]).toContain("Screenshot.png");
  expect(handle.insertHtml).toHaveBeenCalledOnce();
});
it("captures the Page selection before a clipboard file is read", async () => {
  const file = new File(["fictional"], "Screenshot.png", { type: "image/png" });
  const event = { clipboardData: { getData: () => "", files: [file] }, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ClipboardEvent;
  let pending!: Promise<void>;
  handlePagedImagePaste(event, { wrapper, editor: handle, isCurrent: () => true }, task => { pending = task; });
  window.getSelection()!.collapse(root.firstChild!.firstChild!, 1);
  await expect(pending).rejects.toThrow("changed");
  expect(fake.normalize).not.toHaveBeenCalled(); expect(handle.insertHtml).not.toHaveBeenCalled();
});
