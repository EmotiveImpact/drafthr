export declare function findCell(node: Node | null): HTMLTableCellElement | null;
export declare function insertRow(cell: HTMLTableCellElement, where: "above" | "below"): void;
export declare function insertColumn(cell: HTMLTableCellElement, where: "before" | "after"): void;
/** Returns false (no-op) if it would leave the table with zero rows. */
export declare function deleteRow(cell: HTMLTableCellElement): boolean;
/** Returns false (no-op) if it would leave the table with zero columns. */
export declare function deleteColumn(cell: HTMLTableCellElement): boolean;
/** Merge a cell with the next cell in its row (colspan). */
export declare function mergeRight(cell: HTMLTableCellElement): boolean;
/** Merge a cell with the cell directly below it in its column (rowspan). */
export declare function mergeDown(cell: HTMLTableCellElement): boolean;
/** Split a merged cell back into individual cells. */
export declare function splitCell(cell: HTMLTableCellElement): boolean;
/** Removes the whole table; returns the element that should host the caret. */
export declare function deleteTable(cell: HTMLTableCellElement): HTMLElement | null;
//# sourceMappingURL=tableOps.d.ts.map