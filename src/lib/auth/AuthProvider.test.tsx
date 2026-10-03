import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthProvider";
import * as transitions from "../session/transition";
import * as workspace from "../database-workspace";

/**
 * AuthProvider test — the signIn() contract changed when we moved from
 * the WorkOS-hosted login page to the in-app /sign-in route. It used to
 * fetch /api/auth/url and assign the returned URL; it now just navigates
 * the browser to /sign-in (the page does the rest). These tests pin that
 * contract so we don't accidentally regress to a third-party redirect.
 */

// Force AUTH_ENABLED=true so RealAuthProvider runs. We can't import
// from "./index" because that pulls in import.meta.env at module init.
vi.mock("./index", () => ({
  AUTH_ENABLED: true,
  AUTH_MISCONFIGURED: false,
}));

const originalAssign = window.location.assign;
const assignSpy = vi.fn();
let releaseTransition: (() => void) | undefined;

beforeEach(() => {
  const begin = transitions.beginSessionTransition;
  vi.spyOn(transitions, "beginSessionTransition").mockImplementation(label => {
    const transition = begin(label);
    if (transition) releaseTransition = transition.release;
    return transition;
  });
  assignSpy.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignSpy },
  });
  // /api/auth/session is polled on mount — answer with "no session" so
  // we land in a clean signed-out state.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ user: null, activeTenant: null, hasAnyTenant: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  releaseTransition?.(); releaseTransition = undefined;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: originalAssign },
  });
  vi.restoreAllMocks();
});

function Harness() {
  const { signIn, signOut } = useAuth();
  return (
    <>
    <button
      type="button"
      onClick={() => {
        void signIn();
      }}
    >
      sign-in
    </button>
    <button type="button" onClick={() => void signOut()}>sign-out</button>
    </>
  );
}

describe("AuthProvider.signIn", () => {
  it("locks editing while saving, prevents duplicate logout, and unlocks on a save failure", async () => {
    let rejectSave!: (error: Error) => void;
    vi.spyOn(workspace, "suspendDatabaseWorkspaceForTransition").mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    await act(async () => { render(<AuthProvider><Harness /></AuthProvider>); });
    await act(async () => { screen.getByText("sign-out").click(); });
    expect(screen.getByRole("status")).toHaveTextContent("signing out");
    expect(screen.getByText("sign-out").closest("[inert]")).toBeTruthy();
    await act(async () => { screen.getByText("sign-out").click(); });
    expect(workspace.suspendDatabaseWorkspaceForTransition).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("sign-out"))).toBe(false);
    await act(async () => { rejectSave(new Error("Unsaved changes")); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("sign-out").closest("[inert]")).toBeNull();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("retains recovery and reloads on an ambiguous logout instead of resuming the old session", async () => {
    const resume = vi.fn();
    vi.spyOn(workspace, "suspendDatabaseWorkspaceForTransition").mockResolvedValue(resume);
    localStorage.setItem("drafthr.workspace-pending.v1:test", "recover me");
    vi.mocked(fetch).mockImplementation(async input => {
      if (String(input).includes("sign-out")) throw new Error("response lost");
      return Response.json({ user: null, activeTenant: null });
    });
    await act(async () => { render(<AuthProvider><Harness /></AuthProvider>); });
    await act(async () => { screen.getByText("sign-out").click(); });
    expect(assignSpy).toHaveBeenCalledWith("/");
    expect(resume).not.toHaveBeenCalled();
    expect(localStorage.getItem("drafthr.workspace-pending.v1:test")).toBe("recover me");
    expect(transitions.useSessionTransition.getState().label).toBeTruthy();
    localStorage.removeItem("drafthr.workspace-pending.v1:test");
  });
  it("navigates to /sign-in instead of fetching /api/auth/url", async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByText("sign-in").click();
    });

    expect(assignSpy).toHaveBeenCalledWith("/sign-in");
    // Crucially: we did NOT fetch /api/auth/url. The provider used to
    // hit that endpoint to get a WorkOS-hosted URL; the new contract
    // puts the user on our own /sign-in page first.
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const urls = calls.map((c) => c[0]);
    expect(urls).not.toContain("/api/auth/url");
  });

  it("finishes logout through WorkOS rather than automatically starting sign-in again", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes("sign-out") ? { ok: true, logoutUrl: "https://api.workos.com/user_management/sessions/logout" } :
        { user: null, activeTenant: null },
    ), { headers: { "Content-Type": "application/json" } }));
    render(<AuthProvider><Harness /></AuthProvider>);
    await act(async () => { screen.getByText("sign-out").click(); });
    expect(assignSpy).toHaveBeenCalledWith("https://api.workos.com/user_management/sessions/logout");
  });

  it("does not claim logout succeeded when the server could not clear the session", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes("sign-out") ?
      new Response("unavailable", { status: 503 }) : new Response(JSON.stringify({ user: null, activeTenant: null })));
    render(<AuthProvider><Harness /></AuthProvider>);
    await act(async () => { screen.getByText("sign-out").click(); });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("shows a retryable outage instead of routing an unavailable session to onboarding", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("unavailable", { status: 503 }));
    await act(async () => { render(<AuthProvider><Harness /></AuthProvider>); });
    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText("sign-in")).not.toBeInTheDocument();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
