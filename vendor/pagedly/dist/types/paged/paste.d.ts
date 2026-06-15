export type SanitizePastedHtmlOptions = {
    sanitizeHtml?: (dirty: string) => string;
    plainText?: string;
};
export declare function sanitizePastedHtml(html: string, options?: SanitizePastedHtmlOptions): string;
export declare function plainTextToEditorHtml(text: string): string;
export declare function defaultSanitizeHtml(dirty: string): string;
//# sourceMappingURL=paste.d.ts.map