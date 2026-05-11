import type { Draft, EvidenceDisplayMode, EvidenceItem } from "@/lib/letters/types";

/**
 * The effective display mode for an item. Falls back to "figure" — the
 * legal-tribunal-friendly default that puts every piece of evidence on a
 * numbered index without polluting the letter prose.
 */
export function displayModeOf(item: EvidenceItem): EvidenceDisplayMode {
  return item.displayMode ?? "figure";
}

/**
 * Effective figureLabel for an item: user override if set, else "Fig {N}"
 * where N is the position among figure-mode items in insertion order.
 * Returns "" for non-figure items.
 */
export function figureLabelFor(item: EvidenceItem, allEvidence: EvidenceItem[]): string {
  if (displayModeOf(item) !== "figure") return "";
  if (item.figureLabel?.trim()) return item.figureLabel.trim();
  const figures = allEvidence.filter((e) => displayModeOf(e) === "figure");
  const idx = figures.findIndex((e) => e.id === item.id);
  return idx >= 0 ? `Fig ${idx + 1}` : "Fig";
}

export function evidencePromptBlock(draft: Draft, sectionId?: string): string {
  const items = evidenceForSection(draft, sectionId);
  if (items.length === 0) return "(no evidence supplied)";

  return items
    .map((item, index) => {
      const linked = sectionLabels(draft, item.sectionIds);
      const summary =
        item.parsedSummary ||
        (item.includeVerbatim ? item.filename || "Verbatim content supplied" : item.content) ||
        item.filename ||
        "No summary supplied";
      const verbatim =
        item.includeVerbatim && item.content.trim()
          ? `\n  Verbatim user-supplied content: ${item.content.trim()}`
          : "";
      return `${index + 1}. ${item.kind.toUpperCase()}${
        item.filename ? ` · ${item.filename}` : ""
      }\n  Linked sections: ${linked || "general draft evidence"}\n  Summary: ${summary}${verbatim}`;
    })
    .join("\n");
}

export function evidenceForSection(draft: Draft, sectionId?: string): EvidenceItem[] {
  const items = draft.evidence ?? [];
  if (!sectionId) return items;
  return items.filter((item) => !item.sectionIds?.length || item.sectionIds.includes(sectionId));
}

export function linkedEvidenceForSection(draft: Draft, sectionId: string): EvidenceItem[] {
  return (draft.evidence ?? []).filter((item) => item.sectionIds?.includes(sectionId));
}

/**
 * Walk the letter HTML and rewrite `<span data-fig-id="…">[See Fig X]</span>`
 * references so the displayed label matches the CURRENT figureLabelFor()
 * result. The picker inserts the label at insert-time, so reorderings
 * after the fact would otherwise leave stale "[See Fig 1]" text.
 *
 * Runs purely via regex — no DOM. Cheap enough to do once per export.
 */
export function resolveFigureRefsInHtml(html: string, allEvidence: EvidenceItem[]): string {
  return html.replace(
    /<span\s+class="figure-ref"\s+data-fig-id="([^"]+)"\s*>[^<]*<\/span>/gi,
    (match, idAttr: string) => {
      const item = allEvidence.find((e) => e.id === idAttr);
      if (!item) return match;
      const label = figureLabelFor(item, allEvidence) || "Fig";
      return `<span class="figure-ref" data-fig-id="${escapeAttr(idAttr)}">[See ${escapeHtml(label)}]</span>`;
    }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function sectionLabels(draft: Draft, sectionIds: string[] | undefined): string {
  if (!sectionIds?.length) return "";
  return sectionIds
    .map((id) => draft.sections.find((section) => section.id === id)?.title)
    .filter((title): title is string => Boolean(title))
    .join(", ");
}
