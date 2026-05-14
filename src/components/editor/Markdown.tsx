import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Minimal markdown renderer for AI chat replies. Uses `marked` for the
 * heavy lifting (CommonMark + GFM) and DOMPurify to strip anything that
 * could be unsafe — the AI's reply is untrusted input we render inline.
 *
 * Styling is scoped via the [&_*] arbitrary selectors so we don't need
 * a global prose stylesheet just for chat messages.
 */
export function Markdown({ children }: { children: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(children, { async: false, breaks: true, gfm: true }) as string;
    const cleaned = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote",
        "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6",
        "hr", "table", "thead", "tbody", "tr", "th", "td",
      ],
      ALLOWED_ATTR: ["href", "target", "rel"],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    });
    return hardenMarkdownLinks(cleaned);
  }, [children]);

  return (
    <div
      className={
        // Tight chat-bubble typography — keeps the bubble feeling like text,
        // not like a styled article.
        "text-[13px] leading-relaxed " +
        "[&_p]:my-1 [&_p]:first:mt-0 [&_p]:last:mb-0 " +
        "[&_strong]:font-semibold [&_em]:italic " +
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 " +
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 " +
        "[&_li]:my-0.5 " +
        "[&_code]:px-1 [&_code]:py-px [&_code]:rounded-sm [&_code]:bg-[var(--ds-line-2)] [&_code]:text-[12px] [&_code]:font-mono " +
        "[&_pre]:my-2 [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:bg-[var(--ds-surface-2)] [&_pre]:overflow-x-auto " +
        "[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--ds-line)] [&_blockquote]:pl-2 [&_blockquote]:my-1 [&_blockquote]:text-[var(--ds-muted)] " +
        "[&_a]:underline [&_a]:underline-offset-2 " +
        "[&_h1]:font-semibold [&_h1]:text-[14px] [&_h2]:font-semibold [&_h2]:text-[13px] [&_h3]:font-semibold [&_h3]:text-[13px] " +
        "[&_hr]:my-2 [&_hr]:border-[var(--ds-line)]"
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function hardenMarkdownLinks(html: string): string {
  if (typeof document === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href && !/^(?:https?:|mailto:|tel:|\/|#)/i.test(href)) {
      anchor.removeAttribute("href");
    }
    const target = anchor.getAttribute("target");
    if (target === "_blank") {
      anchor.setAttribute("rel", "noopener noreferrer");
    } else if (target && target !== "_self") {
      anchor.removeAttribute("target");
    }
  });
  return root.innerHTML;
}
