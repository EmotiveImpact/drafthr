import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "./AuthProvider";
import { Protected } from "./Protected";

/**
 * These tests lock the auth-gating contract the user explicitly asked for:
 * NO route content (the gated child) may render before authentication is
 * confirmed, and every non-authorized state must redirect — not render-then-
 * bounce. The child here is a sentinel; asserting it's absent proves the gate
 * never paints app content pre-auth.
 */

const authMock = vi.hoisted(() => ({
  authEnabled: true,
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

const storeMock = vi.hoisted(() => ({
  role: null as string | null,
  enrolled: false,
}));

vi.mock("./index", () => ({
  get AUTH_ENABLED() {
    return authMock.authEnabled;
  },
  get AUTH_MISCONFIGURED() {
    return false;
  },
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => authMock.value,
}));

vi.mock("@/lib/profile", () => ({
  useProfileStore: (selector: (s: { profile: { role: string | null } }) => unknown) =>
    selector({ profile: { role: storeMock.role } }),
}));

vi.mock("@/lib/consultantProfile", () => ({
  useConsultantStore: (selector: (s: { enrolled: boolean }) => unknown) =>
    selector({ enrolled: storeMock.enrolled }),
}));

const CHILD = "PROTECTED_CHILD_CONTENT";

function renderAt(path: string, roles?: ("employer" | "employee" | "consultant")[], allowRoleSetup = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <Protected roles={roles} allowRoleSetup={allowRoleSetup}>
              <div>{CHILD}</div>
            </Protected>
          }
        />
        <Route path="/sign-in" element={<Probe label="sign-in" />} />
        <Route path="/signup/workspace" element={<Probe label="workspace" />} />
        <Route path="/" element={<Probe label="root" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Protected — auth gating (no app content before auth)", () => {
  beforeEach(() => {
    authMock.authEnabled = true;
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
    storeMock.role = null;
    storeMock.enrolled = false;
  });

  it("never renders the child while the session is still loading", () => {
    authMock.value.isLoaded = false;
    renderAt("/hr", ["employer"]);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    // Still loading → not yet redirected anywhere either.
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading workspace" })).toHaveClass("app-loading-screen");
  });

  it("lets a fresh authenticated consultant reach profile setup without a browser enrolment flag", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    renderAt("/c/profile", ["consultant"], true);
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it("recognizes an existing consultant from the database on a fresh device", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.isConsultant = true;
    renderAt("/c", ["consultant"]);
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it("redirects a signed-out visitor to /sign-in without rendering the child", () => {
    authMock.value.user = null;
    authMock.value.isLoaded = true;
    renderAt("/hr", ["employer"]);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("sign-in");
  });

  it("redirects a signed-in user with NO tenant to workspace setup (not the child)", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.activeTenant = null;
    storeMock.role = "employer";
    renderAt("/hr", ["employer"]);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("workspace");
  });

  it("bounces a wrong-role user to / without rendering the role-gated child", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.activeTenant = { id: "t1", name: "Acme", role: "owner" };
    storeMock.role = "employee"; // employee hitting an employer-only route
    renderAt("/hr", ["employer"]);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("root");
  });

  it("bounces a NOT-YET-RESOLVED (null) role on a role-gated route — never flashes the child", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.activeTenant = { id: "t1", name: "Acme", role: "owner" };
    storeMock.role = null; // fresh login / cleared localStorage
    storeMock.enrolled = false;
    renderAt("/hr", ["employer"]);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("root");
  });

  it("renders the child for a fully-authorized user (happy path)", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.activeTenant = { id: "t1", name: "Acme", role: "owner" };
    storeMock.role = "employer";
    renderAt("/hr", ["employer"]);
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it("lets a tenant-less consultant through on /c (lazy-tenant onboarding path)", () => {
    authMock.value.user = { id: "u1" } as AuthContextValue["user"];
    authMock.value.activeTenant = null;
    storeMock.enrolled = true; // consultant, no employer/employee role
    renderAt("/c", ["consultant"]);
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it("passes through untouched when auth is disabled (dev/public-demo)", () => {
    authMock.authEnabled = false;
    renderAt("/hr", ["employer"]);
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });
});

function Probe({ label }: { label: string }) {
  const loc = useLocation();
  return (
    <div data-testid="probe" data-path={loc.pathname}>
      {label}
    </div>
  );
}
