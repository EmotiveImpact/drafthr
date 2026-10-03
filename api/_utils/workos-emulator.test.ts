import { afterEach, describe, expect, it, vi } from "vitest";
import { workosClientOptions } from "./workos.js";

describe("local WorkOS emulator guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the real WorkOS endpoint unless explicitly enabled", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "");
    expect(workosClientOptions("sk_live_key", "client_real")).toEqual({ clientId: "client_real" });
  });

  it("allows only the fixed local test credentials in development", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    expect(workosClientOptions("sk_test_default", "client_local_drafthr")).toEqual({
      clientId: "client_local_drafthr",
      apiHostname: "127.0.0.1",
      port: 4100,
      https: false,
    });
    expect(() => workosClientOptions("sk_live_key", "client_local_drafthr")).toThrow();
  });

  it.each(["preview", "production"])("fails closed in a %s deployment", (environment) => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("VERCEL_ENV", environment);
    expect(() => workosClientOptions("sk_test_default", "client_local_drafthr")).toThrow();
  });
});
