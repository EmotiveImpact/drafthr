/** Find the nearest <li> ancestor of a node, within the editor root. */
export declare function findListItem(node: Node | null, root?: Element): HTMLLIElement | null;
/**
 * Nest a list item one level deeper. Moves it into a sub-list of its previous
 * sibling <li> (reusing an existing trailing sub-list of the same type, or
 * creating one). Returns the moved <li>, or null if it can't nest (no previous
 * sibling item).
 */
export declare function indentListItem(li: HTMLLIElement): HTMLLIElement | null;
/**
 * Outdent a nested list item one level. Moves it to be the next sibling of its
 * grandparent <li> in the outer list; trailing siblings follow it into a
 * sub-list so ordering is preserved. Returns the moved <li>, or null if it's
 * already at the top level.
 */
export declare function outdentListItem(li: HTMLLIElement): HTMLLIElement | null;
//# sourceMappingURL=listOps.d.ts.map