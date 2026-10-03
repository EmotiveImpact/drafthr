import { expect, it } from "vitest";
import { attachmentsHtml, figuresHtml } from "./evidence-html";
import { buildPreviewSourceHtml } from "@/components/editor/paged-edit/sourceHtml";
import { letterBodyHtml } from "./export/pdf";
import type { Draft, EvidenceItem } from "./letters/types";
const items: EvidenceItem[] = [
  { id: "figure", kind: "document", content: "Fictional note <not markup>", filename: "<test>.txt", fileId: "private-file",
    uploadedAt: 1, includeVerbatim: false },
  { id: "attached", kind: "note", content: "Attached detail", displayMode: "attached", uploadedAt: 1, includeVerbatim: false },
  { id: "pack", kind: "note", content: "Pack-only text", displayMode: "pack_only", uploadedAt: 1, includeVerbatim: false },
];
it("shares exact appendix content between preview and PDF", () => {
  const draft = { letterType: "reference", mode: "employer", evidence: items, sections: [], employer: {}, context: { jurisdiction: "UK" } } as unknown as Draft;
  const preview = buildPreviewSourceHtml(draft), pdf = letterBodyHtml(draft);
  for (const appendix of [attachmentsHtml(items), figuresHtml(items)]) {
    expect(preview).toContain(appendix); expect(pdf).toContain(appendix);
  }
  expect(pdf).toContain("Fig 1"); expect(pdf).toContain("&lt;test&gt;.txt");
  expect(pdf).toContain("Original file supplied separately");
  expect(pdf).not.toContain("Pack-only text");
});
it("refuses to export a private image that has not been resolved", () => {
  expect(() => figuresHtml([{ ...items[0], mimeType: "image/png" }], { requireResolvedImages: true }))
    .toThrow("Load the private exhibit");
});
it("numbers attachments once and omits an empty appendix", () => {
  expect(attachmentsHtml(items)).not.toContain("[Attachment");
  expect(figuresHtml([])).toBe(""); expect(attachmentsHtml([])).toBe("");
});
it("finalise preview applies the same accepted changes as the export", () => {
  const draft = { letterType: "reference", employer: {}, context: { jurisdiction: "UK" }, sections: [{ id: "section", html:
    '<p>Keep <del data-suggestion-id="d" data-suggestion-kind="deletion" data-status="accepted">REMOVE_THIS</del><ins data-suggestion-id="i" data-suggestion-kind="insertion" data-status="accepted">APPROVED_TEXT</ins></p>'
  }] } as unknown as Draft;
  for (const html of [buildPreviewSourceHtml(draft, { forExport: true }), letterBodyHtml(draft)]) {
    expect(html).toContain("APPROVED_TEXT"); expect(html).not.toContain("REMOVE_THIS");
    expect(html).not.toContain("data-suggestion");
  }
});
