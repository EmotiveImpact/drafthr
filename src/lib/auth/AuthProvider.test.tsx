import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthProvider";

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

beforeEach(() => {
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
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: originalAssign },
  });
  vi.restoreAllMocks();
});

function Harness() {
  const { signIn } = useAuth();
  return (
    <button
      type="button"
      onClick={() => {
        void signIn();
      }}
    >
      sign-in
    </button>
  );
}

describe("AuthProvider.signIn", () => {
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
});
