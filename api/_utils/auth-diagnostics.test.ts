// @vitest-environment node
import { expect, it, vi } from "vitest";
import { logAuthFailure } from "./auth-diagnostics";

it("reports dependency codes without logging credentials, user data or SQL", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    logAuthFailure("workspace-load", Object.assign(new Error("SQL with private data"), {
      token: "secret-token", cause: Object.assign(new Error("private host"), { code: "ECONNREFUSED" }),
    }));
    const output = JSON.stringify(log.mock.calls);
    expect(output).toContain("workspace-load");
    expect(output).toContain("ECONNREFUSED");
    expect(output).not.toMatch(/SQL|secret-token|private/);
  } finally { log.mockRestore(); }
});
