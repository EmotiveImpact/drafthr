// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({ pool: vi.fn(), local: vi.fn(), close: vi.fn(), drizzle: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class {
  constructor(options: unknown) { clients.pool(options); }
  end = clients.close;
} }));
vi.mock("postgres", () => ({ default: (url: string, options: unknown) => { clients.local(url, options); return { end: clients.close }; } }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: clients.drizzle }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: clients.drizzle }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); clients.drizzle.mockReturnValue({ marker: "mock-db" }); });
afterEach(() => vi.unstubAllEnvs());

describe("database connection timeouts", () => {
  it("bounds hosted connection creation and pool acquisition through the driver's timeout", async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", ""); vi.stubEnv("DATABASE_URL", "postgres://test:placeholder@example.invalid/database");
    const { getDb, closeDb, DATABASE_CONNECTION_TIMEOUT_MS } = await import("./index.js");
    const first = getDb(); expect(getDb()).toBe(first);
    expect(clients.pool).toHaveBeenCalledOnce();
    expect(clients.pool).toHaveBeenCalledWith({ connectionString: "postgres://test:placeholder@example.invalid/database", connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS });
    expect(DATABASE_CONNECTION_TIMEOUT_MS).toBe(3000);
    await closeDb(); expect(clients.close).toHaveBeenCalledOnce();
  });
  it("uses seconds for local postgres-js connection timeout without changing the local-only guard", async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_LOCAL_DATABASE_URL", "postgres://test:placeholder@localhost:55432/drafthr_test");
    const { getDb, closeDb } = await import("./index.js");
    getDb(); expect(clients.local).toHaveBeenCalledWith(expect.any(String), { max: 5, connect_timeout: 3 });
    expect(clients.pool).not.toHaveBeenCalled(); await closeDb();
  });
});
