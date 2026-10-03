import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl } from "./index";

describe("local demo database isolation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the normal database URL outside demo mode", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "");
    vi.stubEnv("DATABASE_URL", "postgres://remote.example/db");
    expect(databaseUrl()).toBe("postgres://remote.example/db");
  });

  it("ignores the cloud URL when the local demo is enabled", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DATABASE_URL", "postgres://remote.example/db");
    vi.stubEnv("DRAFTHR_LOCAL_DATABASE_URL", "postgres://local@127.0.0.1:55432/postgres");
    expect(databaseUrl()).toBe("postgres://local@127.0.0.1:55432/postgres");
  });

  it("refuses a remote or missing demo database", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_LOCAL_DATABASE_URL", "postgres://remote.example/db");
    expect(() => databaseUrl()).toThrow("disposable localhost database");
    vi.stubEnv("DRAFTHR_LOCAL_DATABASE_URL", "");
    expect(() => databaseUrl()).toThrow("DRAFTHR_LOCAL_DATABASE_URL");
  });
});
