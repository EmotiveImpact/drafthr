import type { MutableRefObject, ReactNode, RefObject } from "react";
import type { EditorFeatures, ResolvedFeatures } from "./features";
export type { EditorFeatures, ResolvedFeatures } from "./features";
export type EditorPageSize = "A4" | "Letter" | "Legal";
export type EditorOrientation = "portrait" | "landscape";
export type ReflowState = "idle" | "reflowing" | "saving" | "error";
export type ToolbarPosition = "sticky" | "stationary";
export type ToolbarLayout = "compact" | "full";
export type EditorViewMode = "edit" | "preview";
export type PrintCss = string | Record<string, string> | Array<string | Record<string, string>>;
export type EditorCommand = "bold" | "italic" | "underline" | "strikeThrough" | "superscript" | "subscript" | "removeFormat" | "formatBlock" | "insertUnorderedList" | "insertOrderedList" | "justifyLeft" | "justifyCenter" | "justifyRight" | "justifyFull" | "createLink" | "unlink" | "insertHorizontalRule" | "insertPageBreak" | "insertTable" | "setFontSize" | "setFontColor" | "setHighlightColor" | "setFontFamily" | "toggleBlockquote" | "toggleInlineCode" | "formatCodeBlock" | "tableInsertRowAbove" | "tableInsertRowBelow" | "tableInsertColumnBefore" | "tableInsertColumnAfter" | "tableDeleteRow" | "tableDeleteColumn" | "tableDelete" | "tableMergeRight" | "tableMergeDown" | "tableSplitCell" | "toggleKeepTogether" | "toggleKeepWithNext" | "togglePageBreakBefore" | "toggleColumns" | "insertLeader" | "addComment" | "resolveComment" | "acceptChange" | "rejectChange" | "acceptAllChanges" | "rejectAllChanges" | "insertTableOfContents" | "insertCrossReference" | "insertSectionBreak" | "importDocx" | "exportDocx" | "exportMarkdown" | "importMarkdown" | "copyAsMarkdown" | "insertFootnote" | "insertChecklist" | "indent" | "outdent" | "setLineSpacing" | "setPasteFormatting" | "pastePlain";
export type EditorInsertTableValue = {
    rows: number;
    cols: number;
    header?: boolean;
};
export type EditorBlock = "p" | "h1" | "h2" | "h3" | "h4" | string;
export type EditorAlign = "left" | "center" | "right" | "justify" | "";
export type ToolbarState = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    superscript: boolean;
    subscript: boolean;
    fontSize: string;
    unorderedList: boolean;
    orderedList: boolean;
    block: EditorBlock;
    align: EditorAlign;
    link: boolean;
    linkHref: string;
    blockquote: boolean;
    /** Active paste mode — reflected by the toolbar's paste toggle. */
    pasteFormatting: "clean" | "rich";
    canUndo: boolean;
    canRedo: boolean;
    reflowState: ReflowState;
    pageCount: number;
    characterCount: number;
    wordCount: number;
    isEmpty: boolean;
};
export type EditorImage = {
    src: string;
    alt?: string;
};
export type EditorHandle = {
    focus: () => void;
    reflow: () => Promise<void>;
    flush: () => Promise<string>;
    undo: () => void;
    redo: () => void;
    selectAll: () => void;
    openFind: () => void;
    closeFind: () => void;
    runCommand: (command: EditorCommand | (string & {}), value?: string) => void;
    insertHtml: (html: string) => void;
    /** Replace the entire document with new HTML (e.g. restore a version). */
    setHtml?: (html: string) => void;
    /** List top-level blocks with stable in-session ids (for agent addressing). */
    getBlocks?: () => {
        pid: string;
        tag: string;
        text: string;
    }[];
    /** Replace a block's inner HTML by its pid. Returns success. */
    replaceBlock?: (pid: string, html: string) => boolean;
    insertImage: (src: string, alt?: string) => void;
    requestImageInsert: () => Promise<void>;
    getState: () => ToolbarState;
    subscribe: (listener: (state: ToolbarState) => void) => () => void;
    /**
     * Open a print-to-PDF dialog (browser print, OS Save-as-PDF).
     * Returns a promise that resolves after the print preview is opened.
     */
    downloadPdf?: (options?: {
        filename?: string;
    }) => void;
};
export type EditorActions = Pick<EditorHandle, "undo" | "redo" | "selectAll" | "openFind">;
export type ToolbarProps = {
    editor?: EditorHandle | null;
    editorRef?: RefObject<EditorHandle | null>;
    state?: ToolbarState;
    disabled?: boolean;
    className?: string;
    labels?: Partial<Record<string, string>>;
    onCommand?: (command: EditorCommand, value?: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onImageInsert?: () => void;
    /** Resolved feature flags — buttons for disabled features are not rendered. */
    features?: ResolvedFeatures;
};
/** @deprecated Use `ToolbarState`. Kept for archived-engine imports. */
export type PagedEditorToolbarState = ToolbarState;
/** @deprecated Use `ToolbarProps`. Kept for archived-engine imports. */
export type PagedEditorToolbarProps = ToolbarProps;
/** @deprecated Use `EditorActions`. */
export type PagedEditorActions = EditorActions;
/** @deprecated Use `EditorAlign`. */
export type PagedEditorAlign = EditorAlign;
/** @deprecated Use `EditorBlock`. */
export type PagedEditorBlock = EditorBlock;
/** @deprecated Use `EditorCommand`. */
export type PagedEditorCommand = EditorCommand;
/** @deprecated Use `EditorImage`. */
export type PagedEditorImage = EditorImage;
/** @deprecated Use `EditorPageSize`. */
export type PagedEditorPageSize = EditorPageSize;
/** @deprecated Use `EditorViewMode`. */
export type PagedEditorViewMode = EditorViewMode;
/** @deprecated Use `EditorHandle`. */
export type PagedHtmlEditorHandle = EditorHandle;
/** @deprecated Use `EditorProps`. */
export type PagedHtmlEditorProps = EditorProps;
/** @deprecated Use `ReflowState`. */
export type PagedReflowState = ReflowState;
/** @deprecated Use `PrintCss`. */
export type PagedPrintCss = PrintCss;
/** @deprecated Use `ToolbarLayout`. */
export type PagedToolbarLayout = ToolbarLayout;
/** @deprecated Use `ToolbarPosition`. */
export type PagedToolbarPosition = ToolbarPosition;
/** Built-in AI transform actions an `AiProvider` may be asked to perform. */
export type AiTransform = "rewrite" | "shorten" | "expand" | "summarize" | "fixGrammar" | "changeTone" | "translate";
export type AiRequest = {
    action: AiTransform;
    /** The selected text to transform. */
    text: string;
    /** Optional free-form instruction (e.g. target language / tone). */
    instruction?: string;
};
/**
 * Host-supplied AI function. Pagedly never embeds a model or key — the host
 * wires its own provider and returns the transformed text. Inline AI UI only
 * appears when this is provided AND the `ai` feature is on.
 */
export type AiProvider = (request: AiRequest) => Promise<string>;
/** Context handed to a custom command handler (registry extensibility). */
export type EditorCommandContext = {
    /** The editor's contentEditable root (or null before mount). */
    content: HTMLElement | null;
    /** The live selection. */
    selection: Selection | null;
    /** Run a built-in or another registered command. */
    runCommand: (command: EditorCommand | (string & {}), value?: string) => void;
    /** Insert HTML at the caret. */
    insertHtml: (html: string) => void;
    /** Call after directly mutating the DOM so the engine reflows + emits onChange. */
    notifyChange: () => void;
};
/** A host-registered command handler, keyed by command name in `commands`. */
export type EditorCommandHandler = (value: string | undefined, ctx: EditorCommandContext) => void;
/**
 * Page geometry + default text metrics adopted from an imported document
 * (structurally identical to docxImport's DocxPageGeometry/DocxDocumentDefaults
 * so the two assign freely). Runtime state by default — pass back via the
 * `documentMetrics` prop to persist across remounts.
 */
export type DocumentMetrics = {
    geometry?: {
        widthMm: number;
        heightMm: number;
        marginMm: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
    defaults?: {
        fontPt?: number;
        lineHeight?: number;
        fontFamily?: string;
    };
};
export type EditorProps = {
    html: string;
    printCss?: PrintCss;
    /** Host-supplied AI provider for the inline transform suite. */
    aiProvider?: AiProvider;
    /**
     * Suggesting mode: while on, typed text is recorded as <ins> and deletions as
     * <del> (track-changes recording) instead of editing directly. Review them
     * with the acceptChange/rejectChange commands.
     */
    suggesting?: boolean;
    /**
     * Register custom commands (extensibility). Keyed by command name; invoke via
     * the handle's runCommand("name", value) or the command palette. Handlers get
     * a context with the content root, selection, runCommand, insertHtml, and
     * notifyChange.
     */
    commands?: Record<string, EditorCommandHandler>;
    onChange?: (nextHtml: string) => void;
    onSave?: (nextHtml: string) => void | Promise<void>;
    /** Debounce edits and call onSave automatically; shows a saved/saving badge. */
    autoSave?: boolean;
    /** Autosave debounce in ms (default 1500). */
    autoSaveDelayMs?: number;
    onPageCountChange?: (pages: number) => void;
    onReflowStateChange?: (state: ReflowState) => void;
    sanitizeHtml?: (dirty: string) => string;
    /**
     * How much formatting a paste keeps. `"clean"` (default) keeps structure
     * (bold/italic/headings/lists/tables/links) but strips colors, fonts and
     * alignment so pasted content matches the document. `"rich"` also keeps
     * text color, highlight/background color, and alignment. Unsafe tags and
     * Word/Office cruft are removed in both modes.
     */
    pasteFormatting?: "clean" | "rich";
    /**
     * Toggle individual editor features on/off. Unspecified keys default to on
     * (`DEFAULT_FEATURES`). A disabled feature hides its toolbar button AND
     * no-ops its command. Presets: `FEATURES_FULL`, `FEATURES_MINIMAL`.
     */
    features?: EditorFeatures;
    readOnly?: boolean;
    readOnlyChromeSelector?: string;
    editableRootSelector?: string;
    pageSize?: EditorPageSize;
    /** Page orientation (default portrait). */
    pageOrientation?: EditorOrientation;
    /** Page margin as a CSS padding value (default "20mm"), e.g. "1in" or "25mm 20mm". */
    pageMargin?: string;
    /**
     * Seed the document metrics a previous DOCX import adopted (page geometry +
     * typing baseline), so a saved document re-opens with the same page setup
     * instead of reverting to the configured defaults. Hosts persist the value
     * received via `onDocumentMetricsChange` alongside the document HTML.
     */
    documentMetrics?: DocumentMetrics;
    /** Fired when an import adopts new document metrics (page setup / baseline). */
    onDocumentMetricsChange?: (metrics: DocumentMetrics) => void;
    /** Per-page diagonal watermark text (e.g. "DRAFT", "CONFIDENTIAL"). */
    watermark?: string;
    /** Running head: each page's top margin shows the governing heading. */
    runningHead?: {
        level?: number;
    };
    /** Suppress header/footer on the first page (title-page convention). */
    differentFirstPage?: boolean;
    /** Called when a comment is added; receives its id + the highlighted text. */
    onCommentAdd?: (commentId: string, quotedText: string) => void;
    /** Called when an existing comment highlight is clicked. */
    onCommentClick?: (commentId: string) => void;
    toolbar?: boolean | ((state: ToolbarState) => ReactNode);
    toolbarPosition?: ToolbarPosition;
    toolbarLayout?: ToolbarLayout;
    viewMode?: EditorViewMode;
    reflowDelayMs?: number;
    className?: string;
    canvasClassName?: string;
    findPlaceholder?: string;
    /** Override toolbar UI strings (i18n). Merged over the English defaults. */
    labels?: Partial<Record<string, string>>;
    actionsRef?: MutableRefObject<EditorActions | null>;
    onImageInsert?: () => EditorImage | string | null | undefined | Promise<EditorImage | string | null | undefined>;
    maxImageBytes?: number;
    imageAccept?: string;
    placeholder?: string;
    /**
     * Wraps the editable body content with surrounding "chrome" (letterhead,
     * attachments, etc.) before it is handed to the renderer. The editor stores
     * only the body inner HTML in its source state — the chrome is composed
     * at render time, so it never round-trips through reconstruction.
     *
     * Defaults to wrapping the inner content in `<div class="pagedly-source-root">`.
     */
    wrapSourceForRender?: (innerHtml: string) => string;
    /**
     * @reserved Not yet wired. Real-time pagination (typing flows content
     * onto the next page) is always on today; this flag is a placeholder
     * for a future continuous (non-paginated) mode and is currently
     * ignored.
     */
    realtimePagination?: boolean;
    /**
     * HTML stamped into each page's top margin. Supports a `left` and a
     * `right` slot; use `{page}` / `{total}` placeholders for the current
     * and total page numbers. Rendered as inert chrome (not editable, not
     * part of the saved source) and printed with the document.
     */
    pageHeaderHtml?: {
        left?: string;
        right?: string;
    };
    /**
     * HTML stamped into each page's bottom margin. Same `left`/`right`
     * slots and `{page}`/`{total}` placeholders as `pageHeaderHtml`. A
     * common use is `{ right: "{page} / {total}" }` for page numbers.
     * An explicit value always wins over the `showPageNumbers` default.
     */
    pageFooterHtml?: {
        left?: string;
        right?: string;
    };
    /**
     * Page numbers out of the box. When left unset (the default), a footer
     * of `{ right: "{page} / {total}" }` is stamped into every page so page
     * numbers appear without any extra wiring. Set `false` to turn them off.
     * Ignored when `pageFooterHtml` is supplied — your footer wins.
     */
    showPageNumbers?: boolean;
    /**
     * @deprecated Ignored. Pagedly ships a single engine (the
     * contentEditable + DOM-surgery engine). The prop is kept on the
     * type for one cycle of source compatibility — any value passed
     * here is silently discarded. The older engine implementations
     * live in `src/_archive/` for historical reference.
     */
    engine?: "legacy" | "pageNode" | "ce";
};
//# sourceMappingURL=types.d.ts.map