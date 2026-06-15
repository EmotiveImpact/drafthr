# Pagedly

A React rich-text editor for letter, contract, and report documents — built to feel like Microsoft Word's "Print Layout" view. As the user types, content flows automatically onto the next page; visible page boundaries appear in the edit surface; letterhead, signature, and page numbers render correctly when the document is printed.

Cross-browser (Chromium + WebKit). Word-style word-level reflow at page boundaries. In-document find/replace. Native browser print with letterhead injection.

## Install

```sh
npm install pagedly
```

```tsx
import {
  LetterEditor,
  ContentEditableEditor,
  Toolbar,
  type LetterDraft,
} from "pagedly";
import "pagedly/styles.css";
```

## Letter editor

`LetterEditor` owns a `LetterDraft` model (per-section HTML, employer details, evidence attachments) and renders an editable page surface with letterhead.

```tsx
import { useState } from "react";
import { LetterEditor, type LetterDraft } from "pagedly";
import "pagedly/styles.css";

function LetterEditor() {
  const [draft, setDraft] = useState<LetterDraft>({
    id: "draft-1",
    mode: "employer",
    letterType: "warning",
    employer: {
      legalName: "Acme Ltd",
      letterheadDataUrl: "https://example.com/letterhead.png",
      signatureDataUrl: "https://example.com/signature.png",
    },
    sections: [
      { id: "opening",   sectionId: "opening",   html: "<p>Dear Alex,</p>" },
      { id: "body",      sectionId: "body",      html: "<p>...</p>" },
      { id: "signature", sectionId: "signature", html: "<p>Regards,</p>" },
    ],
    evidence: [],
  });

  return (
    <LetterEditor
      draft={draft}
      onDraftChange={setDraft}
      onSectionChange={(draftId, sectionId, html) => {
        // Persist per-section HTML if you care.
      }}
    />
  );
}
```

### Printing

Press Cmd/Ctrl-P (or call `editorRef.current?.downloadPdf()`) to open the browser's native print dialog. The editor injects letterhead (page 1), signature image (last page, above the signature section), and any attached evidence at print time, then removes them when print finishes.

## Generic editor

For non-letter documents (contracts, reports, general rich text) use the contentEditable component directly:

```tsx
import { useState } from "react";
import { ContentEditableEditor } from "pagedly";
import "pagedly/styles.css";

function MyEditor() {
  const [html, setHtml] = useState("<p>Hello world</p>");
  return (
    <ContentEditableEditor
      html={html}
      onChange={setHtml}
    />
  );
}
```

### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `html` | `string` | — | Initial HTML. |
| `onChange` | `(html: string) => void` | — | Fires when content changes. |
| `sanitizePastedHtml` | `(html: string) => string` | built-in | Strips `style`/`class`/`id`/`data-*` from pasted HTML. |
| `pageWidthMm` | `number` | `210` | A4 default. |
| `pageHeightMm` | `number` | `297` | A4 default. |
| `pagePadding` | `string` | `"25mm 20mm"` | CSS shorthand for the page's content padding. |
| `doNotBreak` | `(el: HTMLElement) => boolean` | — | Return `true` to keep an element from being split across pages. |
| `pageHeaderHtml` | `{ left?: string; right?: string }` | — | Per-page top-margin chrome. `{page}` / `{total}` placeholders are substituted per page. Shown on screen and in print; never written to the saved source. |
| `pageFooterHtml` | `{ left?: string; right?: string }` | — | Per-page bottom-margin chrome (e.g. page numbers). Same placeholders and source-exclusion as the header. |
| `changeDebounceMs` | `number` | `120` | Debounce (ms) for the `onChange` notification — a burst of edits coalesces into one call this long after the last keystroke, keeping large documents responsive. `getHTML()` stays synchronous and current. |

### Imperative handle

```tsx
import { useRef } from "react";
import type { ContentEditableEditorHandle } from "pagedly";

const editorRef = useRef<ContentEditableEditorHandle>(null);

editorRef.current?.focus();
editorRef.current?.getHTML();
editorRef.current?.setHTML("<p>...</p>");
editorRef.current?.execCommand("bold");
editorRef.current?.reflow();
```

## Toolbar

`Toolbar` is a Radix-based toolbar covering: bold / italic / underline / strikethrough, headings, alignment, lists, font size, links, images, tables, undo/redo, find/replace, print/PDF. Use it inline or render your own:

```tsx
<LetterEditor
  draft={draft}
  onDraftChange={setDraft}
  toolbar={true}                    // built-in toolbar (default)
  toolbarPosition="sticky"          // or "stationary"
  toolbarLayout="compact"           // or "full"
/>
```

## Find / replace

Cmd-F (or `editorRef.current?.openFind()`) opens an in-document find panel. Enter advances to the next match; Replace swaps the current match and advances. Escape closes.

## Large documents

Pagination is incremental and runs off the critical path. Editing re-paginates
only the pages around the caret — typing speed is independent of document length
— while loading or pasting a large document paginates the visible portion up
front and settles the rest during browser idle time, so it never blocks the UI.
Documents of many hundreds of pages stay responsive: a big paste streams in
across frames rather than freezing, and a one-shot load is interactive
immediately. `LetterEditor` and `Editor` show page numbers in the footer by
default — pass `showPageNumbers={false}` to hide them, or `pageFooterHtml` /
`pageHeaderHtml` for custom margin content. Tune the `onChange` cadence with
`changeDebounceMs` (or `reflowDelayMs` at the `Editor` / `LetterEditor` level).

## Browser support

Chromium-based browsers (Chrome, Edge, Brave, Opera) and WebKit (Safari).

## License

Pagedly is **commercial software** distributed under the Pagedly Commercial License Agreement — see [LICENSE](./LICENSE). Purchase a license at [pagedly.dev](https://pagedly.dev).

Third-party open-source attributions: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
