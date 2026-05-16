import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthCallback, safeInternalRedirect } from "./AuthCallback";

const authMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    refresh: authMock.refresh,
  }),
}));

describe("safeInternalRedirect", () => {
  it("accepts app-relative redirects with search and hash", () => {
    expect(safeInternalRedirect("/hr?tab=drafts#latest")).toBe("/hr?tab=drafts#latest");
  });

  it("rejects external, network-path, backslash, and callback-loop redirects", () => {
    expect(safeInternalRedirect("https://evil.example/hr")).toBeNull();
    expect(safeInternalRedirect("//evil.example/hr")).toBeNull();
    expect(safeInternalRedirect("/\\evil.example")).toBeNull();
    expect(safeInternalRedirect("/auth/callback?code=again")).toBeNull();
  });
});

describe("AuthCallback", () => {
  beforeEach(() => {
    authMock.refresh.mockReset();
    authMock.refresh.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigates to a validated internal redirect after sign-in", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderCallback("/auth/callback?code=abc&state=state&redirect=%2Fhr%3Ftab%3Ddrafts");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/hr?tab=drafts"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed redirect and falls back to the tenant route", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return jsonResponse({ activeTenant: { id: "tenant_1" } });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderCallback("/auth/callback?code=abc&state=state&redirect=%2F%2Fevil.example%2Fhr");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});

function renderCallback(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
