import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildPreviewSourceHtml } from "@/components/editor/paged-edit/sourceHtml";
import { letterBodyHtml } from "./pdf";
import { renderLetterDocxBlob } from "./docx";
import { buildExhibitsAppendixHtml } from "./exhibits";
import type { Draft, EvidenceItem } from "@/lib/letters/types";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const evidence = [
  { id: "e1", kind: "email", filename: "warning-email.eml", content: "Email of 3 March", displayMode: "figure", uploadedAt: 1 },
  { id: "e2", kind: "screenshot", filename: "rota.png", mimeType: "image/png", fileDataUrl: PNG, displayMode: "figure", uploadedAt: 2 },
  { id: "e3", kind: "document", filename: "policy.pdf", content: "Policy", displayMode: "attached", uploadedAt: 3 },
  { id: "e4", kind: "note", filename: "private-note.txt", content: "Pack only", displayMode: "pack_only", uploadedAt: 4 },
] as unknown as EvidenceItem[];

describe("exhibits appear the same in the page preview, PDF and DOCX", () => {
  const draft = makeDraft();

  it("the preview, PDF body and DOCX all carry the Exhibits appendix with every figure", async () => {
    const preview = buildPreviewSourceHtml(draft);
    const pdf = letterBodyHtml(draft);
    const zip = await JSZip.loadAsync(await renderLetterDocxBlob(draft));
    const docx = await zip.file("word/document.xml")!.async("string");

    for (const [name, out] of [
      ["preview", preview],
      ["pdf", pdf],
      ["docx", docx],
    ] as const) {
      expect(out, name).toContain("Exhibits");
      expect(out, name).toContain("warning-email.eml");
      expect(out, name).toContain("Email of 3 March");
      expect(out, name).toContain("rota.png");
      expect(out, name).not.toContain("private-note.txt");
    }
    // The screenshot exhibit is embedded as an image in the DOCX.
    expect(docx).toContain("<w:drawing>");
    expect(Object.keys(zip.files).some((n) => n.startsWith("word/media/"))).toBe(true);
  });

  it("uses the same figure labels the letter body cites", () => {
    const html = buildExhibitsAppendixHtml(draft);
    const labels = [...html.matchAll(/<figcaption><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    expect(labels).toHaveLength(2);
    expect(letterBodyHtml(draft)).toContain(`[See ${labels[1]}]`);
  });

  it("renders nothing when there are no figure-mode items", () => {
    expect(buildExhibitsAppendixHtml({ evidence: [evidence[2]] })).toBe("");
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
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "Acme Ltd", address: "", hasLetterhead: false, signatoryName: "A", signatoryTitle: "B" },
    employee: { legalName: "Jamie", jobTitle: "Analyst", address: "", startDate: "2025-01-01", serviceMonths: 12 },
    answers: {},
    evidence,
    sections: [
      {
        id: "s1",
        sectionId: "body",
        title: "Body",
        required: true,
        status: "ready",
        versions: [],
        html: '<p>The rota <span class="figure-ref" data-fig-id="e2">[See Fig 9]</span> shows the shift.</p>',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}
