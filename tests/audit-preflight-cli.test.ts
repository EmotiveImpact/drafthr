// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("read-only audit preflight invocation", () => {
  it.each([
    { args: ["--read-only"], connection: "postgres://fictional:secret-not-for-output@[broken" },
    { args: ["--read-only"], connection: "https://fictional:secret-not-for-output@example.invalid/db" },
    { args: ["--read-only"], connection: "postgres://fictional:secret-not-for-output@test-pooler.example.invalid/db" },
    { args: [], connection: "postgres://fictional:secret-not-for-output@localhost/example" },
    { args: ["--read-only"], connection: "" },
  ])("rejects unsafe or incomplete initialization without exposing the connection %#", ({ args, connection }) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/audit-preflight.ts"), ...args], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, AUDIT_PREFLIGHT_DATABASE_URL: connection },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Audit preflight could not complete. No data was changed.");
    expect(result.stderr).not.toContain("secret-not-for-output");
    expect(result.stderr).not.toContain("ERR_INVALID_URL");
  });
});

describe("disposable database bootstrap invocation", () => {
  it.each([
    { consent: "1", connection: "postgres://fictional:secret-not-for-output@[broken" },
    { consent: "1", connection: "postgres://fictional:secret-not-for-output@production.example.invalid:55432/example_test" },
    { consent: "1", connection: "postgres://fictional:secret-not-for-output@localhost:55432/application" },
    { consent: "", connection: "postgres://fictional:secret-not-for-output@localhost:55432/example_test" },
  ])("rejects unsafe initialization without exposing the connection %#", ({ consent, connection }) => {
    const result = spawnSync(process.execPath, [resolve("scripts/prepare-test-database.mjs")], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, DRAFTHR_ALLOW_TEST_DATABASE_MIGRATIONS: consent, DRAFTHR_LOCAL_DATABASE_URL: connection },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Test database setup failed.");
    expect(result.stderr).not.toContain("secret-not-for-output");
    expect(result.stderr).not.toContain("ERR_INVALID_URL");
  });
});
