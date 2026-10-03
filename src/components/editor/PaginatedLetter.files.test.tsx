import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { PaginatedLetter } from "./PaginatedLetter";
const fake = vi.hoisted(() => ({ tenantId: "tenant-a", resolve: vi.fn(), preview: vi.fn(), destroy: vi.fn() }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ activeTenant: { id: fake.tenantId } }) }));
vi.mock("@/lib/storage/workspace-files", () => ({ resolveEvidenceFiles: fake.resolve }));
vi.mock("./paged-edit/printCss", () => ({ applyResponsivePageScale: vi.fn(), observeResponsivePageScale: () => () => {}, pagedPreviewStylesheet: () => ({}) }));
vi.mock("pagedjs", () => ({ Previewer: class { preview = fake.preview; chunker = { destroy: fake.destroy }; } }));
const image = "data:image/png;base64,aGVsbG8=";
const draft = { id: "draft", letterType: "reference", mode: "employer", sections: [], employer: {},
  context: { jurisdiction: "UK" }, evidence: [{ id: "ev", kind: "screenshot", content: "Fictional screenshot",
    filename: "fictional.png", fileId: "private-image", mimeType: "image/png" }] } as unknown as Draft;
beforeEach(() => { vi.clearAllMocks(); fake.tenantId = "tenant-a"; fake.preview.mockResolvedValue({ total: 2 }); });
afterEach(cleanup);
it("resolves private images transiently before paginating without mutating the draft", async () => {
  fake.resolve.mockResolvedValue({ ...draft, evidence: [{ ...draft.evidence![0], fileDataUrl: image }] });
  render(<PaginatedLetter draft={draft} />);
  await waitFor(() => expect(fake.preview).toHaveBeenCalledOnce());
  expect(fake.preview.mock.calls[0][0]).toContain(image);
  expect(fake.resolve).toHaveBeenCalledWith(draft, "tenant-a", expect.objectContaining({ imagesOnly: true }));
  expect(draft.evidence![0].fileDataUrl).toBeUndefined();
});
it("cancels an old workspace request and never paginates its late result", async () => {
  let completeOld!: (value: Draft) => void;
  fake.resolve.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
  fake.resolve.mockResolvedValueOnce({ ...draft, evidence: [{ ...draft.evidence![0], content: "New workspace image", fileDataUrl: image }] });
  const view = render(<PaginatedLetter draft={draft} />);
  await waitFor(() => expect(fake.resolve).toHaveBeenCalledOnce());
  const oldSignal = fake.resolve.mock.calls[0][2].signal as AbortSignal;
  fake.tenantId = "tenant-b"; view.rerender(<PaginatedLetter draft={draft} />);
  await waitFor(() => expect(fake.preview).toHaveBeenCalledOnce());
  expect(oldSignal.aborted).toBe(true);
  await act(async () => completeOld({ ...draft, evidence: [{ ...draft.evidence![0], content: "OLD WORKSPACE", fileDataUrl: image }] }));
  expect(fake.preview).toHaveBeenCalledOnce();
  expect(fake.preview.mock.calls[0][0]).not.toContain("OLD WORKSPACE");
});
it("shows a failed private read instead of a deceptively complete preview", async () => {
  fake.resolve.mockRejectedValue(new Error("File unavailable"));
  const view = render(<PaginatedLetter draft={draft} />);
  await waitFor(() => expect(view.getByText("File unavailable")).toBeInTheDocument());
  expect(fake.preview).not.toHaveBeenCalled();
});
