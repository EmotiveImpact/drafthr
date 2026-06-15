/**
 * Resolve cross-references ("see p. N") to the laid-out page of their target
 * heading. Runs in the chrome pass after reflow so refs auto-update as content
 * shifts. The displayed text is content (serialized), set deterministically →
 * incremental==full unaffected (sig compares text distribution and both paths
 * resolve identically).
 */
export declare function resolveCrossRefs(content: HTMLElement): void;
/** Build (or rebuild) the TOC element from the current headings. */
export declare function buildTocElement(content: HTMLElement): HTMLElement;
/**
 * Resolve each entry's page number from the laid-out DOM. Returns true if any
 * number changed (so the caller can decide whether another reflow pass is
 * worthwhile to reach a fixpoint).
 */
export declare function resolveTocPageNumbers(content: HTMLElement): boolean;
//# sourceMappingURL=toc.d.ts.map