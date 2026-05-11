import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { sectionLabels } from "@/lib/evidence";
import { buildDraftTimeline } from "@/lib/timeline";
import {
  buildTemplateQualityReport,
  type TemplateRequirementStatus,
} from "@/lib/template-quality";

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

export function exportLetterPack(
  draft: Draft,
  attestation?: ExportAttestation
): void {
  const html = buildExportPackHtml(draft, attestation);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, filenameForPack(draft));
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
  return `${draft.letterType}-${safe || "letter"}-${draft.context.issueDate}-pack.html`;
}

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!url?.startsWith("data:image/")) return "";
  return `<div style="margin:0 0 24px 0;text-align:center;"><img src="${escapeAttribute(url)}" style="max-width:100%;max-height:120px;display:inline-block;" alt="" /></div>`;
}

function imageDataUrl(item: EvidenceItem): string | undefined {
  if (!item.fileDataUrl?.startsWith("data:image/")) return undefined;
  if (!item.mimeType?.startsWith("image/")) return undefined;
  return item.fileDataUrl;
}

function labelForEvidence(item: EvidenceItem): string {
  return item.kind[0].toUpperCase() + item.kind.slice(1);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
