import { describe, it, expect } from "vitest";
import { buildEvidenceIndexHtml, buildExportPackHtml } from "@/lib/export/pack";
import { displayTitleFor } from "@/lib/letters/display";
import type { Draft } from "@/lib/letters/types";

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
        html: '<p>We confirm <del data-suggestion-id="s1" data-author="Reviewer Rae" data-status="pending">the old wording</del><ins data-suggestion-id="s2" data-author="Reviewer Rae" data-body="softer please" data-status="pending">a proposed change</ins> and <mark data-comment-id="c1">this point</mark>.</p>',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

describe("buildExportPackHtml — letter section", () => {
  it("ships the clean letter, without reviewer track changes or comment marks", () => {
    const html = buildExportPackHtml(makeDraft());
    expect(html).toContain("We confirm");
    // A pending insertion is a reviewer proposal, not the letter.
    expect(html).not.toContain("a proposed change");
    expect(html).not.toMatch(/<(ins|del|mark)\b/);
    expect(html).not.toContain("Reviewer Rae");
    expect(html).not.toContain("softer please");
    expect(html).not.toContain("data-comment-id");
  });
});

describe("pack titles (SEND-X33)", () => {
  it("keep who the letter is for when the letter has its own title", () => {
    const draft = { ...makeDraft(), title: "Final written warning" };
    expect(buildExportPackHtml(draft)).toContain("<h1>Evidence pack: Final written warning · Jamie Worker</h1>");
    expect(buildEvidenceIndexHtml(draft)).toContain("<title>Exhibit index: Final written warning · Jamie Worker</title>");
  });

  it("name the letter as people read it, with no em dash or internal type id", () => {
    const draft = makeDraft();
    const name = displayTitleFor(draft);
    expect(name).not.toBe("warning");
    const summary = buildExportPackHtml(draft);
    expect(summary).toContain(`<title>Evidence pack: ${name}</title>`);
    expect(summary).toContain(`<h1>Evidence pack: ${name}</h1>`);
    expect(summary).not.toContain("warning evidence pack");
    const index = buildEvidenceIndexHtml(draft);
    expect(index).toContain(`<title>Exhibit index: ${name}</title>`);
    expect(index).toContain("<h1>Exhibit index</h1>");
    for (const html of [summary, index]) {
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      expect(title).not.toMatch(/\u2014/);
      expect(html).not.toMatch(/· warning ·/);
    }
  });
});

describe("packDateTime", () => {
  it("uses the letter's jurisdiction, not the browser locale, with a month name", async () => {
    const { packDateTime } = await import("@/lib/export/pack");
    const at = Date.UTC(2026, 8, 10, 12, 0);
    const uk = packDateTime({ context: { jurisdiction: "UK" } } as Draft, at);
    const us = packDateTime({ context: { jurisdiction: "US" } } as Draft, at);
    expect(uk).toMatch(/^10 Sept? 2026/);
    expect(us).toMatch(/^Sep 10, 2026/);
  });
});

describe("pack copy people read (SEND-X37)", () => {
  it("shows dates in words and template guidance without em dashes", async () => {
    const { packDate, plainPunctuation } = await import("@/lib/export/pack");
    const draft = makeDraft();
    const attested = { reviewedBy: "Priya Shah", reviewedOn: "2026-01-01" };
    const html = buildExportPackHtml(draft, attested);
    expect(html).toContain("Issued 2 Jan 2026");
    expect(html).toContain("Priya Shah on 1 Jan 2026");
    // Only the letter's own text (none here) may carry a raw date; the pack's copy never does.
    expect(html.replace(/<article[\s\S]*<\/article>/, "")).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(html).not.toMatch(/—/);
    expect(packDate({ context: { jurisdiction: "US" } } as Draft, "2026-10-14")).toBe("Oct 14, 2026");
    expect(plainPunctuation("MUST NOT use intensifiers ('serious', 'severe') — let the facts carry the weight.")).toBe(
      "MUST NOT use intensifiers ('serious', 'severe'): let the facts carry the weight."
    );
  });
});

/** The words the pack itself shows (not its styles, and not the letter's own text). */
function packCopy(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<article[\s\S]*<\/article>/, "")
    .replace(/<[^>]+>/g, " ");
}

describe("no developer or template wording in the pack (SEND-X43)", () => {
  it("leaves the drafting model's markup rules out of the section checks and reads them in sentence case", async () => {
    const { loadTemplate } = await import("@/lib/letters/templates");
    await loadTemplate("warning", "UK");
    const draft = makeDraft();
    draft.sections = [
      { ...draft.sections[0], id: "r", sectionId: "recipient_block", title: "Date and recipient", html: "<p>14 October 2026<br>Jamie Worker</p>" },
      { ...draft.sections[0], id: "c", sectionId: "closing", title: "Closing", html: "<p>Yours sincerely,</p>" },
    ];
    const html = buildExportPackHtml(draft);
    expect(html).toContain("<h2>Section checks</h2>");
    expect(html).not.toMatch(/single &lt;p&gt;|&lt;br&gt;|separated by/);
    expect(html).not.toMatch(/\bMUST\b/);
    expect(html).toContain("Must use UK date format.");
    expect(packCopy(html)).not.toMatch(/Template quality inspector|guardrail/i);
  });

  it("drops only the HTML rules", async () => {
    const { packRequirementText } = await import("@/lib/export/pack");
    expect(packRequirementText("MUST place date and address inside a single <p> separated by <br>.")).toBeNull();
    expect(packRequirementText("MUST be in <strong>.")).toBeNull();
    expect(packRequirementText("MUST NOT invent a title.")).toBe("Must not invent a title.");
    expect(packRequirementText("MUST use 'Yours sincerely,'.")).toBe("Must use 'Yours sincerely,'.");
  });

  it("shows the checklist's status in words, not status codes", () => {
    const html = buildExportPackHtml(makeDraft());
    expect(html).toMatch(/<span class="pill ok">Done<\/span>/);
    expect(html).not.toMatch(/<span class="pill \w+">(ok|check|missing)<\/span>/);
    expect(packCopy(html)).not.toMatch(/AI prompt use|attested|issuance|detected/);
  });

  it("writes the README in plain words", async () => {
    const { buildReadme } = await import("@/lib/export/pack");
    const readme = buildReadme(makeDraft(), undefined, [], { pdf: "letter.pdf", docx: "letter.docx" });
    expect(readme).not.toMatch(/DRAFTHR install|reproducible|tribunal-grade|Machine-readable|\+/);
    expect(readme).toContain("letter in two formats");
    expect(readme).toContain("you do not need to open them");
  });
});
