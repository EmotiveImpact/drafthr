export type SplitOversizedHtmlOptions = {
    maxBlockHeightPx?: number;
    contentWidthPx?: number;
    maxHardTextChunkChars?: number;
    tableCellChunkChars?: number;
    editableRootSelector?: string;
};
export declare function splitOversizedHtml(html: string, options?: SplitOversizedHtmlOptions): string;
//# sourceMappingURL=oversized.d.ts.map