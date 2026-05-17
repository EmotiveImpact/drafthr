import { describe, it, expect } from "vitest";
import {
  brandedExportFooterHtml,
  exportFooterEnabled,
  type ExportFooterContext,
} from "./export-footer";

describe("exportFooterEnabled — layered toggle", () => {
  it("returns true by default (no context)", () => {
    expect(exportFooterEnabled()).toBe(true);
  });

  it("returns false when env force-off wins (layer 1)", () => {
    expect(exportFooterEnabled({ envEnabled: false })).toBe(false);
  });

  it("returns false for any paid plan (layer 2)", () => {
    const paid: ExportFooterContext["tenantPlan"][] = ["pro", "business", "enterprise"];
    for (const plan of paid) {
      expect(exportFooterEnabled({ tenantPlan: plan })).toBe(false);
    }
  });

  it("returns true for free plan + null plan (layer 2 fall-through)", () => {
    expect(exportFooterEnabled({ tenantPlan: "free" })).toBe(true);
    expect(exportFooterEnabled({ tenantPlan: null })).toBe(true);
    expect(exportFooterEnabled({ tenantPlan: undefined })).toBe(true);
  });

  it("returns false when user explicitly opts out (layer 3)", () => {
    expect(exportFooterEnabled({ userOptOut: true })).toBe(false);
  });

  it("returns true when user opt-out is false / undefined (layer 3 fall-through)", () => {
    expect(exportFooterEnabled({ userOptOut: false })).toBe(true);
    expect(exportFooterEnabled({ userOptOut: undefined })).toBe(true);
  });

  it("env override beats paid plan + opt-out (layer 1 precedence)", () => {
    expect(
      exportFooterEnabled({ envEnabled: false, tenantPlan: "pro", userOptOut: false })
    ).toBe(false);
  });

  it("paid plan beats user opt-out=false (layer 2 precedence)", () => {
    expect(exportFooterEnabled({ tenantPlan: "pro", userOptOut: false })).toBe(false);
  });

  it("env-enabled=true doesn't force render on a paid tenant — paid plan still wins", () => {
    expect(exportFooterEnabled({ envEnabled: true, tenantPlan: "business" })).toBe(false);
  });
});

describe("brandedExportFooterHtml", () => {
  it("returns empty string when toggle is off", () => {
    expect(brandedExportFooterHtml({ envEnabled: false })).toBe("");
    expect(brandedExportFooterHtml({ tenantPlan: "pro" })).toBe("");
    expect(brandedExportFooterHtml({ userOptOut: true })).toBe("");
  });

  it("returns HTML containing the brand + URL when enabled", () => {
    const html = brandedExportFooterHtml();
    expect(html).toContain("DraftHR");
    expect(html).toContain("drafthr.io");
    expect(html).toContain("Drafted with");
  });

  it("wraps the footer in a class hook for downstream selector targeting", () => {
    const html = brandedExportFooterHtml();
    expect(html).toContain('class="drafthr-export-footer"');
  });

  it("inlines all styling (no external stylesheet dependency)", () => {
    const html = brandedExportFooterHtml();
    expect(html).toContain("style=");
    // Specifically: must include a separator + center alignment + size cue
    expect(html).toContain("border-top");
    expect(html).toContain("text-align:center");
    expect(html).toMatch(/font-size:\s*\d+(\.\d+)?pt/);
  });
});
