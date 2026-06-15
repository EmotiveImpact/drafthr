export interface EditorFeatures {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    inlineCode?: boolean;
    fontColor?: boolean;
    highlight?: boolean;
    fontFamily?: boolean;
    fontSize?: boolean;
    removeFormat?: boolean;
    headings?: boolean;
    blockquote?: boolean;
    codeBlock?: boolean;
    alignment?: boolean;
    indent?: boolean;
    lineSpacing?: boolean;
    footnotes?: "off" | "footnotes" | "endnotes";
    bulletList?: boolean;
    numberedList?: boolean;
    checklist?: boolean;
    link?: boolean;
    image?: boolean;
    table?: boolean;
    horizontalRule?: boolean;
    pageBreak?: boolean;
    find?: boolean;
    print?: boolean;
    downloadPdf?: boolean;
    /** Export the document as a .docx download (toolbar/palette). */
    exportDocx?: boolean;
    /** Import a .docx file at the caret (toolbar/palette). */
    importDocx?: boolean;
    /** Copy/export the document as Markdown (toolbar/palette). */
    exportMarkdown?: boolean;
    /** Import a Markdown file at the caret (toolbar/palette). */
    importMarkdown?: boolean;
    paste?: boolean;
    /** Live word / character / reading-time readout in the toolbar. */
    wordCount?: boolean;
    /** Markdown autoformat on type (# →H1, - →bullet, **x** →bold, etc.). */
    markdownShortcuts?: boolean;
    /** Smart typography: -- →—, ... →…, (c)/(tm)/(r) → © ™ ®. */
    smartTypography?: boolean;
    /** Auto-link typed URLs on space. */
    autoLink?: boolean;
    /** Slash (/) command menu for inserting blocks/format at the caret. */
    slashMenu?: boolean;
    /** ⌘K / Ctrl-K command palette over the full action set. */
    commandPalette?: boolean;
    /** Document outline / navigation pane (heading tree, click to scroll). */
    outline?: boolean;
    /** Inline AI transform suite (only shown when an aiProvider is supplied). */
    ai?: boolean;
    /** Automatic hyphenation (hyphens:auto) for justified, dense text. */
    hyphenation?: boolean;
    /** On-screen widow/orphan control: keep short paragraphs whole (opt-in). */
    widowControl?: boolean;
    /** Inline comments (range-anchored highlights + host thread callbacks). */
    comments?: boolean;
    /** Track-changes review: accept/reject <ins>/<del> suggestion marks. */
    trackChanges?: boolean;
    /** Page-numbered table of contents (insert/refresh from headings). */
    toc?: boolean;
    /** Section breaks (new sheet in print) + per-section page-number restart. */
    sections?: boolean;
    /** Multi-column blocks (single-page; toggles column-count on the selection). */
    columns?: boolean;
    /** Leader rows (label · dotted leader · right-aligned value). */
    leaders?: boolean;
}
export type ResolvedFeatures = Required<EditorFeatures>;
/** Everything on. */
export declare const DEFAULT_FEATURES: ResolvedFeatures;
/** A lean preset: basic formatting + lists + links only. */
export declare const FEATURES_MINIMAL: ResolvedFeatures;
/** Full preset (alias of DEFAULT_FEATURES) for explicit intent. */
export declare const FEATURES_FULL: ResolvedFeatures;
/** Merge a partial host config over the defaults. */
export declare function resolveFeatures(features: EditorFeatures | undefined): ResolvedFeatures;
import type { EditorCommand } from "./types";
export declare const COMMAND_FEATURE: Partial<Record<EditorCommand, keyof EditorFeatures>>;
//# sourceMappingURL=features.d.ts.map