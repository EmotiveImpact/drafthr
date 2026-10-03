import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageUploader } from "./ImageUploader";
const fake = vi.hoisted(() => ({ upload: vi.fn(), scope: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/storage/uploadImage", () => ({ uploadImage: fake.upload, imageUploadScope: fake.scope }));
vi.mock("sonner", () => ({ toast: { error: fake.error } }));
const data = "data:image/png;base64,aGVsbG8=";
let reader: { result: string; onload?: () => void; onerror?: () => void };
beforeEach(() => {
  vi.clearAllMocks(); fake.scope.mockReturnValue({ tenantId: "original", isCurrent: () => true });
  vi.stubGlobal("FileReader", class { result = data; onload?: () => void; onerror?: () => void;
    constructor() { reader = this; } readAsDataURL() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const pick = (container: HTMLElement) => fireEvent.change(container.querySelector("input")!, { target: { files: [new File(["image"], "x.png", { type: "image/png" })] } });
it("captures the workspace before asynchronous file reading and preserves it during upload", async () => {
  const change = vi.fn(), scope = fake.scope(); fake.upload.mockResolvedValue("/private-image");
  const view = render(<ImageUploader onChange={change} />); pick(view.container);
  expect(view.getByRole("button", { name: /Uploading/ })).toBeDisabled();
  await act(async () => reader.onload?.());
  expect(fake.upload).toHaveBeenCalledWith({ dataUrl: data, filename: "x.png" }, scope);
  expect(change).toHaveBeenCalledWith("/private-image");
});
it("ignores late uploads after the form unmounts", async () => {
  let finish!: (url: string) => void;
  fake.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const change = vi.fn(), view = render(<ImageUploader onChange={change} />); pick(view.container);
  await act(async () => { void reader.onload?.(); }); await waitFor(() => expect(fake.upload).toHaveBeenCalledOnce());
  view.unmount(); await act(async () => finish("/old-workspace-image"));
  expect(change).not.toHaveBeenCalled();
});
it("does not apply a receipt after the workspace changes", async () => {
  let current = true;
  fake.scope.mockReturnValue({ tenantId: "original", isCurrent: () => current });
  fake.upload.mockImplementation(async () => { current = false; return "/old-workspace-image"; });
  const change = vi.fn(), view = render(<ImageUploader onChange={change} />); pick(view.container);
  await act(async () => reader.onload?.()); expect(change).not.toHaveBeenCalled();
});
it("preserves the existing image on read failure and enables another attempt", async () => {
  const change = vi.fn(), view = render(<ImageUploader value="/existing" onChange={change} />); pick(view.container);
  act(() => reader.onerror?.());
  expect(view.getByRole("button", { name: "Replace" })).toBeEnabled();
  expect(change).not.toHaveBeenCalled(); expect(fake.error).toHaveBeenCalledOnce();
});
