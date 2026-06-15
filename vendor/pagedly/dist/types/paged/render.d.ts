import type { PrintCss } from "../types";
export type CreateA4PrintCssOptions = {
    margin?: string;
    fontFamily?: string;
    fontSize?: string;
    lineHeight?: string | number;
    textColor?: string;
    pageBackground?: string;
    pageBorderColor?: string;
    pageShadow?: string;
    showPageNumbers?: boolean;
};
export type PagedPreviewer = {
    preview: (content: string | HTMLElement, stylesheets: Array<string | Record<string, string>>, renderTo: HTMLElement) => Promise<{
        total?: number | null;
    }>;
    chunker?: {
        stop?: () => void;
        destroy?: () => void;
    };
    polisher?: {
        destroy?: () => void;
    };
};
export declare function createA4PrintCss(options?: CreateA4PrintCssOptions): string;
export declare function stylesheetsForPrintCss(printCss: PrintCss): Array<string | Record<string, string>>;
export declare function createPreviewer(): Promise<PagedPreviewer>;
export declare function destroyPreviewer(previewer: PagedPreviewer | null): void;
export declare function createPaginationStagingHost(container: HTMLElement): HTMLElement;
//# sourceMappingURL=render.d.ts.map