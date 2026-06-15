import type { ToolbarProps, ToolbarState } from "./types";
export declare const DEFAULT_TOOLBAR_STATE: ToolbarState;
export declare const Toolbar: import("react").MemoExoticComponent<typeof ToolbarImpl>;
/** @deprecated Use `Toolbar`. Kept for archived-engine imports. */
export declare const PagedEditorToolbar: import("react").MemoExoticComponent<typeof ToolbarImpl>;
declare function ToolbarImpl({ editor, editorRef, state, disabled, className, labels, onCommand, onUndo, onRedo, onImageInsert, features, }: ToolbarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Toolbar.d.ts.map