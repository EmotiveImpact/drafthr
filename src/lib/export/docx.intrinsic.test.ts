import { describe, it, expect } from "vitest";
import { intrinsicImageSize } from "./docx";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe("intrinsicImageSize", () => {
  it("decodes PNG dimensions from the IHDR (1x1)", () => {
    // The canonical 1x1 PNG used elsewhere in the docx tests.
    const png = b64ToBytes(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    );
    expect(intrinsicImageSize(png)).toEqual({ w: 1, h: 1 });
  });

  it("decodes a hand-built PNG with non-square dimensions (200x50)", () => {
    // Minimal PNG: 8-byte sig + IHDR length/type + width/height. Only the
    // header is needed by the decoder, so the rest can be absent.
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
    // width 200 @ offset 16 (big-endian uint32)
    bytes[16] = 0; bytes[17] = 0; bytes[18] = 0; bytes[19] = 200;
    // height 50 @ offset 20
    bytes[20] = 0; bytes[21] = 0; bytes[22] = 0; bytes[23] = 50;
    expect(intrinsicImageSize(bytes)).toEqual({ w: 200, h: 50 });
  });

  it("decodes GIF dimensions (little-endian, 320x100)", () => {
    const bytes = new Uint8Array(10);
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
    bytes[6] = 320 & 0xff; bytes[7] = (320 >> 8) & 0xff; // 320 LE
    bytes[8] = 100 & 0xff; bytes[9] = (100 >> 8) & 0xff; // 100 LE
    expect(intrinsicImageSize(bytes)).toEqual({ w: 320, h: 100 });
  });

  it("decodes JPEG dimensions from the SOF0 marker (640x480)", () => {
    // FFD8 (SOI) + FFE0 APP0 (len 4, skipped) + FFC0 SOF0 with h=480 w=640.
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4 → skip 2 payload bytes
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x01, 0xe0, // height 480
      0x02, 0x80, // width 640
      0x03, 0x00, 0x00, 0x00,
    ]);
    expect(intrinsicImageSize(bytes)).toEqual({ w: 640, h: 480 });
  });

  it("returns null for unparseable / unknown formats", () => {
    expect(intrinsicImageSize(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(intrinsicImageSize(new Uint8Array(0))).toBeNull();
    // WEBP (RIFF) — intentionally unsupported by this decoder.
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(intrinsicImageSize(webp)).toBeNull();
  });
});
