export type DocxDocumentDefaults = {
    fontPt?: number;
    lineHeight?: number;
    fontFamily?: string;
};
/**
 * The imported document's default text metrics (styles.xml docDefaults +
 * default paragraph style): font size, line height, font family. The host
 * applies these as the editor's typing baseline (--pagedly-font-size /
 * --pagedly-line-height / --pagedly-font-family) so text TYPED after an
 * import matches the imported document's look instead of the editor's house
 * style. Returns null when styles.xml is absent/unreadable so callers keep
 * the configured baseline. fontPt is always present when non-null (it falls
 * through to the OOXML 10pt hard default — the same value paragraphToHtml
 * already renders body blocks with, so typing stays consistent with the
 * imported content either way).
 */
export declare function docxDocumentDefaults(bytes: Uint8Array): Promise<DocxDocumentDefaults | null>;
/** Convert .docx bytes to editor HTML. Async (entry inflate). */
export declare function docxToHtml(bytes: Uint8Array): Promise<string>;
export type DocxPageGeometry = {
    widthMm: number;
    heightMm: number;
    marginMm: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
};
/**
 * Read the source document's page size + margins from the LAST <w:sectPr>
 * (the body-level section properties — Word puts the final section's setup
 * there). Values are twips; converted twips → pt (/20) → mm (*25.4/72),
 * rounded to 1 decimal. Returns null when absent or malformed so callers can
 * keep their configured page setup.
 */
export declare function docxPageGeometry(bytes: Uint8Array): Promise<DocxPageGeometry | null>;
//# sourceMappingURL=docxImport.d.ts.map