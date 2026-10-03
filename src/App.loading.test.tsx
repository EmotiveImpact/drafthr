import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { useProfileStore } from "@/lib/profile";

const state = vi.hoisted(() => ({
  status: { phase: "loading", tenantId: "tenant_1", saving: 0, failed: 0, conflicts: 0, importCount: 0 },
  initialize: vi.fn(),
  seenTour: true,
}));
vi.mock("@/lib/auth", () => ({
  AUTH_ENABLED: true,
  useAuth: () => ({ isLoaded: true, user: { id: "user_1" }, activeTenant: { id: "tenant_1", name: "Test", role: "owner" } }),
}));
vi.mock("@/lib/auth/Protected", () => ({ Protected: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("@/routes/Home", () => ({ Home: () => <h1>Workspace dashboard</h1> }));
vi.mock("@/lib/onboarding", () => ({ hasSeenTour: () => state.seenTour }));
vi.mock("@/components/onboarding/OnboardingTour", () => ({ OnboardingTour: () => <div>Workspace tour</div> }));
vi.mock("@/lib/storage/migrate", () => ({ migrateEmployerImages: async () => null }));
vi.mock("@/lib/dual-write", async (original) => ({ ...await original<object>(), isDualWriteEnabled: () => false }));
vi.mock("@/lib/database-drafts", async (original) => ({
  ...await original<object>(),
  isDatabaseDraftsEnabled: () => true,
  initializeDatabaseDrafts: state.initialize,
  useDatabaseDraftStatus: () => state.status,
}));

beforeEach(() => {
  state.status = { phase: "loading", tenantId: "tenant_1", saving: 0, failed: 0, conflicts: 0, importCount: 0 };
  state.initialize.mockClear();
  state.seenTour = true;
  useProfileStore.setState((s) => ({ profile: { ...s.profile, setupComplete: false } }));
});

it("keeps database bootstrap in the viewport loader, then mounts the shell and content together", () => {
  const view = render(<MemoryRouter initialEntries={["/hr"]}><App /></MemoryRouter>);
  expect(screen.getByRole("status", { name: "Loading workspace" })).toHaveAttribute("data-scope", "viewport");
  expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  expect(screen.queryByText("Workspace dashboard")).not.toBeInTheDocument();
  expect(state.initialize).toHaveBeenCalledWith("tenant_1");
  state.status = { ...state.status, phase: "ready" };
  view.rerender(<MemoryRouter initialEntries={["/hr"]}><App /></MemoryRouter>);
  expect(screen.getByTestId("shell")).toContainElement(screen.getByText("Workspace dashboard"));
  expect(screen.queryByRole("status", { name: "Loading workspace" })).not.toBeInTheDocument();
});

it("does not paint a ready workspace for the wrong tenant while switching", () => {
  state.status = { ...state.status, phase: "ready", tenantId: "previous_tenant" };
  render(<MemoryRouter initialEntries={["/hr"]}><App /></MemoryRouter>);
  expect(screen.getByRole("status", { name: "Loading workspace" })).toHaveAttribute("data-scope", "viewport");
  expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
});

it("waits for workspace setup to finish before mounting the tour", async () => {
  state.status = { ...state.status, phase: "ready" };
  state.seenTour = false;
  render(<MemoryRouter initialEntries={["/hr"]}><App /></MemoryRouter>);
  expect(screen.queryByText("Workspace tour")).not.toBeInTheDocument();
  await act(async () => { useProfileStore.getState().markSetupComplete(); });
  expect(await screen.findByText("Workspace tour")).toBeInTheDocument();
});
