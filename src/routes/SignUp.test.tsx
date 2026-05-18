import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignUp } from "./SignUp";

/**
 * SignUp page tests — lock down the contract that:
 *
 *  1. The form renders the required fields.
 *  2. Mismatched passwords + un-checked Terms disable the submit button.
 *  3. A successful POST switches to the "check your email" stage.
 *  4. The successful POST does NOT set a session cookie / does NOT route
 *     the user into the app — the email-verification step is the gate.
 *  5. Resend verification posts to the right endpoint.
 *  6. Server errors are surfaced verbatim to the user.
 */

const authMock = vi.hoisted(() => ({
  enabled: true,
  user: null as null | { id: string; email: string },
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

describe("SignUp", () => {
  it("renders the form fields and terms checkbox", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/signup"]}>
        <SignUp />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("keeps submit disabled when passwords don't match", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in/signup"]}>
        <SignUp />
      </MemoryRouter>,
    );

    fillForm({ password: "abcdefgh", confirm: "abcdefgZZZ" });

    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
    expect(screen.getByText("Passwords don’t match.")).toBeInTheDocument();
  });

  it("switches to the check-your-email view on successful sign-up", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, requiresVerification: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/signup"]}>
        <SignUp />
      </MemoryRouter>,
    );

    fillForm({ password: "longenough123", confirm: "longenough123", agree: true });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-up");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({
      email: "user@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      password: "longenough123",
    });

    expect(
      await screen.findByText(/one more step — verify your email/i),
    ).toBeInTheDocument();
    // Crucially: no session was minted — the user is NOT routed into
    // the app, and the only cookie-mutating call would be on a fetch
    // we never made (we only POST'd to /api/auth/sign-up).
    expect(document.cookie).toBe("");
  });

  it("surfaces a server validation error to the user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Password must contain a digit and a symbol." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/signup"]}>
        <SignUp />
      </MemoryRouter>,
    );

    fillForm({ password: "longenough123", confirm: "longenough123", agree: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    });

    expect(
      await screen.findByText("Password must contain a digit and a symbol."),
    ).toBeInTheDocument();
  });

  it("calls /api/auth/resend-verification on the confirmation screen", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, requiresVerification: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in/signup"]}>
        <SignUp />
      </MemoryRouter>,
    );

    fillForm({ password: "longenough123", confirm: "longenough123", agree: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    });
    await screen.findByText(/one more step — verify your email/i);

    // Switch the mock for the resend call so we can verify the second
    // POST hits the right endpoint.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    });

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
    const resendCall = fetchSpy.mock.calls[1]!;
    expect(resendCall[0]).toBe("/api/auth/resend-verification");
    const body = JSON.parse(((resendCall[1] as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({ email: "user@example.com" });
  });
});

function fillForm(opts: {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  confirm?: string;
  agree?: boolean;
}) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: opts.email ?? "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("First name"), {
    target: { value: opts.firstName ?? "Ada" },
  });
  fireEvent.change(screen.getByLabelText("Last name"), {
    target: { value: opts.lastName ?? "Lovelace" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: opts.password ?? "" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: opts.confirm ?? "" },
  });
  if (opts.agree) {
    fireEvent.click(screen.getByRole("checkbox"));
  }
}
