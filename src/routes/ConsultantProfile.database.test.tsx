import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pull: vi.fn(), save: vi.fn(), stripeStatus: vi.fn(), stripeStart: vi.fn() }));
vi.mock("@/lib/marketplaceSync", () => ({ pullProfile: mocks.pull, pushProfile: mocks.save }));
vi.mock("@/lib/consultantApi", () => ({ getStripeConnectStatus: mocks.stripeStatus, startStripeConnect: mocks.stripeStart }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { ConsultantProfile } from "./ConsultantProfile";
import { useConsultantStore, type ConsultantProfile as Profile } from "@/lib/consultantProfile";
import { setMarketplaceScope } from "@/lib/marketplace-scope";
import { beginSessionTransition, useSessionTransition } from "@/lib/session/transition";
import { toast } from "sonner";
const profile: Profile = { id: "profile", fullName: "Jane Server", initials: "JS", role: "Advisor", bio: "Sufficiently long professional biography.",
  specialty: "Review", specialties: ["Grievance"], price: 100, currency: "£", sla: "24h", availability: "this_week", rating: 0, reviews: 0,
  avatarFrom: "", avatarTo: "", photoUrl: "", payout: { stripeAccountId: null, payoutsEnabled: false }, updatedAt: 100, status: "pending_review" };
beforeEach(() => {
  vi.resetAllMocks();
  useSessionTransition.setState({ label: null, epoch: 0 });
  setMarketplaceScope(null, null); setMarketplaceScope("user", "workspace");
  mocks.stripeStatus.mockResolvedValue({ ok: true, data: { configured: false } });
});
it("waits for the database profile before initializing editable fields on direct entry", async () => {
  let resolve!: (ok: boolean) => void;
  mocks.pull.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
  render(<MemoryRouter><ConsultantProfile /></MemoryRouter>);
  expect(screen.queryByPlaceholderText("Elena Asante")).not.toBeInTheDocument();
  await act(async () => { useConsultantStore.getState().hydrateFromServer(profile); resolve(true); });
  expect(screen.getByPlaceholderText("Elena Asante")).toHaveValue("Jane Server");
});
it("does not show an empty editable form when the profile lookup fails", async () => {
  mocks.pull.mockResolvedValue(false);
  await act(async () => { render(<MemoryRouter><ConsultantProfile /></MemoryRouter>); });
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.queryByPlaceholderText("Elena Asante")).not.toBeInTheDocument();
});
it("retains failed form edits without changing the accepted profile", async () => {
  mocks.pull.mockImplementation(async () => { useConsultantStore.getState().hydrateFromServer(profile); return true; });
  mocks.save.mockResolvedValue(false);
  await act(async () => { render(<MemoryRouter><ConsultantProfile /></MemoryRouter>); });
  const name = screen.getByPlaceholderText("Elena Asante");
  fireEvent.change(name, { target: { value: "Unsaved new name" } });
  await act(async () => { fireEvent.submit(name.closest("form")!); });
  expect(name).toHaveValue("Unsaved new name");
  expect(useConsultantStore.getState().profile?.fullName).toBe("Jane Server");
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Unsaved new name" }));
  expect(screen.getByRole("button", { name: "Save profile" })).not.toBeDisabled();
});

it("releases the profile form after a cancelled logout without accepting the old save", async () => {
  let resolve!: (ok: boolean) => void;
  mocks.pull.mockImplementation(async () => { useConsultantStore.getState().hydrateFromServer(profile); return true; });
  mocks.save.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
  await act(async () => { render(<MemoryRouter><ConsultantProfile /></MemoryRouter>); });
  const name = screen.getByPlaceholderText("Elena Asante");
  fireEvent.change(name, { target: { value: "Keep these form edits" } });
  fireEvent.submit(name.closest("form")!);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  const transition = beginSessionTransition("Signing out")!;
  transition.release();
  await act(async () => { resolve(true); });
  expect(screen.getByRole("button", { name: "Save profile" })).not.toBeDisabled();
  expect(name).toHaveValue("Keep these form edits");
  expect(toast.success).not.toHaveBeenCalled();
  expect(useConsultantStore.getState().profile?.fullName).toBe("Jane Server");
});

it("releases payout onboarding after a cancelled transition and allows a new attempt", async () => {
  let resolve!: (result: unknown) => void;
  mocks.pull.mockImplementation(async () => { useConsultantStore.getState().hydrateFromServer(profile); return true; });
  mocks.stripeStatus.mockResolvedValue({ ok: true, data: { configured: true, payoutsEnabled: false } });
  mocks.stripeStart.mockReturnValueOnce(new Promise((r) => { resolve = r; }))
    .mockResolvedValue({ ok: false, error: "Retry failed", status: 503 });
  await act(async () => { render(<MemoryRouter><ConsultantProfile /></MemoryRouter>); });
  fireEvent.click(screen.getByRole("button", { name: /Connect Stripe/ }));
  expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
  const transition = beginSessionTransition("Switching workspace")!;
  transition.release();
  await act(async () => { resolve({ ok: true, data: { url: "https://stripe.invalid/discarded" } }); });
  expect(screen.getByRole("button", { name: /Connect Stripe/ })).not.toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Connect Stripe/ })); });
  expect(mocks.stripeStart).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: /Connect Stripe/ })).not.toBeDisabled();
});
