import { describe, it, expect } from "vitest";
import { letterBodyHtml } from "@/lib/export/pdf";
import type { Draft } from "@/lib/letters/types";

// A crafted https URL that passes isSafeImageRef (scheme-only check) but carries
// attribute-breaking characters. If interpolated raw into src="...", it breaks
// out and injects an onerror handler that the client PDF iframe executes.
const MALICIOUS_URL = 'https://x/"><img src=x onerror=alert(document.domain)>';

function makeDraft(): Draft {
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
      letterheadDataUrl: MALICIOUS_URL,
      signatureDataUrl: MALICIOUS_URL,
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
        html: "<p>Body</p>",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

describe("letterBodyHtml — letterhead/signature URL escaping (XSS)", () => {
  it("escapes attribute-breaking characters in the letterhead/signature src", () => {
    const html = letterBodyHtml(makeDraft());

    // The raw breakout sequence must NOT appear — that would mean a second
    // <img onerror> was injected outside the intended src attribute.
    expect(html).not.toContain('"><img src=x onerror=');
    // The dangerous characters must be HTML-entity-escaped instead.
    expect(html).toContain("&quot;&gt;&lt;img");
    // And the (escaped) URL is still inside a src attribute as intended.
    expect(html).toContain('<img src="https://x/&quot;&gt;&lt;img');
  });
});
