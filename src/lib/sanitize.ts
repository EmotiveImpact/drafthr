import DOMPurify from "dompurify";

let hooksRegistered = false;
function registerSanitizeHooks() {
  if (hooksRegistered || typeof window === "undefined") return;
  hooksRegistered = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    const nodeName = node.nodeName.toUpperCase();
    const attrName = data.attrName.toLowerCase();
    if (
      nodeName === "IMG" &&
      attrName === "src" &&
      data.attrValue
    ) {
      const src = String(data.attrValue);
      const isImageData = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(src);
      if (!isImageData) {
        data.keepAttr = false;
        // Drop the whole <img> when src is unsafe — an <img> without src is
        // useless and could be re-targeted by other code paths.
        (node as Element).remove();
      } else {
        data.keepAttr = true;
      }
    }
    if (nodeName === "A" && attrName === "href" && data.attrValue) {
      const href = String(data.attrValue).trim();
      const isSafeLink = /^(?:https?:|mailto:|tel:|\/|#)/i.test(href);
      data.keepAttr = isSafeLink;
    }
    if (nodeName === "A" && attrName === "target" && data.attrValue) {
      const target = String(data.attrValue).trim().toLowerCase();
      data.keepAttr = target === "_blank" || target === "_self";
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName.toUpperCase() !== "A") return;
    const el = node as Element;
    if (el.getAttribute("target") === "_blank") {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
}

function isSafeLinkHref(href: string): boolean {
  return /^(?:https?:|mailto:|tel:|\/|#)/i.test(href.trim());
}

function collectBlankLinkHrefs(html: string): Map<string, number> {
  const root = document.createElement("div");
  root.innerHTML = html;
  const counts = new Map<string, number>();
  root.querySelectorAll("a[target]").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    const target = anchor.getAttribute("target")?.trim().toLowerCase();
    if (target === "_blank" && href && isSafeLinkHref(href)) {
      counts.set(href, (counts.get(href) ?? 0) + 1);
    }
  });
  return counts;
}

function hardenSanitizedHtml(html: string, blankLinkHrefs: Map<string, number>): string {
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href && !isSafeLinkHref(href)) {
      anchor.removeAttribute("href");
    }

    const blankCount = href ? blankLinkHrefs.get(href) ?? 0 : 0;
    if (blankCount > 0) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      blankLinkHrefs.set(href, blankCount - 1);
      return;
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

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote",
  "a",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr",
  "span", "div",
  // Inline images — added so screenshots / clipped evidence pasted into
  // the editor survive sanitisation on every render + every export path.
  // DOMPurify still strips javascript: + data: with disallowed mime types;
  // we restrict to known image MIMEs via ADD_URI_SAFE_ATTR + ALLOW_DATA_ATTR.
  "img",
  "figure", "figcaption",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "colspan", "rowspan",
  // <img> attributes — alt, src (allowed via data:image/* below), width,
  // height, class + inline style for max-width:100% so screenshots resize.
  "src", "alt", "title", "width", "height", "class", "style",
  // Custom data-* attributes used by the evidence picker for figure /
  // attachment references inside the letter body. The exporter resolves
  // these to fully numbered exhibit labels.
  "data-fig-id", "data-att-id",
  // TipTap's TextAlign extension emits style="text-align: …" on <p>/<h*>.
  // The 'style' allowance above covers that; we also explicitly permit
  // 'data-text-align' for any future explicit-attribute uses.
  "data-text-align",
];

export function sanitizeLetterHtml(dirty: string): string {
  if (typeof window === "undefined") {
    // SSR fallback (we don't currently SSR, but this protects against future use)
    return dirty;
  }
  registerSanitizeHooks();
  const blankLinkHrefs = collectBlankLinkHrefs(dirty);
  const cleaned = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
    // Allow data: URLs but only for non-SVG image MIMEs — that's how the inline
    // image extension stores pasted screenshots (data:image/png;base64,…).
    // Plus keep DOMPurify's default-permitted schemes for href on <a>:
    // http(s), mailto, tel.
    ALLOWED_URI_REGEXP:
      /^(?:https?:|mailto:|tel:|\/|#|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
  });
  return hardenSanitizedHtml(cleaned, blankLinkHrefs);
}
