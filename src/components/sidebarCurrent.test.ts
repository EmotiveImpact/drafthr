import { describe, expect, it } from "vitest";
import { isLetterWizardPath, isTemplatesPage } from "./sidebarCurrent";

describe("sidebar current row on the new-letter pages (CREATE-X34)", () => {
  it("treats the wizard for one letter type as part of Letters", () => {
    expect(isLetterWizardPath("/hr/new/warning")).toBe(true);
    expect(isLetterWizardPath("/me/new/grievance")).toBe(true);
    expect(isTemplatesPage("/hr/new/warning", "/hr")).toBe(false);
  });

  it("keeps Templates current on the templates page itself", () => {
    expect(isTemplatesPage("/hr/new", "/hr")).toBe(true);
    expect(isTemplatesPage("/hr/new/", "/hr")).toBe(true);
    expect(isLetterWizardPath("/hr/new")).toBe(false);
    expect(isLetterWizardPath("/hr/new/")).toBe(false);
  });

  it("leaves other pages alone", () => {
    expect(isLetterWizardPath("/letters")).toBe(false);
    expect(isLetterWizardPath("/editor/abc")).toBe(false);
    expect(isTemplatesPage("/hr", "/hr")).toBe(false);
  });
});
