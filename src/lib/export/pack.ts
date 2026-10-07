import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { sectionLabels, displayModeOf, figureLabelFor } from "@/lib/evidence";
import { buildDraftTimeline } from "@/lib/timeline";
import {
  buildTemplateQualityReport,
  type TemplateRequirementStatus,
} from "@/lib/template-quality";
import { renderLetterPdfBlob, filenameFor as pdfFilenameFor } from "./pdf";
import { renderLetterDocxBlob, docxFilenameFor } from "./docx";
import { isSafeImageDataUrl, isSafeImageRef } from "@/lib/safe-data-url";

type ExportAttestation = {
  reviewedBy: string;
  reviewedOn: string;
};

type ChecklistStatus = "ok" | "check" | "missing";

type ChecklistItem = {
  label: string;
  status: ChecklistStatus;
  detail: string;
};

/**
 * Build and download the export pack as a ZIP. Contents:
 *
 *   letter.pdf                Real PDF of the letter (server- or client-rendered)
 *   letter.docx               Real DOCX
 *   pack-summary.html         Cover sheet + checklist + quality + timeline
 *   manifest.json             Draft metadata, contents listing, model used
 *   audit.json                Version history, AI changes, comments, exports
 *   evidence/                 Original-quality files, one per item
 *     <NN>-<filename>.<ext>
 *   evidence/index.html       Paginated bundle of evidence with captions
 *   README.txt                Plain-English contents description
 *
 * Filename: {letter-type}-{case-ref}-{date}.zip
 */
export async function exportLetterPack(
  draft: Draft,
  attestation?: ExportAttestation
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Render the letter to both formats in parallel.
  const [pdfBlob, docxBlob] = await Promise.all([
    renderLetterPdfBlob(draft).catch(() => null),
    renderLetterDocxBlob(draft).catch(() => null),
  ]);

  // A pack without the letter is not an evidence pack. Fail loudly rather
  // than download a ZIP whose README lists files it doesn't contain.
  if (!pdfBlob && !docxBlob) {
    throw new Error("Couldn't render the letter as PDF or Word, so the export pack was not created.");
  }

  if (pdfBlob) zip.file(pdfFilenameFor(draft), pdfBlob);
  if (docxBlob) zip.file(docxFilenameFor(draft), docxBlob);

  // Rich HTML summary (the old single-file pack format), retained as a
  // human-readable index inside the ZIP.
  zip.file("pack-summary.html", buildExportPackHtml(draft, attestation));

  // Evidence — original files at full quality + a paginated index.
  const evidence = draft.evidence ?? [];
  if (evidence.length > 0) {
    const evidenceFolder = zip.folder("evidence")!;
    evidence.forEach((item, idx) => {
      if (item.fileDataUrl) {
        const parsed = parseDataUrl(item.fileDataUrl);
        if (parsed) {
          evidenceFolder.file(evidenceFileName(item, idx), parsed.bytes, { binary: true });
        }
      } else if (item.content) {
        // Note-only items get written as .txt
        evidenceFolder.file(evidenceFileName(item, idx), item.content);
      }
    });
    evidenceFolder.file("index.html", buildEvidenceIndexHtml(draft));
  }

  // Machine-readable manifest + audit so the pack is reproducible.
  zip.file("manifest.json", JSON.stringify(buildManifest(draft, attestation, evidence), null, 2));
  zip.file("audit.json", JSON.stringify(buildAudit(draft), null, 2));
  zip.file(
    "README.txt",
    buildReadme(draft, attestation, evidence, {
      pdf: pdfBlob ? pdfFilenameFor(draft) : undefined,
      docx: docxBlob ? docxFilenameFor(draft) : undefined,
    }),
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  triggerDownload(blob, filenameForPack(draft));
}

/* ============================================================================
 * Pack contents builders
 * ==========================================================================*/

function buildManifest(
  draft: Draft,
  attestation: ExportAttestation | undefined,
  evidence: EvidenceItem[]
): Record<string, unknown> {
  return {
    draftId: draft.id,
    letterType: draft.letterType,
    mode: draft.mode,
    jurisdiction: draft.context.jurisdiction,
    issueDate: draft.context.issueDate,
    employee: { legalName: draft.employee.legalName },
    employer: { legalName: draft.employer.legalName },
    counselReview: attestation ?? null,
    sections: draft.sections.map((s) => ({
      id: s.id,
      sectionId: s.sectionId,
      title: s.title,
      status: s.status,
      required: s.required,
      wordCount: stripHtml(s.html).split(/\s+/).filter(Boolean).length,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      filename: e.filename,
      mimeType: e.mimeType,
      sectionIds: e.sectionIds ?? [],
      includeVerbatim: e.includeVerbatim,
      uploadedAt: e.uploadedAt,
    })),
    generatedAt: new Date().toISOString(),
    appVersion: "0.3.0",
  };
}

function buildAudit(draft: Draft): Record<string, unknown> {
  return {
    draftId: draft.id,
    versions: (draft.sections ?? []).map((s) => ({
      sectionId: s.id,
      versions: (s.versions ?? []).map((v) => ({
        createdAt: v.createdAt,
        modelName: v.modelName,
        wordCount: stripHtml(v.html).split(/\s+/).filter(Boolean).length,
      })),
    })),
    comments: (draft.comments ?? []).map((c) => ({
      id: c.id,
      sectionId: c.sectionId,
      author: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
      resolved: c.resolved,
      quote: c.quote,
    })),
    exports: (draft.exports ?? []),
  };
}

function buildReadme(
  draft: Draft,
  attestation: ExportAttestation | undefined,
  evidence: EvidenceItem[],
  letterFiles: { pdf?: string; docx?: string },
): string {
  const lines: string[] = [];
  lines.push(`DRAFTHR EXPORT PACK`);
  lines.push(`====================`);
  lines.push("");
  lines.push(`Letter type:    ${draft.letterType}`);
  lines.push(`Mode:           ${draft.mode}`);
  lines.push(`Jurisdiction:   ${draft.context.jurisdiction}`);
  lines.push(`Issue date:     ${draft.context.issueDate}`);
  lines.push(`Generated:      ${new Date().toISOString()}`);
  lines.push("");
  if (attestation) {
    lines.push(`Counsel review: ${attestation.reviewedBy} on ${attestation.reviewedOn}`);
  } else {
    lines.push(`Counsel review: not attested`);
  }
  lines.push("");
  lines.push(`CONTENTS`);
  lines.push(`--------`);
  // List the letter files actually in the ZIP, under their real names.
  if (letterFiles.pdf) lines.push(`  ${letterFiles.pdf}`, `                        Print-ready PDF of the letter.`);
  if (letterFiles.docx) lines.push(`  ${letterFiles.docx}`, `                        Editable Word version.`);
  lines.push(`  pack-summary.html     One-page summary: review checklist, quality`);
  lines.push(`                        report, change timeline. Open in any browser.`);
  lines.push(`  manifest.json         Machine-readable index of the pack.`);
  lines.push(`  audit.json            Version history, comments, prior exports.`);
  if (evidence.length > 0) {
    lines.push(`  evidence/             ${evidence.length} item${evidence.length === 1 ? "" : "s"} of evidence at original quality.`);
    lines.push(`  evidence/index.html   Paginated bundle with captions.`);
  }
  lines.push("");
  lines.push(`USE`);
  lines.push(`---`);
  lines.push(`This pack is self-contained. Send the ZIP, the recipient gets:`);
  lines.push(`the letter in two formats, every piece of evidence at full quality,`);
  lines.push(`and a tribunal-grade index for navigation. The audit.json + manifest.json`);
  lines.push(`make the pack reproducible from a clean DRAFTHR install.`);
  lines.push("");
  lines.push(`Questions? Reply to the email this pack was attached to.`);
  return lines.join("\n");
}

/**
 * Build the exhibit index HTML page that goes inside the ZIP at
 * evidence/index.html. Groups items by display mode so the reader sees:
 *   1. Numbered figures (the main exhibit list)
 *   2. Attachments (referenced by name from the letter)
 *   3. Pack-only supporting material
 *
 * Figures get their effective label (auto Fig N or user override) as the
 * heading. Each item also notes which letter sections it backs up.
 */
function buildEvidenceIndexHtml(draft: Draft): string {
  const evidence = draft.evidence ?? [];
  const figures = evidence.filter((e) => displayModeOf(e) === "figure");
  const attachments = evidence.filter((e) => displayModeOf(e) === "attached");
  const inlines = evidence.filter((e) => displayModeOf(e) === "inline");
  const packOnly = evidence.filter((e) => displayModeOf(e) === "pack_only");

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>Exhibit Index — ${escapeHtml(draft.letterType)}</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;max-width:920px;margin:32px auto;padding:0 24px;line-height:1.55}
  h1{font-size:24px;margin:0 0 4px 0}
  h2.section{font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin:32px 0 12px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  .meta{color:#64748b;font-size:12px;margin-bottom:32px}
  .item{border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid}
  .item h3{font-size:15px;margin:0 0 6px 0;display:flex;gap:8px;align-items:center}
  .figlabel{font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#0f172a;letter-spacing:0.01em}
  .kind{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;padding:2px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:600}
  .caption{color:#64748b;font-size:12px;margin-bottom:8px}
  .body{font-size:13px;white-space:pre-wrap;background:#f8fafc;padding:10px;border-radius:6px}
  img{max-width:100%;height:auto;border-radius:6px;margin-top:8px}
  a{color:#0f172a}
  .empty{color:#94a3b8;font-style:italic}
</style></head><body>
<h1>Exhibit Index</h1>
<p class="meta">${evidence.length} item${evidence.length === 1 ? "" : "s"} · ${escapeHtml(draft.letterType)} · Generated ${escapeHtml(new Date().toLocaleString())}</p>

${
  figures.length > 0
    ? `<h2 class="section">Figures (referenced from letter)</h2>
${figures.map((item, idx) => renderExhibitItem(draft, item, idx, evidence, "figure")).join("\n")}`
    : ""
}

${
  attachments.length > 0
    ? `<h2 class="section">Attachments</h2>
${attachments.map((item, idx) => renderExhibitItem(draft, item, idx, evidence, "attached")).join("\n")}`
    : ""
}

${
  inlines.length > 0
    ? `<h2 class="section">Inline (embedded in letter body)</h2>
${inlines.map((item, idx) => renderExhibitItem(draft, item, idx, evidence, "inline")).join("\n")}`
    : ""
}

${
  packOnly.length > 0
    ? `<h2 class="section">Supporting material (pack only)</h2>
${packOnly.map((item, idx) => renderExhibitItem(draft, item, idx, evidence, "pack_only")).join("\n")}`
    : ""
}
</body></html>`;
}

function renderExhibitItem(
  draft: Draft,
  item: EvidenceItem,
  idx: number,
  allEvidence: EvidenceItem[],
  mode: "figure" | "attached" | "inline" | "pack_only"
): string {
  const padded = String(idx + 1).padStart(2, "0");
  const isImage = item.mimeType?.startsWith("image/");
  const imageUrl = isImage ? imageDataUrl(item) : undefined;
  const label =
    mode === "figure"
      ? figureLabelFor(item, allEvidence)
      : mode === "attached"
      ? `Attachment ${idx + 1}`
      : "";
  return `<div class="item">
      <h3>
        ${label ? `<span class="figlabel">${escapeHtml(label)}</span>` : ""}
        <span class="kind">${escapeHtml(item.kind)}</span>
        ${escapeHtml(item.filename || `Item ${padded}`)}
      </h3>
      ${item.sectionIds?.length ? `<div class="caption">Backs up: ${escapeHtml(sectionLabels(draft, item.sectionIds))}</div>` : ""}
      ${item.content ? `<div class="body">${escapeHtml(item.content)}</div>` : ""}
      ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeHtml(item.filename || "")}" />` : ""}
      ${
        !isImage && item.fileDataUrl
          ? `<p style="margin-top:8px"><a href="${escapeAttribute(
              // Use the SAME name the write loop produced (full-array index +
              // ext/sanitize/truncation) so the link resolves (bug #10).
              "./" + evidenceFileName(item, allEvidence.indexOf(item)),
            )}">Open file →</a></p>`
          : ""
      }
    </div>`;
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function parseDataUrl(url: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  try {
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime: m[1], bytes };
  } catch {
    return null;
  }
}

/**
 * The on-disk filename for an evidence item inside the pack — `NN-<name>`.
 * `idx` MUST be the item's index in the full `draft.evidence` array (not a
 * per-display-mode filtered index) so the index.html links and the written
 * files agree (bug #10). Shared by the write loop and the index renderer so
 * the href always points at the file that actually exists (correct extension,
 * sanitised chars, 80-char truncation).
 */
export function evidenceFileName(item: EvidenceItem, idx: number): string {
  const padded = String(idx + 1).padStart(2, "0");
  if (item.fileDataUrl) {
    const parsed = parseDataUrl(item.fileDataUrl);
    const mime = parsed?.mime ?? item.mimeType ?? "";
    const ext = (mime ? extFromMime(mime) : null) || extFromFilename(item.filename);
    const safeName = sanitizeFilename(item.filename || `${item.kind}.${ext || "bin"}`);
    // `ext` is always lowercase but `safeName` preserves the filename's case, so
    // the "already has this extension?" check must be case-insensitive —
    // otherwise "Photo.PNG" becomes "Photo.PNG.png" (doubled extension).
    const name =
      ext && !safeName.toLowerCase().endsWith(`.${ext}`) ? `${safeName}.${ext}` : safeName;
    return `${padded}-${name}`;
  }
  // Note-only item → .txt
  const safeName = sanitizeFilename(item.filename || `${item.kind}-${padded}.txt`);
  return `${padded}-${safeName.toLowerCase().endsWith(".txt") ? safeName : `${safeName}.txt`}`;
}

function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "message/rfc822": "eml",
  };
  return map[mime.toLowerCase()] ?? null;
}

function extFromFilename(name?: string): string | null {
  if (!name) return null;
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildExportPackHtml(
  draft: Draft,
  attestation?: ExportAttestation
): string {
  const generatedAt = new Date().toLocaleString();
  const quality = buildTemplateQualityReport(draft);
  const timeline = buildDraftTimeline(draft).slice().reverse();
  const evidence = draft.evidence ?? [];
  const checklist = buildReviewChecklist(draft, attestation);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(packTitle(draft))}</title>
  <style>
    :root {
      color: #172033;
      background: #f6f5f2;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    body { margin: 0; background: #f6f5f2; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }
    h1, h2, h3 { color: #111827; line-height: 1.2; margin: 0; }
    h1 { font-size: 30px; letter-spacing: -0.01em; }
    h2 { font-size: 18px; margin-bottom: 14px; }
    h3 { font-size: 14px; margin-bottom: 8px; }
    p { margin: 0 0 10px; }
    .meta { color: #5d6678; font-size: 13px; margin-top: 8px; }
    .section { background: #ffffff; border: 1px solid #dadde4; border-radius: 8px; padding: 22px; margin-top: 18px; }
    .letter-page {
      background: #ffffff;
      border: 1px solid #dadde4;
      border-radius: 8px;
      padding: 48px;
      font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #0f172a;
    }
    .letter-page h2 { font-family: inherit; font-size: 15pt; margin: 18pt 0 8pt; }
    .letter-page p { margin: 0 0 8pt; }
    .letter-page table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
    .letter-page th, .letter-page td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { border: 1px solid #e1e4ea; border-radius: 8px; padding: 14px; background: #fbfbfa; }
    .label { color: #5d6678; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .value { margin-top: 4px; font-size: 13px; color: #172033; }
    .pill { display: inline-flex; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
    .ok { background: #e8f5ed; color: #19633c; }
    .check { background: #fff4d8; color: #7a4b00; }
    .missing { background: #fde8e8; color: #9f1d1d; }
    .guardrail { background: #eef0f3; color: #5d6678; }
    ul.clean { list-style: none; padding: 0; margin: 0; }
    ul.clean > li { border-top: 1px solid #e8eaf0; padding: 10px 0; }
    ul.clean > li:first-child { border-top: 0; padding-top: 0; }
    .muted { color: #5d6678; }
    .small { font-size: 12px; }
    .evidence-img { max-width: 100%; max-height: 260px; object-fit: contain; border: 1px solid #dadde4; border-radius: 6px; margin-top: 10px; }
    .timeline-time { color: #5d6678; font-size: 12px; white-space: nowrap; }
    @media print {
      body { background: white; }
      main { max-width: none; padding: 0; }
      .section, .letter-page { break-inside: avoid; border-color: #cbd5e1; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(packTitle(draft))}</h1>
      <p class="meta">Generated ${escapeHtml(generatedAt)} · ${escapeHtml(draft.context.jurisdiction)} · ${escapeHtml(draft.context.issueDate)}</p>
    </header>

    <section class="section">
      <h2>Draft Summary</h2>
      <div class="grid">
        ${summaryCard("Letter type", draft.letterType)}
        ${summaryCard(draft.mode === "employer" ? "Recipient" : "Employer", draft.mode === "employer" ? draft.employee.legalName : draft.employer.legalName)}
        ${summaryCard("Issue date", draft.context.issueDate)}
        ${summaryCard("Evidence items", String(evidence.length))}
        ${summaryCard("Counsel review", attestation ? `${attestation.reviewedBy} on ${attestation.reviewedOn}` : draft.context.counselReviewRequired ? "Required" : "Not required")}
      </div>
    </section>

    <section class="section">
      <h2>Review Checklist</h2>
      <ul class="clean">
        ${checklist.map(renderChecklistItem).join("")}
      </ul>
    </section>

    <section class="section">
      <h2>Letter</h2>
      <article class="letter-page">
        ${letterheadHtml(draft)}
        ${draft.sections.map((section) => sanitizeLetterHtml(section.html)).join("\n")}
        <hr />
        ${sanitizeLetterHtml(disclaimerHtmlFor(draft))}
      </article>
    </section>

    <section class="section">
      <h2>Evidence List</h2>
      ${
        evidence.length === 0
          ? `<p class="muted">No evidence items have been added to this draft.</p>`
          : `<ul class="clean">${evidence.map((item, index) => renderEvidenceItem(draft, item, index)).join("")}</ul>`
      }
    </section>

    <section class="section">
      <h2>Template Quality Inspector</h2>
      <p class="small muted">${quality.summary.covered} covered · ${quality.summary.missing} missing · ${quality.summary.needsReview} need review · ${quality.summary.guardrails} guardrails</p>
      <ul class="clean">
        ${quality.sections
          .filter((section) => section.requirements.length > 0)
          .map(
            ({ section, requirements }) => `<li>
              <h3>${escapeHtml(section.title)}</h3>
              <ul class="clean">
                ${requirements
                  .map(
                    (requirement) => `<li>
                      <span class="pill ${statusClass(requirement.status)}">${escapeHtml(statusLabel(requirement.status))}</span>
                      <span class="small">${escapeHtml(requirement.text)}</span>
                    </li>`
                  )
                  .join("")}
              </ul>
            </li>`
          )
          .join("")}
      </ul>
    </section>

    <section class="section">
      <h2>Timeline</h2>
      ${
        timeline.length === 0
          ? `<p class="muted">No timeline events yet.</p>`
          : `<ul class="clean">${timeline
              .map(
                (event) => `<li>
                  <div class="timeline-time">${escapeHtml(new Date(event.createdAt).toLocaleString())}</div>
                  <strong>${escapeHtml(event.title)}</strong>
                  ${event.sectionTitle ? `<div class="small muted">${escapeHtml(event.sectionTitle)}</div>` : ""}
                  ${event.detail ? `<p class="small muted">${escapeHtml(event.detail)}</p>` : ""}
                </li>`
              )
              .join("")}</ul>`
      }
    </section>
  </main>
</body>
</html>`;
}

function buildReviewChecklist(
  draft: Draft,
  attestation?: ExportAttestation
): ChecklistItem[] {
  const quality = buildTemplateQualityReport(draft);
  const requiredSections = draft.sections.filter((section) => section.required);
  const emptyRequiredSections = requiredSections.filter((section) => !stripHtml(section.html));
  const placeholderCount = (draft.sections.map((section) => section.html).join("\n").match(/\[TBD\]/gi) ?? []).length;
  const evidence = draft.evidence ?? [];
  const linkedEvidence = evidence.filter((item) => item.sectionIds?.length).length;
  const complianceMissing = quality.compliance.filter((item) => !item.present);

  return [
    {
      label: "Required sections",
      status: emptyRequiredSections.length === 0 ? "ok" : "missing",
      detail:
        emptyRequiredSections.length === 0
          ? `${requiredSections.length} required sections have content.`
          : `${emptyRequiredSections.map((section) => section.title).join(", ")} need content.`,
    },
    {
      label: "Placeholders",
      status: placeholderCount === 0 ? "ok" : "check",
      detail:
        placeholderCount === 0
          ? "No [TBD] placeholders detected."
          : `${placeholderCount} [TBD] placeholder${placeholderCount === 1 ? "" : "s"} remain.`,
    },
    {
      label: "Rights and compliance checks",
      status: complianceMissing.length === 0 ? "ok" : "check",
      detail:
        complianceMissing.length === 0
          ? "No missing live compliance rules detected."
          : complianceMissing.map((item) => item.rule.label).join(", "),
    },
    {
      label: "Evidence and attachments",
      status: evidence.length === 0 ? "check" : "ok",
      detail:
        evidence.length === 0
          ? "No evidence items have been attached."
          : `${evidence.length} item${evidence.length === 1 ? "" : "s"} attached; ${linkedEvidence} linked to sections.`,
    },
    {
      label: "Counsel review",
      status:
        draft.context.counselReviewRequired && !attestation && !latestReview(draft)
          ? "check"
          : "ok",
      detail: attestation
        ? `Current export attested by ${attestation.reviewedBy} on ${attestation.reviewedOn}.`
        : latestReview(draft) ?? (draft.context.counselReviewRequired ? "Counsel review is required before issuance." : "No counsel-review gate required for this draft."),
    },
  ];
}

function latestReview(draft: Draft): string | undefined {
  const reviewed = (draft.exports ?? [])
    .filter((event) => event.reviewedBy)
    .sort((a, b) => b.exportedAt - a.exportedAt)[0];
  if (!reviewed?.reviewedBy) return undefined;
  return `Prior export attested by ${reviewed.reviewedBy}${reviewed.reviewedOn ? ` on ${reviewed.reviewedOn}` : ""}.`;
}

function renderChecklistItem(item: ChecklistItem): string {
  return `<li>
    <span class="pill ${item.status}">${escapeHtml(item.status)}</span>
    <strong>${escapeHtml(item.label)}</strong>
    <p class="small muted">${escapeHtml(item.detail)}</p>
  </li>`;
}

function renderEvidenceItem(draft: Draft, item: EvidenceItem, index: number): string {
  const links = sectionLabels(draft, item.sectionIds);
  const image = imageDataUrl(item);
  return `<li>
    <span class="label">Evidence ${index + 1} · ${escapeHtml(item.kind)}</span>
    <h3>${escapeHtml(item.filename || labelForEvidence(item))}</h3>
    <p class="small muted">Added ${escapeHtml(new Date(item.uploadedAt).toLocaleString())} · ${escapeHtml(links || "General draft evidence")}</p>
    <p>${escapeHtml(item.parsedSummary || item.content || "No summary supplied.")}</p>
    <p class="small muted">AI prompt use: ${item.includeVerbatim ? "verbatim content included" : "summary only"}</p>
    ${image ? `<img class="evidence-img" src="${escapeAttribute(image)}" alt="" />` : ""}
  </li>`;
}

function summaryCard(label: string, value: string | undefined): string {
  return `<div class="card">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${escapeHtml(value || "Not supplied")}</div>
  </div>`;
}

function statusLabel(status: TemplateRequirementStatus): string {
  if (status === "needs_review") return "Check";
  return status[0].toUpperCase() + status.slice(1);
}

function statusClass(status: TemplateRequirementStatus): string {
  if (status === "covered") return "ok";
  if (status === "missing") return "missing";
  if (status === "guardrail") return "guardrail";
  return "check";
}

function packTitle(draft: Draft): string {
  const party = draft.mode === "employer" ? draft.employee.legalName : draft.employer.legalName;
  return `${draft.letterType} export pack${party ? ` - ${party}` : ""}`;
}

function filenameForPack(draft: Draft): string {
  const safe = (draft.employee.legalName || draft.employer.legalName || "letter")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return `${draft.letterType}-${safe || "letter"}-${draft.context.issueDate}-pack.zip`;
}

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div style="margin:0 0 24px 0;text-align:center;"><img src="${escapeAttribute(url)}" style="max-width:100%;max-height:120px;display:inline-block;" alt="" /></div>`;
}

function imageDataUrl(item: EvidenceItem): string | undefined {
  if (!isSafeImageDataUrl(item.fileDataUrl)) return undefined;
  if (!item.mimeType?.startsWith("image/")) return undefined;
  return item.fileDataUrl;
}

function labelForEvidence(item: EvidenceItem): string {
  return item.kind[0].toUpperCase() + item.kind.slice(1);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
