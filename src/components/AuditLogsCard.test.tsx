import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ tenant: { id: "tenant_a", role: "admin" }, success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ activeTenant: state.tenant, user: { id: "account_a" } }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: state.info } }));
import { AuditLogsCard } from "./AuditLogsCard";

const status = { enabled: true, configured: true, workosOrgId: "org_a", lastSentAt: null,
  deliveries: { pending: 2, delivering: 1, delivered: 4, failed: 1 } };
function component() { return <Theme><AuditLogsCard /></Theme>; }
describe("audit delivery status", () => {
  beforeEach(() => { state.tenant = { id: "tenant_a", role: "admin" }; });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("shows actual queued and failed delivery instead of promising streaming", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(status)));
    render(component());
    expect(await screen.findByText("Delivery needs review")).toBeTruthy();
    expect(screen.getByText("3 pending · 1 need review · 4 accepted")).toBeTruthy();
    expect(screen.queryByText("Streaming to WorkOS")).toBeNull();
  });
  it("does not describe unavailable status as unconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 })));
    render(component());
    expect(await screen.findByText("Status unavailable")).toBeTruthy();
    expect(screen.queryByText("Not configured")).toBeNull();
  });
  it("does not celebrate an unconfirmed test event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => String(url).endsWith("audit-logs-test")
      ? Response.json({ ok: true, deliveryStatus: "pending", message: "Delivery pending" }, { status: 202 })
      : Response.json(status)));
    render(component());
    await screen.findByText("Delivery needs review");
    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));
    await waitFor(() => expect(state.info).toHaveBeenCalledWith("Delivery pending"));
    expect(state.success).not.toHaveBeenCalled();
  });
  it("ignores stale responses after switching workspaces", async () => {
    let finishFirst!: (response: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishFirst = resolve; }))
      .mockResolvedValue(Response.json({ ...status, workosOrgId: "org_b" }));
    vi.stubGlobal("fetch", request);
    const view = render(component());
    state.tenant = { id: "tenant_b", role: "admin" };
    view.rerender(component());
    await screen.findByText("org_b");
    finishFirst(Response.json(status));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("org_a")).toBeNull();
    expect(screen.getByText("org_b")).toBeTruthy();
  });
  it("pins status, test events and portal requests to the displayed account and workspace", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const request = vi.fn().mockImplementation(async (url) => String(url).endsWith("portal-link")
      ? Response.json({ link: "https://workos.example/portal" })
      : String(url).endsWith("audit-logs-test") ? Response.json({ ok: true, deliveryStatus: "pending" }, { status: 202 })
      : Response.json(status));
    vi.stubGlobal("fetch", request);
    render(component());
    await screen.findByText("Delivery needs review");
    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));
    await waitFor(() => expect(state.info).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Open WorkOS Admin Portal" }));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    for (const [path, options] of request.mock.calls) {
      expect(String(path)).toMatch(/^\/api\/workos\//);
      expect(options.headers).toMatchObject({ "X-Workspace-ID": "tenant_a", "X-Account-ID": "account_a" });
    }
  });
});
