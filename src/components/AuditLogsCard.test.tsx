/**
 * AuditLogsCard: plain words, no vendor names or security jargon.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuditLogsCard, plainError } from "./AuditLogsCard";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ activeTenant: { id: "t1", name: "Harbour Foods", role: "owner" } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditLogsCard", () => {
  it("describes the audit log copy in plain words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ enabled: true, configured: true, workosOrgId: "org_123", lastSentAt: null }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { container } = render(<AuditLogsCard />);
    await waitFor(() => expect(screen.getByText("Copy on")).toBeInTheDocument());
    expect(screen.getByText("Audit log copy")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open setup portal" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send a test entry" })).toBeEnabled();
    const text = container.textContent ?? "";
    for (const jargon of ["WorkOS", "SIEM", "SOC", "org_123", "mirror"]) {
      expect(text).not.toContain(jargon);
    }
  });

  it("maps server failures to plain messages", () => {
    expect(plainError(409, "x")).toMatch(/isn't connected yet/);
    expect(plainError(503, "x")).toMatch(/switched off/);
    expect(plainError(403, "x")).toMatch(/owners and admins/);
    expect(plainError(500, "Try again.")).toBe("Try again.");
  });
});
