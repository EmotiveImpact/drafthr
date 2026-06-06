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
  const value = href.trim();
  return /^(?:https?:|mailto:|tel:|#)/i.test(value) || (value.startsWith("/") && !value.startsWith("//"));
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
  // Track-changes / suggestion mark — see src/lib/tiptap/suggestion-mark.ts.
  // Only allowed on the authoring path; sanitizeLetterHtmlForExport strips
  // these because rendered exports must only contain accepted edits.
  "ins", "del",
  // Inline comment anchor — see src/lib/tiptap/comment-mark.ts
  // (<mark data-comment-id="…">). Authoring-only; export strips comment state.
  "mark",
];

// Non-data attributes. The data-* attrs live in DATA_ATTRS below and are fed
// via ADD_ATTR, because ALLOW_DATA_ATTR:false (which we keep, to block
// arbitrary data-*) otherwise strips EVERY data-* — including the ones listed
// here. DOMPurify honours ADD_ATTR even when ALLOW_DATA_ATTR is false, so the
// split is what lets our specific data-* survive. (Senior sweep B1.)
const ALLOWED_ATTR = [
  "href", "target", "rel",
  "colspan", "rowspan",
  // <img> attributes — alt, src (allowed via data:image/* below), width,
  // height, class + inline style for max-width:100% so screenshots resize.
  "src", "alt", "title", "width", "height", "class", "style",
];

// The ONLY data-* attributes permitted (fed via ADD_ATTR — see above).
const DATA_ATTRS = [
  // Evidence picker figure / attachment references; the exporter resolves
  // these to numbered exhibit labels — MUST survive export.
  "data-fig-id", "data-att-id",
  // TipTap TextAlign (explicit-attribute uses).
  "data-text-align",
  // Inline comment anchor id.
  "data-comment-id",
  // Suggestion-mark attributes — see src/lib/tiptap/suggestion-mark.ts.
  "data-suggestion-id", "data-suggestion-kind", "data-author",
  "data-author-id", "data-body", "data-created-at", "data-status",
  "data-suggestion",
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
    // Feed the specific data-* via ADD_ATTR — honoured even with
    // ALLOW_DATA_ATTR:false, which still blocks every OTHER data-*.
    ADD_ATTR: ["target", ...DATA_ATTRS],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    // NO USE_PROFILES (it ignores our allowlists and strips data-*), and NO
    // ALLOWED_URI_REGEXP. That regexp is DOMPurify's URI-attribute gate but it
    // is applied to EVERY attribute value — so non-URI data-* values like
    // data-status="accepted" failed the URI test and were stripped. That broke
    // per-suggestion Accept/Reject (no-op), figure-ref re-numbering, and
    // comment anchors. URI safety is instead enforced precisely in the
    // uponSanitizeAttribute hook (img.src → base64-image only; a.href → safe
    // schemes only), which is STRICTER than the old regexp. (Senior sweep B1/B2.)
  });
  return hardenSanitizedHtml(cleaned, blankLinkHrefs);
}

/**
 * Sanitiser variant for PDF / DOCX export. Strips suggestion marks entirely
 * because rendered documents must contain only canonical (accepted) text —
 * pending or rejected proposals leak reviewer state into the final file.
 * Callers should run mergeAcceptedSuggestionsHtml first to fold accepted
 * insertions into the prose; whatever is left over (still pending, still
 * rejected) is dropped here.
 */
export function sanitizeLetterHtmlForExport(dirty: string): string {
  if (typeof window === "undefined") return dirty;
  // Belt-and-braces: callers run mergeAcceptedSuggestionsHtml(..., {forExport:true})
  // first, which already removes all <ins>/<del> wrappers. But DOMPurify's
  // USE_PROFILES:{html:true} RE-PERMITS standard HTML5 tags (including ins/del)
  // regardless of the narrowed ALLOWED_TAGS, and KEEP_CONTENT:true keeps inner
  // text — so on its own the allowlist does NOT strip suggestion marks. We
  // therefore explicitly scrub any residual ins/del from the DOM before AND
  // after sanitising: a stray <ins> (rejected/pending insertion) is removed
  // WITH its text; a <del> is unwrapped (original text kept, markup dropped).
  // This guarantees reviewer track-changes can never reach an exported file.
  const preScrubbed = stripSuggestionMarks(dirty);
  // Export tags: drop the track-changes + comment wrappers (exports carry only
  // canonical accepted content, no reviewer state).
  const exportTags = ALLOWED_TAGS.filter(
    (t) => t !== "ins" && t !== "del" && t !== "mark",
  );
  // Export data-* : KEEP fig/att/text-align (figure re-numbering needs them);
  // DROP all suggestion/comment/author state.
  const exportDataAttrs = DATA_ATTRS.filter(
    (a) => a === "data-fig-id" || a === "data-att-id" || a === "data-text-align",
  );
  registerSanitizeHooks();
  const blankLinkHrefs = collectBlankLinkHrefs(preScrubbed);
  const cleaned = DOMPurify.sanitize(preScrubbed, {
    ALLOWED_TAGS: exportTags,
    ALLOWED_ATTR,
    ADD_ATTR: ["target", ...exportDataAttrs],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    // No USE_PROFILES, no ALLOWED_URI_REGEXP — see sanitizeLetterHtml. The
    // allowlist (sans ins/del/mark) plus the explicit stripSuggestionMarks
    // pre/post-scrub means residual track-changes truly cannot reach a file.
    // Crucially, data-fig-id/data-att-id now survive so resolveFigureRefsInHtml
    // can re-number exhibits in the exported PDF/DOCX. (Senior sweep B1/B2.)
  });
  // Post-scrub too, as a defense-in-depth backstop for any residual ins/del.
  return stripSuggestionMarks(hardenSanitizedHtml(cleaned, blankLinkHrefs));
}

/**
 * Remove every <ins>/<del> from an HTML string for the EXPORT path:
 *   <ins> → removed entirely (text + element) — an insertion not already
 *           folded in by the merge step is non-accepted and must not appear.
 *   <del> → unwrapped (children kept, element dropped) — the original text
 *           survives without the strike-through markup.
 * No-op when there are no such tags (cheap string probe first).
 */
function stripSuggestionMarks(html: string): string {
  if (!html || (!html.includes("<ins") && !html.includes("<del"))) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("ins").forEach((el) => el.remove());
  root.querySelectorAll("del").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return root.innerHTML;
}
