import { describe, it, expect } from "vitest";
import { runHealthChecks } from "./healthChecks";
import type { Draft } from "@/lib/letters/types";

function makeDraft(html: string): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-02",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: true,
      letterheadDataUrl: undefined,
      signatureDataUrl: undefined,
      signatoryName: "Alex HR",
      signatoryTitle: "People Lead",
    },
    employee: {
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "",
      startDate: "2025-01-01",
      serviceMonths: 12,
    },
    answers: {},
    sections: [
      {
        id: "s1",
        sectionId: "body",
        title: "Body",
        required: true,
        status: "ready",
        versions: [],
        html,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

const placeholderCheck = (html: string) =>
  runHealthChecks(makeDraft(html)).find((c) => c.id === "placeholders")!;

describe("placeholder health check", () => {
  it("fails on the bracketed gaps the drafting prompt itself inserts", () => {
    const check = placeholderCheck("<p>Dear [employee name], at [employee address], by [TBD: confirm date].</p>");
    expect(check.severity).toBe("fail");
    expect(check.detail).toContain("employee name");
    expect(check.detail).toContain("employee address");
  });

  it("catches leftover {{tokens}} and mail merge gaps", () => {
    expect(placeholderCheck("<p>Notice of {{notice_period}}.</p>").severity).toBe("fail");
    expect(placeholderCheck("<p>Notice of [notice_period not set].</p>").severity).toBe("fail");
  });

  it("ignores case citations and [sic]", () => {
    const check = placeholderCheck("<p>See Agnew [2023] UKSC 33, and the words 'recieved' [sic].</p>");
    expect(check.severity).toBe("pass");
  });

  it("ignores the evidence references the editor inserts", () => {
    // EvidenceDrawer / evidence-refs.ts write these into the letter body; the
    // separate evidence check validates them.
    const check = placeholderCheck(
      '<p>The rota <span class="figure-ref" data-fig-id="e1">[See Fig 2]</span> and the emails ' +
        '<span class="attachment-ref" data-att-id="e2">[See Attachments]</span>, and the note [See Exhibit A].</p>',
    );
    expect(check.severity).toBe("pass");
  });

  it("ignores editorial brackets in quoted material", () => {
    const check = placeholderCheck("<p>She wrote 'you will be dismissed' [emphasis added] about [redacted].</p>");
    expect(check.severity).toBe("pass");
  });

  it("finds no placeholders in any template's worked example", async () => {
    const { loadAllTemplates, getTemplate } = await import("@/lib/letters/templates");
    const { TEMPLATE_METADATA } = await import("@/lib/letters/templates/metadata");
    await loadAllTemplates();
    const flagged: string[] = [];
    const keys = Object.keys(TEMPLATE_METADATA);
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      const [letterType, jurisdiction] = key.split("__") as [Draft["letterType"], "UK" | "US"];
      const tpl = getTemplate(letterType, jurisdiction);
      expect(tpl, key).toBeDefined();
      for (const s of tpl?.sections ?? []) {
        const check = placeholderCheck(s.example);
        if (check.severity !== "pass") flagged.push(`${key}/${s.sectionId}: ${check.detail}`);
      }
    }
    expect(flagged).toEqual([]);
  });
});
