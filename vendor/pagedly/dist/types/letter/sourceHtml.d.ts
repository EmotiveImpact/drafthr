import type { LetterDraft, LetterSection } from "./types";
export declare const LETTER_READ_ONLY_SELECTOR: string;
/**
 * The `html` prop given to PagedHtmlEditor when editing a letter. Now just the
 * body inner content — anchors + per-section HTML — without any letterhead or
 * attachments wrapper. The chrome is composed at render time via
 * `buildPagedLetterRenderShell` so paged.js sees the full letter, but the
 * editor's source state stays small and round-trips cleanly.
 */
export declare function buildLetterEditorHtml(draft: LetterDraft, options?: {
    bodyHtml?: string;
}): string;
/**
 * Returns the render-shell wrapper used by PagedHtmlEditor at repaginate time
 * (via the `wrapSourceForRender` prop). It receives the editor's stamped body
 * inner HTML and surrounds it with the letterhead + .letter-body wrapper +
 * attachments, and injects the signature image right after the signature
 * section anchor. paged.js sees the complete letter; the editor's source
 * state never has to round-trip the chrome.
 */
export declare function buildPagedLetterRenderShell(draft: LetterDraft): (innerHtml: string) => string;
/**
 * Legacy: builds the FULL letter HTML (chrome + body) in one go. Kept for
 * tests and any host that prefers to bypass the editor's render-shell prop.
 */
export declare function buildPagedLetterFullHtml(draft: LetterDraft, options?: {
    bodyHtml?: string;
}): string;
export declare function buildMergedLetterBodyHtml(draft: LetterDraft): string;
export declare function splitLetterEditorHtml(fullHtml: string, sections?: LetterSection[]): {
    bodyHtml: string;
    sections: Record<string, string>;
};
export declare function applySectionHtmlToDraft(draft: LetterDraft, sections: Record<string, string>): LetterDraft;
export declare function splitBySection(sourceHtml: string, sections?: LetterSection[] | string[]): Record<string, string>;
export declare function signatureImageHtml(draft: LetterDraft, extraAttrs?: string): string;
export declare function sanitizePagedLetterHtml(dirty: string): string;
export declare function letterheadHtml(draft: LetterDraft): string;
export declare function buildAttachmentsBlock(draft: LetterDraft): string;
//# sourceMappingURL=sourceHtml.d.ts.map