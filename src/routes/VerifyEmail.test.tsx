import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmail } from "./VerifyEmail";

const authMock = vi.hoisted(() => ({
  enabled: true,
  user: null as null | { id: string },
  isLoaded: true,
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  get AUTH_ENABLED() {
    return authMock.enabled;
  },
  useAuth: () => ({
    user: authMock.user,
    isLoaded: authMock.isLoaded,
    activeTenant: null,
    hasAnyTenant: false,
    isConsultant: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: authMock.refresh,
  }),
}));

beforeEach(() => {
  authMock.enabled = true;
  authMock.user = null;
  authMock.isLoaded = true;
  authMock.refresh.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

describe("VerifyEmail", () => {
  it("shows the missing-code state when the URL lacks code/user_id", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/verify-email"]}>
        <VerifyEmail />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/that verification link is incomplete/i),
    ).toBeInTheDocument();
  });

  it("posts the code + user_id and routes home on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, user: { id: "u_1", email: "a@b.co" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter
        initialEntries={["/sign-in/verify-email?code=123456&user_id=u_1"]}
      >
        <Routes>
          <Route path="/sign-in/verify-email" element={<VerifyEmail />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/auth/verify-email");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({ code: "123456", userId: "u_1" });

    // Success branch shows "verified" then auto-routes after a beat
    // (~800ms in the component). We just wait for the route change.
    await screen.findByText(/your email is confirmed/i);
    expect(authMock.refresh).toHaveBeenCalled();
    await waitFor(
      () => expect(screen.getByTestId("location")).toHaveTextContent("/"),
      { timeout: 2_000 },
    );
  });

  it("shows the expired-link error on a failed verify", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "This verification link is invalid or has expired. Request a new one.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/verify-email?code=bad&user_id=u"]}>
        <VerifyEmail />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/this verification link has expired/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/this verification link is invalid or has expired/i),
    ).toBeInTheDocument();
  });
});
