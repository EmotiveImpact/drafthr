import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Security board SE-03: server-side session revocation. These tests lock the
 * staleness logic (the gate that rejects a revoked cookie) and the defensive
 * fail-open behaviour of the DB helpers.
 */

const dbMock = vi.hoisted(() => ({
  enabled: true,
  execute: vi.fn(),
}));

vi.mock("../../src/db/index.js", () => ({
  dbEnabled: () => dbMock.enabled,
  getDb: () => ({ execute: dbMock.execute }),
}));

import {
  isCookieEpochStale,
  getUserSessionEpoch,
  bumpUserSessionEpoch,
} from "./session-epoch";

afterEach(() => {
  dbMock.enabled = true;
  dbMock.execute.mockReset();
});

describe("isCookieEpochStale (the revocation gate)", () => {
  it("fails OPEN when the db epoch is unknown (null) — never logs out on a blip", () => {
    expect(isCookieEpochStale(0, null)).toBe(false);
    expect(isCookieEpochStale(5, null)).toBe(false);
    expect(isCookieEpochStale(undefined, null)).toBe(false);
  });

  it("treats a missing cookie epoch as 0 (back-compat for pre-feature cookies)", () => {
    expect(isCookieEpochStale(undefined, 0)).toBe(false); // no bump yet → still valid
    expect(isCookieEpochStale(undefined, 1)).toBe(true); // a bump happened → revoked
  });

  it("matches an up-to-date cookie and rejects a behind one", () => {
    expect(isCookieEpochStale(0, 0)).toBe(false);
    expect(isCookieEpochStale(1, 1)).toBe(false);
    expect(isCookieEpochStale(0, 1)).toBe(true); // cookie minted before the bump
    expect(isCookieEpochStale(2, 3)).toBe(true);
  });

  it("rejects ANY mismatch (a cookie ahead of the db is also invalid)", () => {
    expect(isCookieEpochStale(2, 1)).toBe(true);
  });
});

describe("getUserSessionEpoch (defensive read)", () => {
  it("returns null when the DB is disabled (skip enforcement)", async () => {
    dbMock.enabled = false;
    expect(await getUserSessionEpoch("ext_1")).toBeNull();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("returns the stored epoch from a pg-style { rows } result", async () => {
    dbMock.execute.mockResolvedValue({ rows: [{ session_epoch: 3 }] });
    expect(await getUserSessionEpoch("ext_1")).toBe(3);
  });

  it("returns null when there is no such user", async () => {
    dbMock.execute.mockResolvedValue({ rows: [] });
    expect(await getUserSessionEpoch("ext_missing")).toBeNull();
  });

  it("returns null (NOT 0) on a query error — e.g. column not migrated yet", async () => {
    dbMock.execute.mockRejectedValue(new Error('column "session_epoch" does not exist'));
    expect(await getUserSessionEpoch("ext_1")).toBeNull();
  });
});

describe("bumpUserSessionEpoch (revocation write)", () => {
  it("returns the new epoch from RETURNING", async () => {
    dbMock.execute.mockResolvedValue({ rows: [{ session_epoch: 6 }] });
    expect(await bumpUserSessionEpoch("ext_1")).toBe(6);
  });

  it("returns null on error so callers never block on it", async () => {
    dbMock.execute.mockRejectedValue(new Error("db down"));
    expect(await bumpUserSessionEpoch("ext_1")).toBeNull();
  });

  it("no-ops to null when the DB is disabled", async () => {
    dbMock.enabled = false;
    expect(await bumpUserSessionEpoch("ext_1")).toBeNull();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });
});
