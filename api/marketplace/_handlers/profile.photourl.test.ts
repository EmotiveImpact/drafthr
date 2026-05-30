import { describe, it, expect } from "vitest";
import { validatePhotoUrl } from "./profile.js";

describe("validatePhotoUrl", () => {
  it("allows null / empty (clears the photo)", () => {
    expect(validatePhotoUrl(null)).toEqual({ ok: true, value: null });
    expect(validatePhotoUrl(undefined)).toEqual({ ok: true, value: null });
    expect(validatePhotoUrl("")).toEqual({ ok: true, value: null });
  });

  it("allows https URLs", () => {
    const r = validatePhotoUrl("https://cdn.example.com/a.jpg");
    expect(r).toEqual({ ok: true, value: "https://cdn.example.com/a.jpg" });
  });

  it("allows base64 image data URLs (the upload path)", () => {
    const v = "data:image/png;base64,iVBORw0KGgoAAAANS=";
    expect(validatePhotoUrl(v)).toEqual({ ok: true, value: v });
  });

  it("rejects http (mixed content / beacon)", () => {
    expect(validatePhotoUrl("http://evil.example.com/track.gif")).toEqual({ ok: false });
  });

  it("rejects javascript: and other schemes", () => {
    expect(validatePhotoUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(validatePhotoUrl("vbscript:msgbox")).toEqual({ ok: false });
    expect(validatePhotoUrl("file:///etc/passwd")).toEqual({ ok: false });
  });

  it("rejects non-image data URLs (html/script injection)", () => {
    expect(validatePhotoUrl("data:text/html;base64,PHNjcmlwdD4=")).toEqual({ ok: false });
    expect(validatePhotoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({ ok: false }); // SVG excluded (script vector)
  });

  it("rejects non-strings and oversized payloads", () => {
    expect(validatePhotoUrl(42)).toEqual({ ok: false });
    expect(validatePhotoUrl({})).toEqual({ ok: false });
    expect(validatePhotoUrl("data:image/png;base64," + "A".repeat(2_000_001))).toEqual({ ok: false });
  });
});
