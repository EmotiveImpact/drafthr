import type { MutableRefObject } from "react";
import type { EditorActions, EditorProps, EditorViewMode, EditorHandle, PrintCss, ToolbarLayout, ToolbarPosition } from "../types";
export type LetterMode = "employer" | "employee";
export type LetterEvidenceDisplayMode = "inline" | "attached" | "pack_only";
export type LetterSection = {
    id: string;
    sectionId?: string;
    title?: string;
    html: string;
};
export type LetterEvidenceItem = {
    id: string;
    kind?: string;
    filename?: string;
    mimeType?: string;
    fileDataUrl?: string;
    content?: string;
    displayMode?: LetterEvidenceDisplayMode;
};
export type LetterEmployerDetails = {
    legalName?: string;
    address?: string;
    letterheadDataUrl?: string;
    signatureDataUrl?: string;
    signatoryName?: string;
    signatoryTitle?: string;
};
export type LetterContext = {
    jurisdiction?: string;
    ukRegion?: string;
    usState?: string;
};
export type LetterDraft = {
    id: string;
    mode?: LetterMode;
    letterType?: string;
    context?: LetterContext;
    employer?: LetterEmployerDetails;
    sections: LetterSection[];
    evidence?: LetterEvidenceItem[];
};
export type LetterEditorChange = {
    fullHtml: string;
    bodyHtml: string;
    sections: Record<string, string>;
    draft: LetterDraft;
};
export type LetterEditorProps = {
    draft: LetterDraft;
    printCss?: PrintCss;
    className?: string;
    canvasClassName?: string;
    toolbar?: EditorProps["toolbar"];
    toolbarPosition?: ToolbarPosition;
    toolbarLayout?: ToolbarLayout;
    viewMode?: EditorViewMode;
    editorRef?: MutableRefObject<EditorHandle | null>;
    actionsRef?: MutableRefObject<EditorActions | null>;
    onChange?: (change: LetterEditorChange) => void;
    onDraftChange?: (draft: LetterDraft) => void;
    onSectionChange?: (draftId: string, sectionId: string, html: string) => void;
    onSave?: (change: LetterEditorChange) => void | Promise<void>;
    /**
     * Debounce edits and call `onSave` automatically (shows a saving/saved badge).
     * `onSave` only fires through this path, so it defaults to ON whenever `onSave`
     * is supplied; pass `false` to keep `onSave` but drive saving yourself.
     */
    autoSave?: boolean;
    /** Debounce window for autoSave, ms (default 1500). */
    autoSaveDelayMs?: number;
    /** Render the document read-only (not editable; pagination/selection still work). */
    readOnly?: boolean;
    findPlaceholder?: string;
    reflowDelayMs?: number;
    realtimePagination?: boolean;
    pageHeaderHtml?: {
        left?: string;
        right?: string;
    };
    pageFooterHtml?: {
        left?: string;
        right?: string;
    };
    /**
     * Page numbers out of the box. Unset (default) stamps a
     * `{ right: "{page} / {total}" }` footer; `false` turns it off. An
     * explicit `pageFooterHtml` always wins.
     */
    showPageNumbers?: boolean;
    /** Toggle individual editor features on/off (see EditorFeatures). */
    features?: import("../features").EditorFeatures;
    /** Override toolbar UI strings (i18n). Merged over the English defaults. */
    labels?: Partial<Record<string, string>>;
    /** Host-supplied AI provider for the inline transform suite. */
    aiProvider?: import("../types").AiProvider;
    /** Suggesting mode: record edits as <ins>/<del> (track-changes recording). */
    suggesting?: boolean;
    /** Register custom commands (extensibility). */
    commands?: Record<string, import("../types").EditorCommandHandler>;
    /** Page size (default A4). */
    pageSize?: import("../types").EditorPageSize;
    /** Page orientation (default portrait). */
    pageOrientation?: import("../types").EditorOrientation;
    /** Page margin (CSS padding value, default "20mm"). */
    pageMargin?: string;
    /** Seed persisted import metrics (page geometry + typing baseline). */
    documentMetrics?: import("../types").DocumentMetrics;
    /** Fired when an import adopts new document metrics. */
    onDocumentMetricsChange?: (metrics: import("../types").DocumentMetrics) => void;
    /** Per-page diagonal watermark text. */
    watermark?: string;
    /** Running head: each page's top margin shows the governing heading. */
    runningHead?: {
        level?: number;
    };
    /** Suppress header/footer on the first page (title-page convention). */
    differentFirstPage?: boolean;
    /** Empty-state placeholder text shown when the document has no content. */
    placeholder?: string;
    /** Called when a comment is added (id + highlighted text). */
    onCommentAdd?: (commentId: string, quotedText: string) => void;
    /** Called when a comment highlight is clicked. */
    onCommentClick?: (commentId: string) => void;
    /**
     * How much formatting a paste keeps. `"clean"` (default) strips colors,
     * fonts and alignment; `"rich"` also keeps text color, highlight, and
     * alignment. Unsafe tags / Word cruft are stripped either way.
     */
    pasteFormatting?: "clean" | "rich";
    /**
     * @deprecated Ignored. Pagedly ships a single engine; any value
     * passed here is silently discarded. Kept on the type for one cycle
     * of source compatibility.
     */
    engine?: "legacy" | "pageNode" | "ce";
};
/** @deprecated Use `LetterDraft`. Kept for archive imports. */
export type PagedLetterDraft = LetterDraft;
/** @deprecated Use `LetterSection`. */
export type PagedLetterSection = LetterSection;
/** @deprecated Use `LetterEvidenceItem`. */
export type PagedLetterEvidenceItem = LetterEvidenceItem;
/** @deprecated Use `LetterEvidenceDisplayMode`. */
export type PagedLetterEvidenceDisplayMode = LetterEvidenceDisplayMode;
/** @deprecated Use `LetterMode`. */
export type PagedLetterMode = LetterMode;
/** @deprecated Use `LetterContext`. */
export type PagedLetterContext = LetterContext;
/** @deprecated Use `LetterEmployerDetails`. */
export type PagedLetterEmployerDetails = LetterEmployerDetails;
//# sourceMappingURL=types.d.ts.map