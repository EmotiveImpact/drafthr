/**
 * SecurityCard — the signed-in password-reset surface.
 *
 * Verifies the three behaviours that matter:
 *   1. Renders nothing when there's no signed-in user (defensive — the
 *      Settings page only mounts after auth, but the component shouldn't
 *      blow up if useAuth() returns null mid-render).
 *   2. POSTs to /api/auth/password-reset-request with the signed-in user's
 *      email when the button is clicked.
 *   3. Surfaces a server error to the toast layer rather than swallowing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { SecurityCard } from "./SecurityCard";

vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(),
}));

// Re-import the mocked hook through a typed handle so the tests stay clean.
import { useAuth } from "@/lib/auth";
const mockUseAuth = vi.mocked(useAuth);

function withTheme(children: React.ReactNode) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

describe("SecurityCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when there's no signed-in user", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      activeTenant: null,
      hasAnyTenant: false,
      isConsultant: false,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(withTheme(<SecurityCard />));
    // The Toaster portal always renders; verify
    // SecurityCard itself emits nothing by absence of its heading.
    expect(screen.queryByText(/^security$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send password reset link/i }),
    ).not.toBeInTheDocument();
  });

  it("POSTs to /api/auth/password-reset-request with the signed-in email", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user_123",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: null,
        profilePictureUrl: null,
      },
      activeTenant: null,
      hasAnyTenant: false,
      isConsultant: false,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(withTheme(<SecurityCard />));

    fireEvent.click(screen.getByRole("button", { name: /send password reset link/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/auth/password-reset-request");
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "alice@example.com" }));
  });

  it("surfaces a server error when the endpoint 4xxes", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user_123",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: null,
        profilePictureUrl: null,
      },
      activeTenant: null,
      hasAnyTenant: false,
      isConsultant: false,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests, try again later." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(withTheme(<SecurityCard />));

    fireEvent.click(screen.getByRole("button", { name: /send password reset link/i }));

    // sonner renders inside a portal — looking up by role isn't reliable
    // across renderer versions, so we look for the rate-limit message in
    // the DOM tree at large.
    await waitFor(() =>
      expect(
        screen.getByText(/too many requests/i),
      ).toBeInTheDocument(),
    );
  });
});
