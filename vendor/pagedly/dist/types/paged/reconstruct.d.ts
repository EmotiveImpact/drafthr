export type SourceTransformOptions = {
    readOnlyChromeSelector?: string;
    editableRootSelector?: string;
};
export declare function stampPagedRefs(html: string, options?: SourceTransformOptions): string;
export declare function reconstructSourceHtml(container: HTMLElement, options?: SourceTransformOptions): string;
export declare function normalizeRenderedPagedRefs(container: HTMLElement, options?: SourceTransformOptions): void;
export declare function findRenderedSourceRoots(container: HTMLElement, options?: SourceTransformOptions): HTMLElement[];
export declare function wrapLooseTopLevelContent(root: HTMLElement): void;
export declare function stripPagedArtifacts(root: HTMLElement): void;
//# sourceMappingURL=reconstruct.d.ts.map