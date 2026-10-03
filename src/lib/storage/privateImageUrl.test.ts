import { describe, expect, it } from "vitest";
import {
  isTenantPrivateImagePath,
  parsePrivateImageUrl,
  privateImageUrl,
} from "./privateImageUrl";

const TENANT = "12345678-1234-1234-1234-123456789abc";
const OTHER_TENANT = "abcdefab-1234-1234-1234-123456789abc";
const PATH = `letterheads/${TENANT}/${"a".repeat(64)}.png`;

describe("private image URLs", () => {
  it("round-trips a tenant-scoped pathname without exposing a Blob URL", () => {
    const url = privateImageUrl(PATH);
    expect(url).toMatch(/^\/api\/upload\/image\?path=/);
    expect(parsePrivateImageUrl(url)).toBe(PATH);
    expect(isTenantPrivateImagePath(PATH, TENANT)).toBe(true);
    expect(isTenantPrivateImagePath(PATH, OTHER_TENANT)).toBe(false);
  });

  it("rejects arbitrary paths, extra parameters, fragments and external URLs", () => {
    expect(parsePrivateImageUrl("/api/upload/image?path=../../secret")).toBeNull();
    expect(parsePrivateImageUrl(`${privateImageUrl(PATH)}&next=/`)).toBeNull();
    expect(parsePrivateImageUrl(`${privateImageUrl(PATH)}#fragment`)).toBeNull();
    expect(parsePrivateImageUrl(`https://attacker.example${privateImageUrl(PATH)}`)).toBeNull();
    expect(isTenantPrivateImagePath(`letterheads/${TENANT}/evil.svg`, TENANT)).toBe(false);
  });
});
