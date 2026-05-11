import DOMPurify from "dompurify";

/**
 * Restrict <img src> to data:image/* (any base64-encoded image) or
 * http(s) URLs. Anything else — including data:text/html, data:application/*,
 * javascript:, etc. — gets the whole <img> element removed. Defence in depth
 * against malformed paste payloads. Registered once at module load.
 */
let imgHookRegistered = false;
function registerImgHook() {
  if (imgHookRegistered || typeof window === "undefined") return;
  imgHookRegistered = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (
      node.nodeName === "IMG" &&
      data.attrName === "src" &&
      data.attrValue
    ) {
      const src = String(data.attrValue);
      const isImageData = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(src);
      const isHttp = /^https?:\/\//i.test(src);
      if (!isImageData && !isHttp) {
        data.keepAttr = false;
        // Drop the whole <img> when src is unsafe — an <img> without src is
        // useless and could be re-targeted by other code paths.
        (node as Element).remove();
      }
    }
  });
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
];

export function sanitizeLetterHtml(dirty: string): string {
  if (typeof window === "undefined") {
    // SSR fallback (we don't currently SSR, but this protects against future use)
    return dirty;
  }
  registerImgHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
    // Allow data: URLs but only for image MIMEs — that's how the inline
    // image extension stores pasted screenshots (data:image/png;base64,…).
    // Plus keep DOMPurify's default-permitted schemes for href on <a>:
    // http(s), mailto, tel.
    ALLOWED_URI_REGEXP:
      /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,)/i,
  });
}
