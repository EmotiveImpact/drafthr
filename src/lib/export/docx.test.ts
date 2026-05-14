import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderLetterDocxBlob } from "./docx";
import type { Draft } from "@/lib/letters/types";

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("renderLetterDocxBlob", () => {
  it("creates a valid DOCX package with rich text, lists, tables, and images", async () => {
    const blob = await renderLetterDocxBlob(makeDraft());
    const zip = await JSZip.loadAsync(blob);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");

    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("word/styles.xml")).toBeTruthy();
    expect(documentXml).toContain("<w:document");
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("<w:i/>");
    expect(documentXml).toContain("First point");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("<w:drawing>");
    expect(relsXml).toContain("relationships/image");
    expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/image"))).toBe(true);
  });
});

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
      letterheadDataUrl: ONE_BY_ONE_PNG,
      signatureDataUrl: ONE_BY_ONE_PNG,
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
        html: `<h2>Formal warning</h2>
          <p>This is <strong>important</strong> and <em>time-sensitive</em>.</p>
          <ul><li>First point</li><li>Second point</li></ul>
          <table><tr><th>Date</th><th>Issue</th></tr><tr><td>1 Jan</td><td>Conduct</td></tr></table>`,
      },
      {
        id: "s2",
        sectionId: "signature",
        title: "Signature",
        required: true,
        status: "ready",
        versions: [],
        html: `<p>Alex HR<br />People Lead</p>`,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  };
}
