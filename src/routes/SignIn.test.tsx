import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignIn } from "./SignIn";

const authMock = vi.hoisted(() => ({
  authEnabled: true,
  signIn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  get AUTH_ENABLED() {
    return authMock.authEnabled;
  },
  useAuth: () => ({
    signIn: authMock.signIn,
  }),
}));

describe("SignIn", () => {
  beforeEach(() => {
    authMock.authEnabled = true;
    authMock.signIn.mockReset();
    authMock.signIn.mockResolvedValue(undefined);
  });

  it("returns to the root route when auth is disabled", async () => {
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
    expect(authMock.signIn).not.toHaveBeenCalled();
  });

  it("shows a retry state when sign-in cannot start", async () => {
    authMock.signIn.mockRejectedValue(new Error("Failed to start sign-in"));

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignIn />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sign-in unavailable")).toBeInTheDocument();
    expect(screen.getByText("Failed to start sign-in")).toBeInTheDocument();
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
