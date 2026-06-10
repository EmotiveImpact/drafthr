/**
 * /settings/directory-sync — UI tests. We mock the auth context and fetch so
 * the component exercises the same code paths as production but never hits
 * the network. Three core branches:
 *   - member (non-admin) sees "Not allowed"
 *   - admin with no directories sees the unconnected CTA
 *   - admin with directories sees the connected state + can open the portal
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DirectorySync } from "./DirectorySync";

const authMock = vi.hoisted(() => ({
  activeTenant: { id: "tenant_1", name: "Acme", role: "admin" as string },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    activeTenant: authMock.activeTenant,
    user: { id: "u_1", email: "admin@acme.com", firstName: null, lastName: null, profilePictureUrl: null },
    hasAnyTenant: true,
    isConsultant: false,
    isLoaded: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderRoute() {
  return render(
    <MemoryRouter>
      <Theme appearance="light">
        <DirectorySync />
      </Theme>
    </MemoryRouter>,
  );
}

describe("DirectorySync route", () => {
  beforeEach(() => {
    authMock.activeTenant = { id: "tenant_1", name: "Acme", role: "admin" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks non-admin members from seeing any directory data", async () => {
    authMock.activeTenant = { id: "tenant_1", name: "Acme", role: "drafter" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the unconnected CTA when no directories are present", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ configured: false, workosOrgId: null, directories: [], users: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    await waitFor(() => expect(screen.getByTestId("unconnected-cta")).toBeInTheDocument());
    expect(screen.getByText(/Not configured/i)).toBeInTheDocument();
    // The "Open Admin Portal" button is rendered regardless — it's the entry
    // point to start the setup wizard.
    expect(screen.getByTestId("open-portal")).toBeInTheDocument();
  });

  it("renders the connected state when WorkOS returns directories", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        configured: true,
        workosOrgId: "org_123",
        directories: [
          {
            id: "directory_1",
            name: "Acme Okta",
            type: "okta scim v2.0",
            state: "linked",
            domain: "acme.com",
            updatedAt: new Date().toISOString(),
          },
        ],
        users: [
          {
            userId: "u_2",
            email: "jane@acme.com",
            legalName: "Jane Patel",
            workosDirectoryId: "directory_1",
            workosDirectoryUserId: "dir_user_1",
            role: "admin",
            status: "active",
            deprovisionedAt: null,
            joinedAt: new Date().toISOString(),
          },
          {
            userId: "u_3",
            email: "alex@acme.com",
            legalName: "Alex",
            workosDirectoryId: "directory_1",
            workosDirectoryUserId: "dir_user_2",
            role: "drafter",
            status: "deprovisioned",
            deprovisionedAt: new Date().toISOString(),
            joinedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    await waitFor(() => expect(screen.getByTestId("connection-state")).toHaveTextContent(/Connected/i));
    expect(screen.getByText("Acme Okta")).toBeInTheDocument();
    expect(screen.getByText("Jane Patel")).toBeInTheDocument();
    expect(screen.getByText(/jane@acme.com/)).toBeInTheDocument();
    // "Deprovisioned" appears both as a status badge and as a column header
    // in the table — assert at least one match.
    expect(screen.getAllByText(/Deprovisioned/i).length).toBeGreaterThan(0);
  });

  it("calls /api/workos/portal-link and opens the returned URL in a new tab", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/workos/directory-info") {
        return jsonResponse({ configured: true, workosOrgId: "org_123", directories: [], users: [] });
      }
      if (url === "/api/workos/portal-link") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init!.body))).toEqual({ intent: "dsync" });
        return jsonResponse({ link: "https://setup.workos.com/portal/abc" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    renderRoute();

    const button = await screen.findByTestId("open-portal");
    fireEvent.click(button);

    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith(
        "https://setup.workos.com/portal/abc",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });
});
