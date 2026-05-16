import { describe, expect, it } from "vitest";
import {
  buildMergeInstruction,
  findUnresolvedPlaceholders,
  personaliseTemplate,
  placeholderKeysFor,
  substituteHtml,
  substituteSections,
  type TemplateDraft,
} from "./mailmerge";

describe("substituteHtml", () => {
  it("replaces a single placeholder", () => {
    const out = substituteHtml(
      "<p>Dear {{employee_name}},</p>",
      { employee_name: "Jane Patel" }
    );
    expect(out).toBe("<p>Dear Jane Patel,</p>");
  });

  it("replaces multiple placeholders in one string", () => {
    const out = substituteHtml(
      "<p>Dear {{employee_name}}, {{outcome}}.</p>",
      { employee_name: "Jane Patel", outcome: "you have passed probation" }
    );
    expect(out).toBe("<p>Dear Jane Patel, you have passed probation.</p>");
  });

  it("handles whitespace inside braces", () => {
    expect(substituteHtml("<p>{{ employee_name }}</p>", { employee_name: "Jane" }))
      .toBe("<p>Jane</p>");
    expect(substituteHtml("<p>{{   employee_name   }}</p>", { employee_name: "Jane" }))
      .toBe("<p>Jane</p>");
  });

  it("is case-insensitive on the placeholder name", () => {
    expect(substituteHtml("<p>{{Employee_Name}}</p>", { employee_name: "Jane" }))
      .toBe("<p>Jane</p>");
    expect(substituteHtml("<p>{{EMPLOYEE_NAME}}</p>", { Employee_Name: "Jane" }))
      .toBe("<p>Jane</p>");
  });

  it("folds dots and hyphens to underscores when matching", () => {
    expect(substituteHtml("<p>{{employee-name}}</p>", { employee_name: "Jane" }))
      .toBe("<p>Jane</p>");
    expect(substituteHtml("<p>{{employee.name}}</p>", { employee_name: "Jane" }))
      .toBe("<p>Jane</p>");
  });

  it("HTML-escapes the substituted value to prevent injection", () => {
    const out = substituteHtml(
      "<p>{{name}}</p>",
      { name: '<script>alert(1)</script>' }
    );
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("HTML-escapes ampersands and quotes", () => {
    const out = substituteHtml(
      "<p>{{company}}</p>",
      { company: `Smith & Jones "Ltd"` }
    );
    expect(out).toContain("Smith &amp; Jones");
    expect(out).toContain("&quot;Ltd&quot;");
  });

  it("returns a visible marker for missing values", () => {
    const out = substituteHtml(
      "<p>{{employee_name}} starts on {{start_date}}.</p>",
      { employee_name: "Jane" }
    );
    expect(out).toBe("<p>Jane starts on [start_date not set].</p>");
  });

  it("preserves the original placeholder name in the missing marker", () => {
    const out = substituteHtml("<p>{{Custom-Field}}</p>", {});
    expect(out).toBe("<p>[Custom-Field not set]</p>");
  });

  it("coerces numeric row values to strings", () => {
    const out = substituteHtml("<p>{{years_service}} years.</p>", { years_service: 7 });
    expect(out).toBe("<p>7 years.</p>");
  });

  it("treats empty-string row values as missing", () => {
    const out = substituteHtml("<p>{{name}}</p>", { name: "" });
    expect(out).toBe("<p>[name not set]</p>");
  });

  it("returns the input unchanged when there are no placeholders", () => {
    expect(substituteHtml("<p>Plain text.</p>", { name: "Jane" })).toBe("<p>Plain text.</p>");
  });

  it("handles empty input gracefully", () => {
    expect(substituteHtml("", { name: "Jane" })).toBe("");
  });
});

describe("substituteSections", () => {
  it("substitutes across all sections", () => {
    const sections = [
      { id: "a", html: "<p>{{name}}</p>" },
      { id: "b", html: "<p>{{role}}</p>" },
    ];
    const out = substituteSections(sections, { name: "Jane", role: "Engineer" });
    expect(out[0].html).toBe("<p>Jane</p>");
    expect(out[1].html).toBe("<p>Engineer</p>");
  });

  it("does not mutate the input array or its elements", () => {
    const sections = [{ id: "a", html: "<p>{{name}}</p>" }];
    const before = sections[0].html;
    const out = substituteSections(sections, { name: "Jane" });
    expect(sections[0].html).toBe(before);
    expect(out).not.toBe(sections);
    expect(out[0]).not.toBe(sections[0]);
  });

  it("passes through sections without an html field", () => {
    const sections = [{ id: "a" }, { id: "b", html: "<p>{{name}}</p>" }];
    const out = substituteSections(sections, { name: "Jane" });
    expect(out[0]).toEqual({ id: "a" });
    expect(out[1].html).toBe("<p>Jane</p>");
  });

  it("preserves extra properties on each section", () => {
    const sections = [
      { id: "a", html: "<p>{{name}}</p>", title: "Salutation", required: true },
    ];
    const out = substituteSections(sections, { name: "Jane" });
    expect(out[0]).toEqual({
      id: "a",
      html: "<p>Jane</p>",
      title: "Salutation",
      required: true,
    });
  });
});

describe("findUnresolvedPlaceholders", () => {
  it("returns [] when every placeholder is filled", () => {
    expect(findUnresolvedPlaceholders("<p>Dear Jane,</p>")).toEqual([]);
  });

  it("returns the unique placeholder names left in the HTML", () => {
    const out = findUnresolvedPlaceholders(
      "<p>{{name}} {{role}} {{name}}</p>"
    );
    expect(out.sort()).toEqual(["name", "role"]);
  });

  it("does not match malformed tokens", () => {
    expect(findUnresolvedPlaceholders("<p>{{ }}</p>")).toEqual([]);
    expect(findUnresolvedPlaceholders("<p>{name}</p>")).toEqual([]);
  });
});

describe("placeholderKeysFor", () => {
  it("returns sensible keys for a known letterType (probation_outcome)", () => {
    const keys = placeholderKeysFor("probation_outcome", ["employee_name", "outcome_label"]);
    // CSV headers come first
    expect(keys[0]).toBe("employee_name");
    expect(keys).toContain("outcome_label");
    // Universal aliases must always be present
    expect(keys).toContain("employee_job_title");
    expect(keys).toContain("employee_email");
    expect(keys).toContain("employee_start_date");
  });

  it("deduplicates header/alias overlap case-insensitively", () => {
    const keys = placeholderKeysFor("probation_outcome", ["Employee_Name", "employee_name"]);
    const lowered = keys.map((k) => k.toLowerCase());
    const unique = new Set(lowered);
    expect(unique.size).toBe(lowered.length);
  });
});

describe("buildMergeInstruction", () => {
  it("includes the master-prompt override even with an empty key list", () => {
    const out = buildMergeInstruction([]);
    expect(out).toMatch(/MAIL-MERGE TEMPLATE MODE/);
    expect(out).toMatch(/OVERRIDE/);
  });

  it("renders the placeholder list inline as {{name}} tokens", () => {
    const out = buildMergeInstruction(["employee_name", "role"]);
    expect(out).toContain("{{employee_name}}");
    expect(out).toContain("{{role}}");
  });
});

describe("personaliseTemplate", () => {
  it("returns a new array with substituted html, leaving the template untouched", () => {
    const tpl: TemplateDraft = {
      letterType: "probation_outcome",
      mode: "employer",
      jurisdiction: "UK",
      seedAnswers: {},
      sections: [
        { sectionId: "salutation", title: "Salutation", required: true, html: "<p>Dear {{employee_name}},</p>" },
        { sectionId: "body", title: "Body", required: true, html: "<p>You have {{outcome}}.</p>" },
      ],
    };
    const out = personaliseTemplate(tpl, { employee_name: "Jane", outcome: "passed" });
    expect(out[0].html).toBe("<p>Dear Jane,</p>");
    expect(out[1].html).toBe("<p>You have passed.</p>");
    // Template untouched.
    expect(tpl.sections[0].html).toBe("<p>Dear {{employee_name}},</p>");
  });
});
