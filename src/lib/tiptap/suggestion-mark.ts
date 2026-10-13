import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggestionMark: {
      /** Wrap the current selection in a pending suggestion mark. */
      setSuggestionMark: (attrs: SetSuggestionInput) => ReturnType;
      /** Update the status of every suggestion mark matching `id` in the
       * selection (or the entire doc when `range` is "doc"). */
      setSuggestionStatus: (
        id: string,
        status: SuggestionStatus,
        range?: "selection" | "doc",
      ) => ReturnType;
      /** Strip suggestion marks by id (or all of them when omitted). */
      unsetSuggestionMark: (id?: string) => ReturnType;
    };
  }
}

export type SuggestionKind = "insertion" | "deletion";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export type SuggestionAttrs = {
  id: string;
  kind: SuggestionKind;
  author: string;
  authorId?: string;
  body?: string;
  createdAt: number;
  status: SuggestionStatus;
};

export type SetSuggestionInput = Omit<SuggestionAttrs, "status" | "createdAt"> & {
  createdAt?: number;
  status?: SuggestionStatus;
};

/**
 * Inline mark for proposed edits (reviewer / AI / track-changes). One primitive
 * powering four downstream surfaces (consultant review, AI critique diff,
 * threaded comments richer than CommentMark, future co-edit cursors). The mark
 * stores who proposed it, what kind of edit, and the accept/reject status; the
 * merge helpers in suggestion-merge.ts collapse accepted marks into the final
 * text. Insertion → <ins>, Deletion → <del> so the export sanitiser can keep
 * the underlying text shape readable even if marks leak through.
 */
export const SuggestionMark = Mark.create({
  name: "suggestion",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-suggestion-id"),
        renderHTML: (attrs) => {
          if (!attrs.id) return {};
          return { "data-suggestion-id": attrs.id };
        },
      },
      kind: {
        default: "insertion",
        parseHTML: (el) => {
          const attr = el.getAttribute("data-suggestion-kind");
          if (attr === "insertion" || attr === "deletion") return attr;
          // Fall back to tag name so a hand-authored <del>/<ins> round-trips.
          return el.tagName.toLowerCase() === "del" ? "deletion" : "insertion";
        },
        renderHTML: (attrs) => ({
          "data-suggestion-kind": attrs.kind ?? "insertion",
        }),
      },
      author: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-author") ?? "",
        renderHTML: (attrs) => ({ "data-author": attrs.author ?? "" }),
      },
      authorId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-author-id"),
        renderHTML: (attrs) => {
          if (!attrs.authorId) return {};
          return { "data-author-id": attrs.authorId };
        },
      },
      body: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-body"),
        renderHTML: (attrs) => {
          if (!attrs.body) return {};
          return { "data-body": attrs.body };
        },
      },
      createdAt: {
        default: 0,
        parseHTML: (el) => {
          const v = el.getAttribute("data-created-at");
          const n = v ? Number(v) : NaN;
          return Number.isFinite(n) ? n : 0;
        },
        renderHTML: (attrs) => ({
          "data-created-at": String(attrs.createdAt ?? 0),
        }),
      },
      status: {
        default: "pending",
        parseHTML: (el) => {
          const v = el.getAttribute("data-status");
          if (v === "accepted" || v === "rejected" || v === "pending") return v;
          return "pending";
        },
        renderHTML: (attrs) => ({
          "data-status": attrs.status ?? "pending",
          "data-suggestion": "",
        }),
      },
    };
  },

  parseHTML() {
    // Priority above the default 50: StarterKit's Strike also parses <del>
    // and, at equal priority, wins (it is registered first), which turned a
    // pending deletion into a plain <s> that stayed struck after Accept.
    return [
      { tag: "ins[data-suggestion-id]", priority: 60 },
      { tag: "del[data-suggestion-id]", priority: 60 },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const kind = (mark.attrs.kind as SuggestionKind) ?? "insertion";
    const tag = kind === "deletion" ? "del" : "ins";
    const status = (mark.attrs.status as SuggestionStatus) ?? "pending";
    const cls =
      "ds-suggestion " +
      (kind === "deletion" ? "ds-suggestion-del" : "ds-suggestion-ins") +
      ` ds-suggestion-${status}`;
    return [
      tag,
      mergeAttributes(HTMLAttributes, { class: cls }),
      0,
    ];
  },

  addCommands() {
    return {
      setSuggestionMark:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, {
            id: attrs.id,
            kind: attrs.kind,
            author: attrs.author,
            authorId: attrs.authorId ?? null,
            body: attrs.body ?? null,
            createdAt: attrs.createdAt ?? Date.now(),
            status: attrs.status ?? "pending",
          }),
      setSuggestionStatus:
        (id, status, range = "doc") =>
        ({ tr, state, dispatch }) => {
          const { from, to } =
            range === "selection"
              ? { from: state.selection.from, to: state.selection.to }
              : { from: 0, to: state.doc.content.size };
          let modified = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name !== "suggestion") return;
              if (mark.attrs.id !== id) return;
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              tr.addMark(
                pos,
                pos + node.nodeSize,
                mark.type.create({ ...mark.attrs, status }),
              );
              modified = true;
            });
          });
          if (modified && dispatch) dispatch(tr);
          return modified;
        },
      unsetSuggestionMark:
        (id) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection.empty
            ? { from: 0, to: state.doc.content.size }
            : state.selection;
          let modified = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            const mark = node.marks.find(
              (m) =>
                m.type.name === "suggestion" && (!id || m.attrs.id === id),
            );
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              modified = true;
            }
          });
          if (modified && dispatch) dispatch(tr);
          return modified;
        },
    };
  },
});
