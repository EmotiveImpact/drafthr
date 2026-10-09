import { describe, expect, it } from "vitest";
import { EMPLOYER_TEMPLATES } from "./employer";
import { EMPLOYEE_TEMPLATES } from "./employee";
import { TEMPLATE_METADATA } from "./metadata";
import { toTemplateMetadata } from "./metadata-shape";
import {
  getSectionTemplate,
  getTemplate,
  getTemplateMetadata,
  hasTemplate,
  loadAllTemplates,
  loadTemplate,
} from "./index";

describe("template metadata index", () => {
  it("matches the full templates (regenerate with npx tsx scripts/gen-template-metadata.ts)", () => {
    const expected = Object.fromEntries(
      [...EMPLOYER_TEMPLATES, ...EMPLOYEE_TEMPLATES].map(([key, tpl]) => [key, toTemplateMetadata(tpl)]),
    );
    expect(JSON.parse(JSON.stringify(TEMPLATE_METADATA))).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it("answers hasTemplate and metadata lookups without loading templates", () => {
    expect(hasTemplate("grievance", "UK")).toBe(true);
    expect(getTemplateMetadata("grievance", "UK")?.letterType).toBe("grievance");
  });
});

describe("lazy template registry", () => {
  it("loads a single template on demand and caches it for sync lookups", async () => {
    const tpl = await loadTemplate("offer", "US");
    expect(tpl?.letterType).toBe("offer");
    expect(tpl?.jurisdiction).toBe("US");
    expect(getTemplate("offer", "US")).toBe(tpl);
    const first = tpl!.sections[0];
    expect(getSectionTemplate("offer", "US", first.sectionId)).toBe(first);
  });

  it("loads every registered template", async () => {
    await loadAllTemplates();
    for (const [key, tpl] of [...EMPLOYER_TEMPLATES, ...EMPLOYEE_TEMPLATES]) {
      expect(getTemplate(tpl.letterType, tpl.jurisdiction), key).toBe(tpl);
    }
  });
});
