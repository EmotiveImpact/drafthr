/**
 * Sanitize untrusted HTML for insertion into the editor. No-ops outside a DOM
 * (SSR) — same guard the letter sanitizer uses; jsdom provides `window`, so the
 * test suite exercises the real path.
 */
export declare function sanitizeEditorHtml(dirty: string): string;
/**
 * Validate + escape a URL for an HTML attribute (href/src). Returns "" for any
 * disallowed scheme (javascript:, vbscript:, data:text/html, data:image/svg+xml,
 * protocol-relative //host) so the attribute renders inert rather than executing.
 *
 * Used by the two string-template builders (markdown img/link, insertImage) that
 * concatenate URLs into HTML and so bypass DOMPurify's own URI check. Escapes the
 * attribute-breaking characters (" ' < >) but NOT `&` — `&` cannot break out of a
 * double-quoted attribute, and leaving it avoids double-escaping a value the
 * markdown path already entity-escaped.
 */
export declare function safeUrl(url: string): string;
//# sourceMappingURL=sanitize.d.ts.map