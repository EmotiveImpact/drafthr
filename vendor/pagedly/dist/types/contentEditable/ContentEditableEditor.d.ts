export interface ContentEditableEditorProps {
    html: string;
    onChange?: (html: string) => void;
    pageWidthMm?: number;
    pageHeightMm?: number;
    pagePadding?: string;
    doNotBreak?: (el: HTMLElement) => boolean;
    /**
     * Optional hook to sanitize HTML coming from clipboard paste before
     * it is inserted into the editor. If omitted, the built-in sanitizer
     * is used — it strips inline style/class/id attributes (which is
     * what causes Chrome's "select all, copy, paste makes text larger"
     * regression where the browser bakes computed font-size into the
     * pasted spans).
     */
    sanitizePastedHtml?: (html: string) => string;
    /**
     * How much formatting to keep from a paste when no custom
     * `sanitizePastedHtml` is supplied. `"clean"` (default) keeps structure
     * + bold/italic/lists/tables/links but strips colors, fonts, and
     * alignment so pasted content adopts the document's look. `"rich"` also
     * preserves text color, highlight/background color, and text alignment.
     * Word/Office cruft and unsafe tags are stripped in both modes.
     */
    pasteFormatting?: "clean" | "rich";
    /** Per-page top-margin chrome. `{page}`/`{total}` placeholders. */
    pageHeaderHtml?: {
        left?: string;
        right?: string;
    };
    /** Per-page bottom-margin chrome (e.g. page numbers). */
    pageFooterHtml?: {
        left?: string;
        right?: string;
    };
    /** Per-page diagonal watermark text (inert, behind content, print-safe). */
    watermark?: string;
    /**
     * Running head: stamp each page's top margin with the nearest heading of the
     * given level at-or-before that page (a STYLEREF-style chapter title). Inert,
     * stripped before reflow + serialize.
     */
    runningHead?: {
        level?: number;
    };
    /** Suppress the header/footer on the first page (title-page convention). */
    differentFirstPage?: boolean;
    /**
     * Debounce (ms) for the `onChange` notification — a burst of edits
     * coalesces into one host notification this long after the last
     * keystroke. Keeps large documents responsive (serialize + host
     * re-parse is O(document)). `getHTML()` is unaffected (synchronous).
     * Defaults to 120ms.
     */
    changeDebounceMs?: number;
    /**
     * When true the document is not editable: the content root is rendered with
     * `contentEditable={false}` and the paste / drop / beforeinput entry points
     * bail, so typing, paste, drag-drop and find/replace can't mutate it.
     * Pagination, scrolling and selection still work.
     */
    readOnly?: boolean;
}
export interface ContentEditableEditorHandle {
    getHTML(): string;
    setHTML(html: string): void;
    /**
     * This instance's `.pagedly-ce-content` element (or null pre-mount). Lets the
     * wrapper scope DOM work to THIS editor instead of a document-global
     * `querySelector(".pagedly-ce-content")`, which would grab the wrong editor
     * when two are mounted on one page.
     */
    getContentEl(): HTMLElement | null;
    focus(): void;
    /**
     * Run a contentEditable formatting command (bold, italic, etc.) via
     * the browser's `document.execCommand`. Yes, it's deprecated. Yes,
     * it's the path of least resistance for a contentEditable editor —
     * and the only thing that works without a full PM-style command
     * pipeline. Returns true if the browser executed the command.
     */
    execCommand(command: string, value?: string): boolean;
    /** Re-run pagination from scratch (e.g. after external HTML edits). */
    reflow(): void;
    /** Undo the last edit via the engine's own snapshot stack. */
    undo(): void;
    /** Redo the last undone edit. */
    redo(): void;
    /** Whether an undo is available (snapshot stack has a prior state). */
    canUndo(): boolean;
    /** Whether a redo is available (redo stack is non-empty). */
    canRedo(): boolean;
    /** List the document's top-level blocks with stable in-session ids. */
    getBlocks(): {
        pid: string;
        tag: string;
        text: string;
    }[];
    /** Replace the inner HTML of a block addressed by its pid. Returns success. */
    replaceBlock(pid: string, html: string): boolean;
}
export declare const ContentEditableEditor: import("react").ForwardRefExoticComponent<ContentEditableEditorProps & import("react").RefAttributes<ContentEditableEditorHandle>>;
//# sourceMappingURL=ContentEditableEditor.d.ts.map