import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPassword } from "./ForgotPassword";

/**
 * ForgotPassword tests — primarily anti-enumeration:
 *
 *   - The user-facing UI ALWAYS shows the same "if that account exists"
 *     confirmation on success. We never reveal whether the email is real.
 *   - The success state must render even if the server transparently
 *     "succeeded" on an unknown email (the server's job is to never error
 *     for unknown-email, so the UI never sees a 4xx in that branch).
 */

const authMock = vi.hoisted(() => ({
  enabled: true,
  user: null as null | { id: string },
  isLoaded: true,
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
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

beforeEach(() => {
  authMock.enabled = true;
  authMock.user = null;
  authMock.isLoaded = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForgotPassword", () => {
  it("renders the request form", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/forgot-password"]}>
        <ForgotPassword />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it("posts to /api/auth/password-reset-request and shows the generic confirmation", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/forgot-password"]}>
        <ForgotPassword />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/auth/password-reset-request");
    expect((init as RequestInit | undefined)?.method).toBe("POST");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({ email: "test@example.com" });

    // Anti-enumeration: confirmation copy is generic.
    expect(
      await screen.findByText(/if that account exists, we sent a link/i),
    ).toBeInTheDocument();
  });

  it("surfaces a rate-limit / bad-input error from the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/forgot-password"]}>
        <ForgotPassword />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    });

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });
});
