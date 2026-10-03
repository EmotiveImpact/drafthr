import { afterEach, expect, it, vi } from "vitest";
import { downloadBlob, downloadUrl } from "./download";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("downloads a saved file by its stable authenticated URL", () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.getAttribute("href")).toBe("/api/store/files?id=file&workspaceId=tenant");
    expect(this.download).toBe("letter.docx");
    expect(this.isConnected).toBe(true);
  });
  downloadUrl("/api/store/files?id=file&workspaceId=tenant", "letter.docx");
  expect(click).toHaveBeenCalledOnce(); expect(document.querySelector("a[download]")).toBeNull();
});
it("keeps legacy blob URLs alive for asynchronous browser downloads and cleans them up", () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL });
  downloadBlob(new Blob(["test"]), "letter.txt");
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
