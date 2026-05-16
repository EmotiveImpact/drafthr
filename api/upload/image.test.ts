import { describe, expect, it } from "vitest";

import { isValidImagePayload } from "./image.js";

describe("isValidImagePayload", () => {
  it("accepts supported image signatures", () => {
    expect(isValidImagePayload(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(isValidImagePayload(bytes([0xff, 0xd8, 0xff, 0xdb]), "image/jpeg")).toBe(true);
    expect(isValidImagePayload(ascii("GIF89a"), "image/gif")).toBe(true);
    expect(isValidImagePayload(ascii("RIFFxxxxWEBP"), "image/webp")).toBe(true);
  });

  it("rejects mislabeled non-image bytes", () => {
    const html = ascii("<script>alert(1)</script>");

    expect(isValidImagePayload(html, "image/png")).toBe(false);
    expect(isValidImagePayload(html, "image/jpeg")).toBe(false);
    expect(isValidImagePayload(html, "image/webp")).toBe(false);
    expect(isValidImagePayload(html, "image/gif")).toBe(false);
  });
});

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
