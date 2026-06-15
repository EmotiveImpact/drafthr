/**
 * Insert a note reference at the collapsed selection + a matching note in the
 * endnotes list. Returns the new <li> so the caller can place the caret in it.
 */
export declare function insertEndnoteAtSelection(content: HTMLElement, sel: Selection): HTMLLIElement | null;
/**
 * Renumber every reference in document order and reorder + prune the note list
 * to match. Idempotent; safe to call on every settle. Removes an empty list.
 */
export declare function renumberEndnotes(content: HTMLElement): void;
//# sourceMappingURL=endnotes.d.ts.map