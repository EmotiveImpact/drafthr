/** Page geometry for the exported sectPr — mirrors docxImport's docxPageGeometry. */
export type DocxExportGeometry = {
    widthMm: number;
    heightMm: number;
    marginMm: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
};
/** Convert editor HTML to a .docx byte stream (Uint8Array). Requires a DOM. */
export declare function htmlToDocx(html: string, geometry?: DocxExportGeometry): Uint8Array;
/** Convenience: download the HTML as a .docx file (browser only). */
export declare function downloadDocx(html: string, filename?: string, geometry?: DocxExportGeometry): void;
//# sourceMappingURL=docx.d.ts.map