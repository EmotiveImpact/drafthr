/**
 * Shared types for the on-page (paged) editor surface.
 *
 * PagedEditorActions is the small imperative handle the Editor route's top
 * File/Edit/Tools menubar uses to drive whichever on-page engine is mounted.
 * It originally lived in the home-grown PagedEditor (paged.js) engine; that
 * engine has been retired in favour of the vendored pagedly editor
 * (PagedlyDocEditor), but the contract is unchanged — kept here so it has a
 * stable home independent of any single engine implementation.
 */
export type PagedEditorActions = {
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  openFind: () => void;
};
