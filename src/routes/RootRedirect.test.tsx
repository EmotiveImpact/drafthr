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
    isConsultant: false,
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
      isConsultant: false,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    };
  });

  it("redirects signed-out users straight to /sign-in", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/sign-in" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/sign-in"),
    );
    // The previous implementation kicked signIn() in a useEffect; the
    // new contract is a router-level <Navigate> so the form page can
    // mount instantly without a fetch.
    expect(authMock.value.signIn).not.toHaveBeenCalled();
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

  it("routes a server-known consultant to /c even with empty local state (PM-03)", async () => {
    // New device: localStorage enrolled flag is false, no role saved, no
    // tenant yet — but the session endpoint reported a consultant_profiles
    // row. Routing must trust the server signal, not localStorage.
    authMock.authEnabled = true;
    authMock.role = null;
    authMock.value = {
      user: { id: "u1", email: "c@x.io", firstName: null, lastName: null, profilePictureUrl: null },
      activeTenant: null,
      hasAnyTenant: false,
      isConsultant: true,
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    } as AuthContextValue;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/c" element={<LocationProbe />} />
          <Route path="/signup/workspace" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // Must land on /c, NOT /signup/workspace (the old misroute).
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/c"));
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
