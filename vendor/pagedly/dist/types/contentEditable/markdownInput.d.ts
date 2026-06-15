export type MarkdownBlockCommand = {
    command: "formatBlock";
    value: string;
} | {
    command: "insertUnorderedList";
} | {
    command: "insertOrderedList";
} | {
    command: "insertChecklist";
} | {
    command: "toggleBlockquote";
} | {
    command: "formatCodeBlock";
};
/**
 * Match a block-level markdown prefix. `before` is the text from the block
 * start to the caret; `data` is the character being inserted (" " for most,
 * "`" for the code fence). Returns the command to run, or null.
 */
export declare function matchBlockRule(before: string, data: string): MarkdownBlockCommand | null;
/**
 * Smart-typography replacement. `before` is the text before the caret (within
 * the caret's text node); `data` is the character being typed. Returns how many
 * chars to remove before the caret and what to insert in place of `data`.
 */
export declare function matchTypography(before: string, data: string): {
    removeBefore: number;
    insert: string;
} | null;
/**
 * Inline emphasis. Fires when `data` is the closing delimiter. `before` is the
 * text before the caret in the caret's text node. Returns how many chars to
 * remove before the caret (the opener + content) and the HTML to insert (the
 * wrapped run). The typed closing delimiter is NOT inserted.
 */
export declare function matchInline(before: string, data: string): {
    removeBefore: number;
    html: string;
} | null;
/**
 * Autolink: when a word boundary (space) is typed after a URL token, return the
 * token + its char length so the caller can wrap it in an anchor. Trailing
 * punctuation is excluded from the link.
 */
export declare function matchAutoLink(before: string): {
    url: string;
    href: string;
    length: number;
} | null;
//# sourceMappingURL=markdownInput.d.ts.map