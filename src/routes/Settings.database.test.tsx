import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import { useProfileStore } from "@/lib/profile";

const fake = vi.hoisted(() => ({ flush: vi.fn(), current: true, error: vi.fn(), asset: vi.fn() }));
vi.mock("@/lib/database-workspace", () => ({ flushDatabaseWorkspace: fake.flush, workspaceFileContext: () => ({ tenantId: "tenant", isCurrent: () => fake.current }) }));
vi.mock("@/components/ds", () => ({ PageHeader: () => null, ImageUploader: () => null }));
vi.mock("@/components/WorkspaceMembersCard", () => ({ WorkspaceMembersCard: () => null }));
vi.mock("@/components/AuditLogsCard", () => ({ AuditLogsCard: () => null }));
vi.mock("@/components/SecurityCard", () => ({ SecurityCard: () => null }));
vi.mock("sonner", () => ({ toast: { error: fake.error } }));
vi.mock("@/lib/storage/legacy-asset-import", () => ({ importEmployerAssets: fake.asset, legacyAssetUploader: () => vi.fn() }));
const original = structuredClone(useProfileStore.getState().profile);
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.clearAllMocks(); fake.current = true; fake.flush.mockResolvedValue(true); fake.asset.mockImplementation(async employer => employer);
  vi.stubEnv("VITE_DRAFTHR_DATABASE_WORKSPACE", "true");
  useProfileStore.setState({ profile: { ...structuredClone(original), role: "employer", credits: 11, workspaceRole: "drafter" } });
  vi.stubGlobal("confirm", vi.fn(() => true)); vi.stubGlobal("alert", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const view = () => render(<Theme><MemoryRouter><Settings /></MemoryRouter></Theme>);
it("disables destructive device clearing and hides simulated permissions in database mode", () => {
  const screen = view();
  expect(screen.getByRole("button", { name: "Clear all my data on this device" })).toBeDisabled();
  expect(screen.queryByText("Role (local simulation)")).not.toBeInTheDocument();
  expect(screen.getByText(/saved to your workspace database/)).toBeInTheDocument();
});
it("waits for durable acknowledgement before showing Saved", async () => {
  let resolve!: (saved: boolean) => void; fake.flush.mockImplementation(() => new Promise(done => { resolve = done; }));
  const screen = view(); fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => resolve(true));
  expect(screen.getByText("Saved")).toBeInTheDocument();
});
it.each(["failed save", "changed workspace"])("never claims success after %s", async reason => {
  fake.flush.mockImplementation(async () => { if (reason === "changed workspace") fake.current = false; return reason !== "failed save"; });
  const screen = view(); fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fake.error).toHaveBeenCalledOnce()); expect(screen.queryByText("Saved")).not.toBeInTheDocument();
});
it("validates profile import as one update without adopting supplied credits or permissions", async () => {
  const screen = view();
  const file = new File(["{}"], "profile.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify({ personal: { legalName: "Fictional import" }, credits: 999, workspaceRole: "owner" }) });
  fireEvent.change(screen.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(fake.flush).toHaveBeenCalledOnce());
  expect(useProfileStore.getState().profile).toMatchObject({ personal: { legalName: "Fictional import" }, credits: 11, workspaceRole: "drafter" });
  expect(screen.getByText("Saved")).toBeInTheDocument();
});
it("keeps the current profile unchanged if imported branding cannot be stored", async () => {
  fake.asset.mockRejectedValue(new Error("Image storage unavailable"));
  const before = structuredClone(useProfileStore.getState().profile), screen = view();
  const file = new File(["{}"], "profile.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify({ personal: { legalName: "Must not apply" }, employer: { letterheadDataUrl: "data:image/png;base64,aGVsbG8=" } }) });
  fireEvent.change(screen.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(useProfileStore.getState().profile).toEqual(before); expect(fake.flush).not.toHaveBeenCalled();
});
