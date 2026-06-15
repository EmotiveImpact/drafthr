export type CursorState = {
    start: CursorPoint;
    end: CursorPoint;
};
export type CursorPoint = {
    ref: string;
    offset: number;
};
export declare function captureCursor(root: HTMLElement): CursorState | null;
export declare function restoreCursor(root: HTMLElement, cursor: CursorState, editableRootSelector?: string): void;
export declare function positionLength(node: Node): number;
export declare function isAtomicPositionNode(node: Node): boolean;
//# sourceMappingURL=cursor.d.ts.map