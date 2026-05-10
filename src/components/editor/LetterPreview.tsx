import type { Draft } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";

/**
 * Continuous, paper-styled preview of the assembled letter. Concatenates every
 * section's current HTML in order and renders it with the same typography that
 * will be used in the PDF/DOCX export. Updates live as the model streams or
 * the user edits a section.
 */
export function LetterPreview({ draft }: { draft: Draft }) {
  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-muted-foreground italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  const html = draft.sections
    .filter((s) => s.html && s.html.trim())
    .map((s) => sanitizeLetterHtml(s.html))
    .join("\n");

  return (
    <article
      className="letter-preview-paper mx-auto max-w-[760px] bg-[var(--letter-paper,#fffdf7)] text-[var(--letter-ink,#111)] shadow-sm"
      style={{
        padding: "56px 64px",
        fontFamily: "'Tinos', 'Source Serif Pro', Georgia, serif",
        fontSize: "15px",
        lineHeight: 1.6,
      }}
    >
      <div
        className="prose prose-sm max-w-none [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_table]:my-4 [&_table_td]:px-3 [&_table_td]:py-1 [&_table_th]:px-3 [&_table_th]:py-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
