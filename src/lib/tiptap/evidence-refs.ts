import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Inline atomic nodes for evidence references inside the letter body.
 *
 * Why a Node (not a Mark)?
 *   Both [See Fig N] and [See Attachments] are discrete tokens — the user
 *   should never be able to put their cursor INSIDE one, edit half the
 *   label, or apply formatting to part of it. Tiptap models that with an
 *   `atom: true` inline Node: the whole thing is one cursor stop, one
 *   backspace deletes it whole, one selection picks it whole.
 *
 *   The existing CommentMark in this codebase is a Mark because it wraps
 *   *user-typed* prose ("apply a highlight to these words") — opposite
 *   shape from this case ("insert a token at this position").
 *
 * Why two nodes instead of one with a `kind` attribute?
 *   - Different HTML attributes (data-fig-id vs data-att-id) — folding them
 *     into a single Node muddies parseHTML / renderHTML and forces every
 *     consumer to branch on `kind`.
 *   - resolveFigureRefsInHtml() in src/lib/evidence.ts re-numbers figures
 *     via a regex tied to `class="figure-ref"` + `data-fig-id` specifically;
 *     keeping the two node names tightly tied to their HTML shape avoids
 *     accidental regex drift if we ever extend either one independently.
 *
 * renderHTML attribute ordering note:
 *   resolveFigureRefsInHtml uses /class="figure-ref"\s+data-fig-id="…"/ —
 *   class must come first. mergeAttributes preserves insertion order from
 *   the object literal, so we set `class` first in addAttributes' default
 *   renderHTML output. The node's editor-only styling is added via a
 *   separate `class` on the parseHTML output (handled below).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figureRef: {
      /** Insert a [See Fig N] reference at the current selection. */
      insertFigureRef: (figId: string, label: string) => ReturnType;
    };
    attachmentRef: {
      /** Insert a [See Attachments] reference at the current selection. */
      insertAttachmentRef: (attId: string) => ReturnType;
    };
  }
}

/**
 * Tailwind classes used to style the token inside the editor view. The
 * print/export CSS (src/components/editor/paged-edit/printCss.ts) handles
 * the italic-amber appearance for export — the editor view uses a subtle
 * chip treatment so the user can see at a glance that "[See Fig 1]" is
 * a single atomic token, not regular prose.
 *
 * `not-italic` overrides the parent `.prose em`-ish defaults so the editor
 * presentation stays as a chip even inside italicised paragraphs.
 */
const EDITOR_FIGURE_CLASS =
  "figure-ref bg-amber-100 text-amber-800 px-1 rounded text-[0.9em] font-medium not-italic";
const EDITOR_ATTACHMENT_CLASS =
  "attachment-ref bg-amber-100 text-amber-800 px-1 rounded text-[0.9em] font-medium not-italic";

/**
 * [See Fig N] reference. Carries data-fig-id so the export pipeline
 * (paged-edit/sourceHtml.ts → buildFiguresAppendix) can match it back to
 * the evidence item that owns the figure.
 */
export const FigureRef = Node.create({
  name: "figureRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      figId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-fig-id") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.figId) return {};
          return { "data-fig-id": attrs.figId };
        },
      },
      label: {
        default: "Fig",
        // The label is stored in the node's text content, not as an
        // attribute. parseHTML reads it from textContent so existing
        // section HTML round-trips cleanly.
        parseHTML: (el) => {
          const text = (el.textContent ?? "").trim();
          // Strip the "[See " prefix and trailing "]" if present so the
          // stored label is just "Fig 1" — renderHTML re-adds the brackets.
          const match = /^\[See\s+(.+?)\]$/.exec(text);
          return match ? match[1] : text || "Fig";
        },
        // Don't emit label as an HTML attribute — it lives in textContent.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.figure-ref",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          // Require data-fig-id so we don't accidentally consume unrelated
          // spans that happen to carry the same class.
          if (!el.hasAttribute("data-fig-id")) return false;
          return null; // Use addAttributes parseHTML for the actual values.
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Order matters: class first so resolveFigureRefsInHtml's regex matches.
    // The label goes inside as text content — wrapped in "[See …]" so the
    // exported HTML is identical to what the picker originally inserted.
    return [
      "span",
      mergeAttributes({ class: "figure-ref" }, HTMLAttributes),
      `[See ${(node.attrs.label as string) || "Fig"}]`,
    ];
  },

  renderText({ node }) {
    // When the doc is serialized to plain text (e.g. selection copy), the
    // token reads as "[See Fig 1]" — matches the visible label.
    return `[See ${(node.attrs.label as string) || "Fig"}]`;
  },

  addNodeView() {
    // Apply the editor-only styling via a node view so the chip treatment
    // shows up live but the serialized HTML stays clean (`class="figure-ref"`
    // only — print CSS handles the export-time italic-amber look).
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = EDITOR_FIGURE_CLASS;
      dom.setAttribute("data-fig-id", (node.attrs.figId as string) ?? "");
      dom.textContent = `[See ${(node.attrs.label as string) || "Fig"}]`;
      dom.contentEditable = "false";
      return { dom };
    };
  },

  addCommands() {
    return {
      insertFigureRef:
        (figId: string, label: string) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs: { figId, label } },
              { type: "text", text: " " },
            ])
            .run(),
    };
  },
});

/**
 * [See Attachments] reference. Same shape as FigureRef but bound to
 * data-att-id and a fixed label.
 */
export const AttachmentRef = Node.create({
  name: "attachmentRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      attId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-att-id") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.attId) return {};
          return { "data-att-id": attrs.attId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.attachment-ref",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (!el.hasAttribute("data-att-id")) return false;
          return null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "attachment-ref" }, HTMLAttributes),
      "[See Attachments]",
    ];
  },

  renderText() {
    return "[See Attachments]";
  },

  addNodeView() {
    return ({ node }: { node: ProseMirrorNode }) => {
      const dom = document.createElement("span");
      dom.className = EDITOR_ATTACHMENT_CLASS;
      dom.setAttribute("data-att-id", (node.attrs.attId as string) ?? "");
      dom.textContent = "[See Attachments]";
      dom.contentEditable = "false";
      return { dom };
    };
  },

  addCommands() {
    return {
      insertAttachmentRef:
        (attId: string) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs: { attId } },
              { type: "text", text: " " },
            ])
            .run(),
    };
  },
});
