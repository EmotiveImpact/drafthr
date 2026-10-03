import { beforeEach, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { renderLetterPackBlob } from "./pack";
const renderers = vi.hoisted(() => ({ pdf: vi.fn(), docx: vi.fn() }));
vi.mock("./pdf", () => ({ renderLetterPdfBlob: renderers.pdf, filenameFor: () => "letter.pdf" }));
vi.mock("./docx", () => ({ renderLetterDocxBlob: renderers.docx, docxFilenameFor: () => "letter.docx" }));
beforeEach(() => {
  vi.clearAllMocks();
  renderers.pdf.mockResolvedValue(new Blob(["pdf"]));
  renderers.docx.mockResolvedValue(new Blob(["docx"]));
});
it("rejects a failed PDF instead of silently creating a partial ZIP", async () => {
  renderers.pdf.mockRejectedValue(new Error("PDF unavailable"));
  await expect(renderLetterPackBlob({ evidence: [] } as unknown as Draft)).rejects.toThrow("PDF unavailable");
});
it("rejects empty rendered documents", async () => {
  renderers.docx.mockResolvedValue(new Blob());
  await expect(renderLetterPackBlob({ evidence: [] } as unknown as Draft)).rejects.toThrow("Both PDF and DOCX");
});
it("requires private evidence bytes before rendering a self-contained pack", async () => {
  await expect(renderLetterPackBlob({ evidence: [{ id: "ev", fileId: "private-id", filename: "proof.txt" }] } as unknown as Draft))
    .rejects.toThrow("Evidence has not been loaded");
  expect(renderers.pdf).not.toHaveBeenCalled();
});
it("does not silently skip malformed legacy evidence", async () => {
  await expect(renderLetterPackBlob({ evidence: [{ id: "ev", fileDataUrl: "not-a-data-url" }] } as unknown as Draft))
    .rejects.toThrow("Evidence could not be read");
  expect(renderers.pdf).not.toHaveBeenCalled();
});
