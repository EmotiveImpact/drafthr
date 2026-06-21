import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { EvidenceItem } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";
import {
  EvidenceSuggestionList,
  filterEvidenceForSlashQuery,
  type EvidenceSuggestionItem,
  type EvidenceSuggestionListHandle,
} from "@/components/editor/EvidenceSuggestionList";

/**
 * Options for the EvidenceSuggestion extension.
 *
 * `getItems` is a getter (not a static array) because the surrounding
 * Draft can change at any moment — new evidence added, items reordered,
 * figure labels renamed. The extension reads through this getter every
 * time it needs to filter, so the menu always reflects the latest draft.
 */
export type EvidenceSuggestionOptions = {
  /** Pulls the current draft.evidence at filter time. */
  getItems: () => EvidenceItem[];
};

/**
 * Internal state held by the ProseMirror plugin while the slash menu
 * is open. `from` and `to` mark the inclusive-exclusive document range
 * occupied by the trigger plus the query (e.g. the user typed "/ev" →
 * `from` points to the `/`, `to` points just after the `v`).
 */
type SuggestionState = {
  active: boolean;
  /** Document position of the "/" character. */
  from: number;
  /** Document position immediately after the last query character. */
  to: number;
  /** The query text after the "/" (may be empty). */
  query: string;
};

const SLASH_TRIGGER = "/";

/**
 * The set of characters that are allowed inside a slash query. Anything
 * outside this set (spaces, punctuation, etc.) closes the menu. We allow
 * letters, digits, hyphen, underscore and dot so users can match against
 * filenames like "working-pattern-meeting.png".
 */
const QUERY_CHAR = /[A-Za-z0-9_\-.]/;

const pluginKey = new PluginKey<SuggestionState>("evidence-suggestion");

const INITIAL_STATE: SuggestionState = {
  active: false,
  from: 0,
  to: 0,
  query: "",
};

/**
 * Build the HTML to insert when the user picks an evidence item.
 * Mirrors EvidencePickerPopover exactly so a slash-inserted figure-ref
 * looks identical to one inserted via the toolbar popover. Only figure
 * mode is supported through this surface — inline / attached evidence
 * have richer behaviour that belongs in the toolbar popover.
 */
function buildInsertHtml(
  item: EvidenceItem,
  allEvidence: EvidenceItem[],
): string {
  const mode = displayModeOf(item);
  if (mode === "attached") {
    return `<span class="attachment-ref" data-att-id="${escAttr(item.id)}">[See Attachments]</span>&nbsp;`;
  }
  // figure (default) and any unexpected mode fall back to the figure-ref
  // form. "inline" and "pack_only" items are filtered out at command time.
  const label = figureLabelFor(item, allEvidence) || "Fig";
  return `<span class="figure-ref" data-fig-id="${escAttr(item.id)}">[See ${escHtml(label)}]</span>&nbsp;`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escHtml(s);
}

/**
 * Resolve the current slash-query window by walking backwards from the
 * cursor until we hit either a `/` (success) or a non-query character
 * / whitespace / start-of-block (failure).
 *
 * Returns `null` if the cursor is not currently inside a valid slash
 * query, otherwise the absolute `from`/`to` document positions and the
 * captured `query` text.
 */
function probeSlashContext(
  view: EditorView,
): { from: number; to: number; query: string } | null {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;

  // Disallow inside code blocks / code marks (defensive — code mark is
  // disabled in SectionEditor but a future change might enable it).
  const codeBlockType = state.schema.nodes.codeBlock;
  if (codeBlockType && $pos.parent.type === codeBlockType) return null;
  const codeMarkType = state.schema.marks.code;
  if (codeMarkType && state.doc.rangeHasMark($pos.pos, $pos.pos, codeMarkType))
    return null;

  // Scan back inside the parent text-block to find the most recent "/".
  const parent = $pos.parent;
  const offsetInParent = $pos.parentOffset;
  if (offsetInParent === 0) return null;

  // Read the text content of the parent up to the cursor. textBetween
  // collapses non-text nodes to "", which is fine — we just stop at
  // the first non-query character.
  const startOfParent = $pos.start();
  const textBeforeCursor = parent.textBetween(
    0,
    offsetInParent,
    "\n",
    "￼",
  );

  // Walk back from end. Stop on whitespace before finding "/" → no menu.
  let i = textBeforeCursor.length - 1;
  while (i >= 0) {
    const ch = textBeforeCursor[i];
    if (ch === SLASH_TRIGGER) {
      // Found the trigger. The character immediately before "/" must be
      // start-of-block or whitespace — otherwise we'd trigger inside
      // words like "and/or" which is almost never what the user wants.
      const charBefore = i > 0 ? textBeforeCursor[i - 1] : "";
      if (charBefore && !/\s/.test(charBefore)) return null;
      const query = textBeforeCursor.slice(i + 1);
      return {
        from: startOfParent + i,
        to: startOfParent + offsetInParent,
        query,
      };
    }
    if (!QUERY_CHAR.test(ch)) return null;
    i -= 1;
  }
  return null;
}

/**
 * Position the popover anchored to the slash character's screen coords.
 * Uses `coordsAtPos(from)` for the top-of-caret position and applies
 * lightweight overflow handling so the menu doesn't fall off the right
 * edge or below the viewport.
 */
function positionPopover(
  element: HTMLElement,
  view: EditorView,
  from: number,
): void {
  const coords = view.coordsAtPos(from);
  const margin = 6;
  // Render the box off-screen first so we can measure its real size.
  element.style.left = "0px";
  element.style.top = "0px";
  const rect = element.getBoundingClientRect();

  let left = coords.left;
  let top = coords.bottom + margin;
  if (left + rect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - rect.width - 8);
  }
  if (top + rect.height > window.innerHeight - 8) {
    // Flip above the caret if there isn't enough room below.
    top = Math.max(8, coords.top - rect.height - margin);
  }
  element.style.left = `${left + window.scrollX}px`;
  element.style.top = `${top + window.scrollY}px`;
}

/**
 * The EvidenceSuggestion Tiptap extension. Renders a Pattern-C slash
 * command popover anchored at the caret. Triggers on `/` typed after
 * whitespace or block start, filters the draft's evidence rows by
 * substring match against filename + content + kind + figureLabel, and
 * inserts a `[See Fig N]` reference on Enter / click.
 *
 * Implemented with a ProseMirror Plugin (rather than `@tiptap/suggestion`,
 * which is not installed in this project) so we don't add a new
 * dependency. The popover element is rendered via `ReactRenderer` and
 * appended to `document.body` so it's never clipped by overflow rules.
 */
export const EvidenceSuggestion = Extension.create<EvidenceSuggestionOptions>({
  name: "evidenceSuggestion",

  addOptions() {
    return {
      getItems: () => [],
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    let renderer: ReactRenderer<EvidenceSuggestionListHandle> | null = null;
    let portalEl: HTMLElement | null = null;
    let lastQuery: string | null = null;
    let lastFrom: number | null = null;

    const close = () => {
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
      if (portalEl?.parentNode) {
        portalEl.parentNode.removeChild(portalEl);
      }
      portalEl = null;
      lastQuery = null;
      lastFrom = null;
    };

    const runCommand = (
      view: EditorView,
      entry: EvidenceSuggestionItem,
      state: SuggestionState,
    ): void => {
      const mode = displayModeOf(entry.item);
      // pack_only / inline items don't go through this flow — they're
      // available via the toolbar popover. Defensive: silently no-op
      // if one ever sneaks in.
      if (mode === "pack_only" || mode === "inline") {
        close();
        return;
      }
      const allEvidence = extension.options.getItems();
      const html = buildInsertHtml(entry.item, allEvidence);

      // Delete the slash-query range, then insert the HTML at that spot.
      // Re-derive positions from the LIVE plugin state: the `apply` reducer
      // remaps from/to across every transaction (tr.mapping.map), so the
      // `state` captured in this command's closure at render time can be
      // stale if the doc was remapped between render and click (e.g. a
      // streaming setContent re-sync). Reading the snapshot would delete the
      // wrong span and insert at the wrong offset, corrupting the document.
      const live = pluginKey.getState(view.state);
      const { from, to } = live?.active ? live : state;
      const tr = view.state.tr.delete(from, to);
      view.dispatch(tr);
      // insertContentAt at `from`: after the delete above, the slash window
      // collapsed to a single point at `from`, so this is the correct spot.
      extension.editor.chain().focus().insertContentAt(from, html).run();
      close();
    };

    const renderPopover = (
      view: EditorView,
      state: SuggestionState,
    ): void => {
      const items = filterEvidenceForSlashQuery(
        extension.options.getItems(),
        state.query,
      ).filter(({ item }) => {
        // The slash menu only handles figure / attached items — inline
        // and pack-only need richer interaction (e.g. choosing which
        // sub-mode), still done via the toolbar popover.
        const mode = displayModeOf(item);
        return mode === "figure" || mode === "attached";
      });

      if (!renderer || !portalEl) {
        portalEl = document.createElement("div");
        portalEl.style.position = "absolute";
        portalEl.style.zIndex = "60";
        portalEl.style.top = "0";
        portalEl.style.left = "0";
        document.body.appendChild(portalEl);
        renderer = new ReactRenderer<
          EvidenceSuggestionListHandle,
          { items: EvidenceSuggestionItem[]; command: (e: EvidenceSuggestionItem) => void }
        >(EvidenceSuggestionList, {
          editor: extension.editor,
          props: {
            items,
            command: (entry: EvidenceSuggestionItem) =>
              runCommand(view, entry, state),
          },
        });
        portalEl.appendChild(renderer.element);
      } else {
        renderer.updateProps({
          items,
          command: (entry: EvidenceSuggestionItem) =>
            runCommand(view, entry, state),
        });
      }

      // Position after render so the box has its real dimensions.
      requestAnimationFrame(() => {
        if (portalEl) positionPopover(portalEl, view, state.from);
      });
    };

    const plugin = new Plugin<SuggestionState>({
      key: pluginKey,
      state: {
        init: () => INITIAL_STATE,
        apply: (tr, prev) => {
          const meta = tr.getMeta(pluginKey) as
            | { state: SuggestionState }
            | undefined;
          if (meta) return meta.state;
          if (!prev.active) return prev;
          // Re-map positions across edits so the slash window survives
          // collaborative-style edits and similar.
          const from = tr.mapping.map(prev.from);
          const to = tr.mapping.map(prev.to);
          if (from === to) {
            return INITIAL_STATE;
          }
          return { ...prev, from, to };
        },
      },
      view(editorView) {
        return {
          update: (view) => {
            const ctx = probeSlashContext(view);
            if (!ctx) {
              if (renderer) close();
              if (pluginKey.getState(view.state)?.active) {
                const tr = view.state.tr.setMeta(pluginKey, {
                  state: INITIAL_STATE,
                });
                view.dispatch(tr);
              }
              return;
            }
            const nextState: SuggestionState = {
              active: true,
              from: ctx.from,
              to: ctx.to,
              query: ctx.query,
            };
            // Only push a new plugin state when something materially
            // changed, otherwise we'd loop on every transaction.
            const current = pluginKey.getState(view.state);
            if (
              !current?.active ||
              current.from !== nextState.from ||
              current.to !== nextState.to ||
              current.query !== nextState.query
            ) {
              const tr = view.state.tr.setMeta(pluginKey, {
                state: nextState,
              });
              view.dispatch(tr);
            }
            if (lastQuery !== ctx.query || lastFrom !== ctx.from) {
              lastQuery = ctx.query;
              lastFrom = ctx.from;
              renderPopover(view, nextState);
            }
          },
          destroy: () => {
            close();
          },
        };
        // editorView ref kept for parity with PM API; not used directly here.
        void editorView;
      },
      props: {
        handleKeyDown(view, event) {
          const state = pluginKey.getState(view.state);
          if (!state?.active) return false;
          // Escape closes the menu without inserting anything.
          if (event.key === "Escape") {
            const tr = view.state.tr.setMeta(pluginKey, {
              state: INITIAL_STATE,
            });
            view.dispatch(tr);
            close();
            return true;
          }
          // Delegate ↑/↓/Enter to the React component via its ref.
          if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "Enter"
          ) {
            const handled =
              renderer?.ref?.onKeyDown({ event }) ?? false;
            return handled;
          }
          return false;
        },
      },
    });

    return [plugin];
  },
});
