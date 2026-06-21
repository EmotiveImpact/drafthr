import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { clampImageSizePx, renderLetterDocxBlob } from "./docx";
import type { Draft } from "@/lib/letters/types";

describe("clampImageSizePx — preserves aspect ratio under size caps", () => {
  const MAXW = 6 * 96; // 576
  const MAXH = 2.5 * 96; // 240

  it("leaves a within-bounds image untouched", () => {
    const r = clampImageSizePx(400, 200, 2, { maxWidthPx: MAXW, maxHeightPx: MAXH });
    expect(r.widthPx).toBeCloseTo(400);
    expect(r.heightPx).toBeCloseTo(200);
  });

  it("scales BOTH axes when width exceeds the cap (no squashing)", () => {
    // 800x400 (ratio 2:1) must clamp to 576x288... but 288 > MAXH(240), so it
    // shrinks further to fit height too — ratio stays 2:1 throughout.
    const r = clampImageSizePx(800, 400, 2, { maxWidthPx: MAXW, maxHeightPx: MAXH });
    expect(r.widthPx / r.heightPx).toBeCloseTo(2, 5);
    expect(r.widthPx).toBeLessThanOrEqual(MAXW + 0.01);
    expect(r.heightPx).toBeLessThanOrEqual(MAXH + 0.01);
  });

  it("regression: width-only clamp no longer distorts the ratio", () => {
    // The OLD code clamped width to 576 but left height at 400 -> ratio 1.44.
    const r = clampImageSizePx(800, 400, 2, { maxWidthPx: MAXW, maxHeightPx: 1000 });
    expect(r.widthPx).toBeCloseTo(MAXW); // clamped to page width
    expect(r.heightPx).toBeCloseTo(MAXW / 2); // 288, re-derived from ratio — NOT 400
  });

  it("scales both axes when height exceeds the cap", () => {
    const r = clampImageSizePx(200, 600, 1 / 3, { maxWidthPx: MAXW, maxHeightPx: MAXH });
    expect(r.heightPx).toBeCloseTo(MAXH);
    expect(r.widthPx / r.heightPx).toBeCloseTo(1 / 3, 5);
  });

  it("falls back to independent clamps when ratio is unknown", () => {
    const r = clampImageSizePx(800, 600, null, { maxWidthPx: MAXW, maxHeightPx: MAXH });
    expect(r.widthPx).toBeCloseTo(MAXW);
    expect(r.heightPx).toBeCloseTo(MAXH);
  });

  it("applies a minimum floor", () => {
    const r = clampImageSizePx(2, 1, 2, { minPx: 24 });
    expect(r.widthPx).toBeGreaterThanOrEqual(24);
    expect(r.heightPx).toBeGreaterThanOrEqual(24);
  });
});

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

  it("regression: strips XML-illegal control chars so the package isn't corrupt", async () => {
    // Non-whitespace C0 control chars (SOH/BEL/NUL) survive DOMPurify as legal
    // HTML text and used to reach document.xml verbatim, making Word reject the
    // file as corrupt. escapeXml must remove them (these don't match \s, so the
    // surrounding whitespace normalization won't — this isolates the fix).
    const SOH = String.fromCharCode(0x01);
    const BEL = String.fromCharCode(0x07);
    const NUL = String.fromCharCode(0x00);
    const draft = makeDraft();
    draft.sections = [
      {
        id: "s1",
        sectionId: "body",
        title: "Body",
        required: true,
        status: "ready",
        versions: [],
        html: `<p>before${SOH}${BEL}${NUL}after</p>`,
      },
    ];

    const blob = await renderLetterDocxBlob(draft);
    const zip = await JSZip.loadAsync(blob);
    const documentXml = await zip.file("word/document.xml")!.async("string");

    // No XML 1.0-illegal C0 control characters remain anywhere in the part.
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(documentXml)).toBe(false);
    // The visible text survives with the illegal chars excised.
    expect(documentXml).toContain("beforeafter");
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
