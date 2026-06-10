import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPassword } from "./ResetPassword";

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

describe("ResetPassword", () => {
  it("falls back to the request flow when no token is in the URL", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/reset-password"]}>
        <ResetPassword />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /request a new reset link/i }),
    ).toHaveAttribute("href", "/sign-in/forgot-password");
  });

  it("posts token + password and navigates home on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, user: { id: "u_1", email: "a@b.co" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/reset-password?token=tok_abc"]}>
        <Routes>
          <Route path="/sign-in/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "newpassword123" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /update password and sign in/i }),
      );
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/auth/password-reset-confirm");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({ token: "tok_abc", password: "newpassword123" });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(authMock.refresh).toHaveBeenCalled();
  });

  it("surfaces an expired-token error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "This reset link is invalid or has expired. Request a new one.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/reset-password?token=expired"]}>
        <ResetPassword />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "newpassword123" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /update password and sign in/i }),
      );
    });

    expect(
      await screen.findByText(/this reset link is invalid or has expired/i),
    ).toBeInTheDocument();
  });

  it("disables submit when passwords don't match", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/reset-password?token=tok"]}>
        <ResetPassword />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different456789" },
    });

    expect(
      screen.getByRole("button", { name: /update password and sign in/i }),
    ).toBeDisabled();
    expect(screen.getByText("Passwords don’t match.")).toBeInTheDocument();
  });
});
