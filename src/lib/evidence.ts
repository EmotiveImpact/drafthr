import type { Draft, EvidenceItem } from "@/lib/letters/types";

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

export function sectionLabels(draft: Draft, sectionIds: string[] | undefined): string {
  if (!sectionIds?.length) return "";
  return sectionIds
    .map((id) => draft.sections.find((section) => section.id === id)?.title)
    .filter((title): title is string => Boolean(title))
    .join(", ");
}
