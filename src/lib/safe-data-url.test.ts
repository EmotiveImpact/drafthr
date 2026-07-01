import { describe, it, expect } from "vitest";
import { isSafeImageDataUrl, isSafeImageRef } from "./safe-data-url";

/* ============================================================================
 * isSafeImageDataUrl / isSafeImageRef — the image-safety gate used by export
 * (pdf/docx/pack), store hydration, profile validation, and migration.
 *
 * Regression: a whitespace-only base64 payload ("data:image/png;base64,   ")
 * previously passed because the char class included \s. It must be rejected —
 * while genuine (possibly line-wrapped) base64 still passes.
 * ==========================================================================*/

describe("isSafeImageDataUrl", () => {
  const tiny =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("accepts a valid png/jpeg/webp/gif base64 data URL", () => {
    expect(isSafeImageDataUrl(tiny)).toBe(true);
    expect(isSafeImageDataUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(true);
    expect(isSafeImageDataUrl("data:image/webp;base64,UklGRh4AAABXRUJQ")).toBe(true);
  });

  it("tolerates line-wrapped base64 (embedded whitespace with real content)", () => {
    expect(isSafeImageDataUrl("data:image/png;base64,iVBORw0K\nGgoAAAANSU\nhEUg==")).toBe(true);
  });

  it("REJECTS a whitespace-only base64 payload", () => {
    expect(isSafeImageDataUrl("data:image/png;base64,   ")).toBe(false);
    expect(isSafeImageDataUrl("data:image/png;base64,\n")).toBe(false);
    expect(isSafeImageDataUrl("data:image/png;base64,")).toBe(false);
  });

  it("rejects non-image and non-data values", () => {
    expect(isSafeImageDataUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeImageDataUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageDataUrl(42)).toBe(false);
    expect(isSafeImageDataUrl(null)).toBe(false);
  });
});

describe("isSafeImageRef", () => {
  it("accepts https URLs and safe data URLs, rejects other schemes", () => {
    expect(isSafeImageRef("https://x.public.blob.vercel-storage.com/a.png")).toBe(true);
    expect(isSafeImageRef("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeImageRef("data:image/png;base64,   ")).toBe(false);
    expect(isSafeImageRef("http://insecure.example/a.png")).toBe(false);
    expect(isSafeImageRef("blob:https://x/y")).toBe(false);
  });
});
