/**
 * Shared types for the on-page (paged) editor surface.
 *
 * PagedEditorActions is the small imperative handle the Editor route's top
 * File/Edit/Tools menubar uses to drive whichever on-page engine is mounted.
 * It originally lived in the home-grown PagedEditor (paged.js) engine; that
 * engine has been retired in favour of the vendored pagedly editor
 * (PagedlyDocEditor), but the contract is unchanged — kept here so it has a
 * stable home independent of any single engine implementation.
 *
 * `run` and `subscribe` let the letter's own Home ribbon format the Page view
 * (bold, headings, lists, alignment, links) in place of pagedly's toolbar.
 */
export type PagedEditorActions = {
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  openFind: () => void;
  /** Run a pagedly command ("bold", "formatBlock" with "h2", "createLink" with a URL, ...). */
  run?: (command: string, value?: string) => void;
  /** Follow the format at the caret. Calls back at once when a state is known. */
  subscribe?: (listener: (state: PageFormatState) => void) => () => void;
};

/** The parts of pagedly's toolbar state the ribbon shows. */
export type PageFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  /** "p", "h1" to "h6", or another block tag. */
  block: string;
  align: "left" | "center" | "right" | "justify" | "";
  link: boolean;
  linkHref: string;
  pasteFormatting: "clean" | "rich";
  canUndo: boolean;
  canRedo: boolean;
};
