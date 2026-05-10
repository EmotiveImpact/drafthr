import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentMark: {
      /** Apply a comment mark to the current selection. */
      setCommentMark: (commentId: string) => ReturnType;
      /** Remove a specific comment mark by id from the selection (or all if id omitted). */
      unsetCommentMark: (commentId?: string) => ReturnType;
      /** Mark a comment as resolved/unresolved (visual change only). */
      setCommentResolved: (commentId: string, resolved: boolean) => ReturnType;
    };
  }
}

/**
 * Tiptap mark for inline anchored comments. Renders as <mark data-comment-id="...">
 * so the global stylesheet can paint the highlight. The comment body lives
 * outside the editor — in the draft.comments[] store — so this mark only
 * stores the comment id and a resolved flag.
 */
export const CommentMark = Mark.create({
  name: "commentMark",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) => {
          if (!attrs.commentId) return {};
          return { "data-comment-id": attrs.commentId };
        },
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-comment-resolved") === "true",
        renderHTML: (attrs) => ({
          "data-comment-resolved": attrs.resolved ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "mark[data-comment-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCommentMark:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId, resolved: false }),
      unsetCommentMark:
        (commentId?: string) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let modified = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            const mark = node.marks.find(
              (m) =>
                m.type.name === "commentMark" &&
                (!commentId || m.attrs.commentId === commentId)
            );
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              modified = true;
            }
          });
          if (modified && dispatch) dispatch(tr);
          return modified;
        },
      setCommentResolved:
        (commentId: string, resolved: boolean) =>
        ({ tr, state, dispatch }) => {
          let modified = false;
          state.doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === "commentMark" && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark.type);
                tr.addMark(
                  pos,
                  pos + node.nodeSize,
                  mark.type.create({ ...mark.attrs, resolved })
                );
                modified = true;
              }
            });
          });
          if (modified && dispatch) dispatch(tr);
          return modified;
        },
    };
  },
});
