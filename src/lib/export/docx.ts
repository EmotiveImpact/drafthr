import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml } from "@/lib/sanitize";

type HtmlToDocx = (
  html: string,
  header?: string | null,
  options?: Record<string, unknown>
) => Promise<Blob>;

export async function exportLetterToDocx(draft: Draft): Promise<void> {
  const mod = await import("html-to-docx");
  const htmlToDocx = (mod.default ?? mod) as unknown as HtmlToDocx;

  const html = `
<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #0f172a; }
  p { margin: 0 0 8pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 12pt 0; }
  em { color: #475569; font-style: italic; }
</style></head><body>
${draft.sections.map((s) => sanitizeLetterHtml(s.html)).join("\n")}
<hr />
${sanitizeLetterHtml(disclaimerHtmlFor(draft))}
</body></html>`;

  const blob = await htmlToDocx(html, undefined, {
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (draft.employee.legalName || "letter").replace(/[^a-z0-9]+/gi, "-");
  a.download = `${draft.letterType}-${safe}-${draft.context.issueDate}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
