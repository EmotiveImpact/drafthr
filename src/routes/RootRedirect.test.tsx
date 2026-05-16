import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "@/lib/auth";

import { RootRedirect } from "./RootRedirect";

const authMock = vi.hoisted(() => ({
  authEnabled: true,
  role: "employee" as string | null,
  value: {
    user: null,
    activeTenant: null,
    hasAnyTenant: false,
    isLoaded: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  } as AuthContextValue,
}));

vi.mock("@/lib/auth", () => ({
  get AUTH_ENABLED() {
    return authMock.authEnabled;
  },
  useAuth: () => authMock.value,
}));

vi.mock("@/lib/profile", () => ({
  useProfileStore: (selector: (state: { profile: { role: string | null } }) => unknown) =>
    selector({ profile: { role: authMock.role } }),
}));

vi.mock("./ModePicker", () => ({
  ModePicker: () => <div>Mode picker</div>,
}));

describe("RootRedirect", () => {
  beforeEach(() => {
    authMock.authEnabled = true;
    authMock.role = "employee";
    authMock.value = {
      user: null,
      activeTenant: null,
      hasAnyTenant: false,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    };
  });

  it("falls through to the sign-in route when automatic sign-in cannot start", async () => {
    authMock.value.signIn = vi.fn().mockRejectedValue(new Error("No auth endpoint"));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/sign-in" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sign-in"));
    expect(authMock.value.signIn).toHaveBeenCalledTimes(1);
  });

  it("routes by profile role when auth is disabled", async () => {
    authMock.authEnabled = false;
    authMock.value.signIn = vi.fn();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/me" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/me"));
    expect(authMock.value.signIn).not.toHaveBeenCalled();
  });

  it("shows the role picker when auth is disabled and no role is saved", () => {
    authMock.authEnabled = false;
    authMock.role = null;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RootRedirect />
      </MemoryRouter>,
    );

    expect(screen.getByText("Mode picker")).toBeInTheDocument();
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
