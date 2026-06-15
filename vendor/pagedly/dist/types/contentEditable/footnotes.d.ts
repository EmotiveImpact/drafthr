/**
 * Insert a footnote reference (carrying its note text) at the collapsed
 * selection. Returns the inserted <sup>, or null. Numbering is applied by the
 * engine's per-page footnote pass (document order).
 */
export declare function insertFootnoteAtSelection(content: HTMLElement, sel: Selection, noteText: string): HTMLElement | null;
/**
 * Number every footnote reference in document order and build the per-page
 * footnote area for each page that carries refs WITH note text. Returns the
 * areas it created (already appended to their pages) so the engine can treat
 * them as inert chrome. Called from stampPageChrome (after reflow).
 */
export declare function stampFootnotes(content: HTMLElement, pages: HTMLElement[]): void;
/** Whether the content has any true-footnote references. */
export declare function hasFootnotes(content: HTMLElement): boolean;
//# sourceMappingURL=footnotes.d.ts.map