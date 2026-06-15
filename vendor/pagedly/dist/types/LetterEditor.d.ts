import type { EditorHandle } from "./types";
import type { LetterDraft, LetterEditorChange, LetterEditorProps } from "./letter/types";
/**
 * The letter editor is now a thin wrapper around Editor. TipTap
 * owns the document state; we keep responsibility for section management
 * (anchor markers → per-section html) on the way in and out.
 *
 * Chrome (letterhead, signature image, attachments) is NOT rendered in the
 * editing view — TipTap edits the body content directly. Hosts that want a
 * paged.js preview of the full letter should call
 * `buildPagedLetterFullHtml(draft)` from `./letter/sourceHtml` and feed the
 * result to paged.js separately.
 */
export declare const LetterEditor: import("react").ForwardRefExoticComponent<LetterEditorProps & import("react").RefAttributes<EditorHandle>>;
export type { LetterDraft, LetterEditorChange, LetterEditorProps };
//# sourceMappingURL=LetterEditor.d.ts.map