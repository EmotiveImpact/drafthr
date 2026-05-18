import { describe, expect, it } from "vitest";
import { serverUuidOrNull, toServerUuid } from "./remote-ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("remote id normalization", () => {
  it("passes through existing UUIDs in canonical lowercase form", () => {
    expect(toServerUuid("8E02F5B5-B56A-4F0D-A361-79EE6256F2D5")).toBe(
      "8e02f5b5-b56a-4f0d-a361-79ee6256f2d5",
    );
  });

  it("maps legacy local ids to stable UUID-shaped ids", () => {
    const first = toServerUuid("draft_local_123");
    const second = toServerUuid("draft_local_123");
    expect(first).toBe(second);
    expect(first).toMatch(UUID_RE);
    expect(toServerUuid("draft_local_456")).not.toBe(first);
  });

  it("only returns direct remote references for UUID inputs", () => {
    expect(serverUuidOrNull("matter_local_123")).toBeNull();
    expect(serverUuidOrNull(null)).toBeNull();
    expect(serverUuidOrNull("8e02f5b5-b56a-4f0d-a361-79ee6256f2d5")).toBe(
      "8e02f5b5-b56a-4f0d-a361-79ee6256f2d5",
    );
  });
});
