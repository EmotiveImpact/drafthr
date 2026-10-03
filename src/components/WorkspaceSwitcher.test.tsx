import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SessionTransitionBoundary } from "./SessionTransitionBoundary";
import * as transitions from "@/lib/session/transition";

const fake = vi.hoisted(() => ({ suspend: vi.fn(), stop: vi.fn(), clear: vi.fn(), resume: vi.fn(), assign: vi.fn() }));
vi.mock("@/lib/auth", () => {
  const activeTenant = { id: "tenantA", name: "Workspace A" };
  return { AUTH_ENABLED: true, useAuth: () => ({ activeTenant }) };
});
vi.mock("@/lib/database-workspace", () => ({ suspendDatabaseWorkspaceForTransition: fake.suspend, stopDatabaseWorkspace: fake.stop }));
vi.mock("@/lib/database-drafts", () => ({ isDatabaseDraftsEnabled: () => false }));
vi.mock("@/lib/session/clearLocalData", () => ({ clearTenantScopedLocalData: fake.clear }));
vi.mock("react-router-dom", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: () => ({ state: "expanded", isMobile: false }), SidebarMenuButton: ({ children }: { children: ReactNode }) => <button>{children}</button> }));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { DropdownMenu: Container, DropdownMenuContent: Container, DropdownMenuLabel: Container, DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Container, DropdownMenuItem: ({ children, onSelect, disabled }: { children: ReactNode; onSelect?: () => void; disabled?: boolean }) => <button onClick={onSelect} disabled={disabled}>{children}</button> };
});
const originalLocation = window.location;
let release: (() => void) | undefined;
let switchResponse: () => Promise<Response>;
beforeEach(() => {
  vi.clearAllMocks(); fake.suspend.mockResolvedValue(fake.resume);
  const begin = transitions.beginSessionTransition;
  vi.spyOn(transitions, "beginSessionTransition").mockImplementation(label => {
    const result = begin(label); if (result) release = result.release; return result;
  });
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign: fake.assign } });
  switchResponse = async () => Response.json({ tenant: { id: "tenantB" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/switch") ? switchResponse() : Response.json({ workspaces: [
    { id: "tenantA", name: "Workspace A", role: "owner", isActive: true }, { id: "tenantB", name: "Workspace B", role: "owner", isActive: false },
  ] })));
});
afterEach(() => {
  release?.(); release = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});
async function start() {
  await act(async () => { render(<SessionTransitionBoundary><WorkspaceSwitcher /></SessionTransitionBoundary>); });
  await act(async () => { screen.getByRole("button", { name: "Workspace Bowner" }).click(); });
}
it("waits for the drained workspace and keeps the editing lock through successful navigation", async () => {
  let finish!: (resume: () => void) => void;
  fake.suspend.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await start();
  expect(screen.getByRole("status")).toHaveTextContent("switching workspace");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/switch"))).toBe(false);
  await act(async () => { finish(fake.resume); });
  expect(fake.stop).toHaveBeenCalledOnce(); expect(fake.assign).toHaveBeenCalledWith("/");
  expect(fake.clear).toHaveBeenCalledWith({ keepProfile: true }); expect(fake.resume).not.toHaveBeenCalled();
  expect(transitions.useSessionTransition.getState().label).toBeTruthy();
});
it("restores editing after a definitive denied switch without clearing any local data", async () => {
  switchResponse = async () => Response.json({ error: "No access" }, { status: 403 });
  await start();
  expect(fake.resume).toHaveBeenCalledOnce(); expect(fake.clear).not.toHaveBeenCalled();
  expect(fake.assign).not.toHaveBeenCalled(); expect(transitions.useSessionTransition.getState().label).toBeNull();
});
it("preserves recovery and reloads rather than resuming after a lost switch response", async () => {
  switchResponse = async () => { throw new Error("response lost"); };
  await start();
  expect(fake.stop).toHaveBeenCalledOnce(); expect(fake.clear).not.toHaveBeenCalled();
  expect(fake.resume).not.toHaveBeenCalled(); expect(fake.assign).toHaveBeenCalledWith("/");
});
it("stops the old coordinator before organization reauthentication", async () => {
  switchResponse = async () => Response.json({ code: "organization_authentication_required", signInUrl: "/sign-in?organization_id=org_test" }, { status: 403 });
  await start();
  expect(fake.stop).toHaveBeenCalledOnce(); expect(fake.resume).not.toHaveBeenCalled();
  expect(fake.assign).toHaveBeenCalledWith("/sign-in?organization_id=org_test");
});
