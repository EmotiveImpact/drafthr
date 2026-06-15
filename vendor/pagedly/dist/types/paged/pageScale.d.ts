export declare const A4_PAGE_WIDTH_PX: number;
export declare const A4_PAGE_HEIGHT_PX: number;
export declare const A4_MARGIN_TOP_PX: number;
export declare const A4_MARGIN_BOTTOM_PX: number;
export declare const A4_MARGIN_SIDE_PX: number;
export declare const A4_CONTENT_WIDTH_PX: number;
export declare const A4_CONTENT_HEIGHT_PX: number;
export type PageScaleOptions = {
    pageWidthPx?: number;
    minScale?: number;
    gutterPx?: number;
};
export declare function calculatePageScale(containerWidthPx: number, options?: PageScaleOptions): number;
export declare function applyResponsivePageScale(container: HTMLElement | null, options?: PageScaleOptions): number;
export declare function observeResponsivePageScale(container: HTMLElement, options?: PageScaleOptions): () => void;
//# sourceMappingURL=pageScale.d.ts.map