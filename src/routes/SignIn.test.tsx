import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignIn } from "./SignIn";

/**
 * The /sign-in page is the user-facing form for the headless WorkOS
 * pattern. The thing the tests really need to lock down is the wiring:
 *
 *  1. The form actually surfaces email + password + social buttons.
 *  2. Submitting the form posts to /api/auth/password (the new handler).
 *  3. The social buttons hit /api/auth/url?provider=... and navigate the
 *     browser to the URL the server hands back.
 *  4. A failed password attempt surfaces the server's error to the user.
 *
 * We mock useAuth so we don't depend on AuthProvider, and we mock
 * window.location.assign so a navigation doesn't blow jsdom up.
 */

const authMock = vi.hoisted(() => ({
  authEnabled: true,
  user: null as null | { id: string; email: string },
  isLoaded: true,
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  get AUTH_ENABLED() {
    return authMock.authEnabled;
  },
  useAuth: () => ({
    user: authMock.user,
    isLoaded: authMock.isLoaded,
    refresh: authMock.refresh,
    activeTenant: null,
    hasAnyTenant: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// AuthCallback is imported only for safeInternalRedirect — keep the
// module surface light by stubbing the component half.
vi.mock("@/routes/AuthCallback", () => ({
  AuthCallback: () => null,
  safeInternalRedirect: (v: string | null) => {
    if (!v) return null;
    return v.startsWith("/") && !v.startsWith("//") ? v : null;
  },
}));

const originalAssign = window.location.assign;
const assignSpy = vi.fn();

beforeEach(() => {
  authMock.authEnabled = true;
  authMock.user = null;
  authMock.isLoaded = true;
  authMock.refresh.mockClear();
  assignSpy.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignSpy },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: originalAssign },
  });
  vi.restoreAllMocks();
});

describe("SignIn", () => {
  it("renders the email field and social buttons", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignIn />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with microsoft/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/sign in/i);
  });

  it("returns to / when auth is disabled", async () => {
    authMock.authEnabled = false;

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
  });

  it("posts to /api/auth/password and navigates on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, user: { id: "u_1", email: "a@b.co" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in?redirect=/hr"]}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/hr" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2!!" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/auth/password");
    expect((init as RequestInit | undefined)?.method).toBe("POST");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({ email: "a@b.co", password: "hunter2!!" });

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/hr"),
    );
    expect(authMock.refresh).toHaveBeenCalled();
  });

  it("shows the server error when password sign-in fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Incorrect email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignIn />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "wrong@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(
      await screen.findByText("Incorrect email or password."),
    ).toBeInTheDocument();
  });

  it("fetches the authorization URL and redirects for Google sign-in", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://api.workos.com/auth?go=google" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignIn />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/auth/url?provider=GoogleOAuth");
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith("https://api.workos.com/auth?go=google"),
    );
  });

  it("fetches the authorization URL and redirects for LinkedIn sign-in", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://api.workos.com/auth?go=linkedin" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignIn />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue with linkedin/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/auth/url?provider=LinkedInOAuth");
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith("https://api.workos.com/auth?go=linkedin"),
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
