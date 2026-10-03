import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { useDraftStore } from "@/lib/store";
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ activeTenant: { id: "tenant-test" } }) }));
afterEach(cleanup);
it("renders private evidence size and authenticated download without inline file data", () => {
  const id = useDraftStore.getState().createDraft("reference", {}, "employer");
  useDraftStore.getState().setEvidence(id, [{ id: "evidence", kind: "document", filename: "fictional.txt", content: "",
    fileId: "85f0387e-28dc-4a92-8e9c-d28cfaf115a0", fileSize: 196, mimeType: "text/plain", uploadedAt: 1, includeVerbatim: false }]);
  render(<MemoryRouter><EvidenceDrawer draft={useDraftStore.getState().drafts[id]} editor={null} open pinned onOpenChange={() => {}} /></MemoryRouter>);
  expect(screen.getByText("fictional.txt")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download original" })).toHaveAttribute("href", expect.stringContaining("workspaceId=tenant-test"));
  expect(screen.getByText(/196/)).toBeInTheDocument();
});
