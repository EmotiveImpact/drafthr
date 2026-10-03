import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EvidenceUploadRecovery } from "./EvidenceUploadRecovery";
const fake = vi.hoisted(() => ({ find: vi.fn(), attach: vi.fn() }));
vi.mock("@/lib/storage/evidence-upload-recovery", () => ({ findEvidenceUploads: fake.find }));
beforeEach(() => {
  vi.clearAllMocks(); fake.attach.mockResolvedValue(undefined);
  fake.find.mockResolvedValue({ files: [{ id: "file", filename: "fictional.txt", size: 9, createdAt: 1, status: "pending" }], attach: fake.attach });
});
afterEach(cleanup);
it("checks only on request and waits for a confirmed save before claiming success", async () => {
  render(<EvidenceUploadRecovery draftId="draft" />);
  expect(fake.find).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Missing an uploaded file?"));
  fireEvent.click(screen.getByRole("button", { name: "Check uploaded files" }));
  const attach = await screen.findByRole("button", { name: "Attach fictional.txt" });
  let finish!: () => void;
  fake.attach.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  fireEvent.click(attach);
  expect(attach).toBeDisabled();
  expect(screen.queryByText("Evidence attached and saved to the database.")).not.toBeInTheDocument();
  await act(async () => finish());
  expect(screen.getByRole("status")).toHaveTextContent("saved to the database");
  expect(screen.queryByRole("button", { name: "Attach fictional.txt" })).not.toBeInTheDocument();
});
it("keeps the retry action and shows the actual failure when saving fails", async () => {
  render(<EvidenceUploadRecovery draftId="draft" />);
  fireEvent.click(screen.getByText("Missing an uploaded file?"));
  fireEvent.click(screen.getByRole("button", { name: "Check uploaded files" }));
  fake.attach.mockRejectedValueOnce(new Error("Save not confirmed"));
  fireEvent.click(await screen.findByRole("button", { name: "Attach fictional.txt" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Save not confirmed"));
  expect(screen.getByRole("button", { name: "Attach fictional.txt" })).toBeEnabled();
});
it("invalidates a recovery request when its letter is unmounted", async () => {
  const view = render(<EvidenceUploadRecovery draftId="draft" />);
  fireEvent.click(screen.getByText("Missing an uploaded file?"));
  fireEvent.click(screen.getByRole("button", { name: "Check uploaded files" }));
  await screen.findByRole("button", { name: "Attach fictional.txt" });
  const active = fake.find.mock.calls[0][1]; expect(active()).toBe(true);
  view.unmount(); expect(active()).toBe(false);
});
