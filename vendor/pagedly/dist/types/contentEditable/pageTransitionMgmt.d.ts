/**
 * Page transition management — DOM surgery for moving content
 * between adjacent page divs.
 *
 * Direct TypeScript port of vue-document-editor's
 * `imports/page-transition-mgmt.js` (MIT — Romain Lebesle).
 * Reference: https://github.com/motla/vue-document-editor
 *
 * Two functions:
 *   - move_children_forward_recursively: overflow path — pulls
 *     trailing children off the current page and prepends them to
 *     the next, with word-by-word text splitting and "s_tag"
 *     watermarking so a single block can have one half on page N
 *     and one half on page N+1.
 *   - move_children_backwards_with_merging: underfill path — pulls
 *     the first child of the next page back onto the current page,
 *     merging it into its same-s_tag sibling if one exists (so
 *     split blocks rejoin transparently).
 */
interface TaggedElement extends HTMLElement {
    s_tag?: string;
}
/**
 * Move every sub-child of `child` to the start of `child_sibling`,
 * beginning from the last child, with word splitting and format
 * preservation. Typically `child` = the page that overflows,
 * `child_sibling` = the next page.
 */
export declare function moveChildrenForwardRecursively(child: TaggedElement, childSibling: TaggedElement, stopCondition: () => boolean, doNotBreak?: (el: HTMLElement) => boolean, notFirstChild?: boolean): void;
/**
 * Post-pagination "tighten" pass: pull chars from start of next page
 * one at a time into the end of the current page, until the current
 * page is JUST at capacity (one more char would overflow).
 *
 * The main pagination pass uses clientHeight as its stop signal, but
 * clientHeight is quantised by line-wrap. Adding one char inside a
 * line doesn't change clientHeight; it only changes when a wrap point
 * moves. So after the main pass, the current page can have several
 * chars of slack — meaning a Backspace that deletes one char from
 * page N's bottom won't visibly migrate a char back from page N+1
 * (the algorithm sees no underflow).
 *
 * This pass closes that gap. After it runs, the boundary is at the
 * EXACT char position where the next char would overflow page N.
 */
export declare function tightenBoundaryCharByChar(pageDiv: TaggedElement, nextPageDiv: TaggedElement, targetHeight: number): void;
/**
 * Force-migrate ONE WORD from the start of nextPageDiv back into the
 * end of pageDiv.
 *
 * A "word" here = optional leading whitespace + a non-whitespace run +
 * optional trailing whitespace. So e.g. "Hello world" → "Hello ".
 *
 * Returns the migrated word string if a migration happened (caller can
 * use this for an exact undo via `undoForceMigrate`), or null
 * otherwise.
 */
export declare function forceMigrateOneWordBackwards(pageDiv: TaggedElement, nextPageDiv: TaggedElement): string | null;
/**
 * Reverse a `forceMigrateOneWordBackwards`: remove the exact `word`
 * string from the end of pageDiv's matching boundary block and
 * prepend it back to nextPageDiv's matching first text. Used when the
 * force-migrate caused the page to overflow and we need to roll back.
 *
 * Operates on string equality — if the migrated content has been
 * altered since the migration (e.g. by subsequent normalize), bails
 * out rather than guessing.
 */
export declare function undoForceMigrate(pageDiv: TaggedElement, nextPageDiv: TaggedElement, word: string): boolean;
/**
 * Move the first element of `nextPageDiv` back into `pageDiv`,
 * merging into a same-s_tag sibling if one exists (so split halves
 * rejoin transparently).
 */
export declare function moveChildrenBackwardsWithMerging(pageDiv: TaggedElement, nextPageDiv: TaggedElement, stopCondition: () => boolean): void;
export {};
//# sourceMappingURL=pageTransitionMgmt.d.ts.map