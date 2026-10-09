import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  IMAGE_NOT_EMBEDDED_NOTE,
  fetchImageAsDataUrl,
  isRemoteImageSrc,
} from "@/lib/storage/embedRemoteImages";

export type RemoteImageEmbedOptions = {
  /** Injectable for tests. */
  fetchImage: (url: string) => Promise<string | null>;
};

const key = new PluginKey("remoteImageEmbed");

/**
 * Embeds remote images (pasted or dropped from a web page) as data URLs as
 * soon as they enter the document; see src/lib/storage/embedRemoteImages.ts
 * for why this happens at paste time. An image that cannot be fetched is
 * replaced by a visible "[image not embedded]" paragraph.
 */
export const RemoteImageEmbed = Extension.create<RemoteImageEmbedOptions>({
  name: "remoteImageEmbed",

  addOptions() {
    return {
      fetchImage: (url: string) => fetchImageAsDataUrl(url),
    };
  },

  addProseMirrorPlugins() {
    const fetchImage = this.options.fetchImage;
    return [
      new Plugin({
        key,
        view(initialView) {
          const inFlight = new Set<string>();
          let destroyed = false;

          // Only rewrite the document while it can be edited. A locked letter
          // (approved, a viewer, a reviewer in review) must not change just
          // because it was opened: the swap fires onUpdate and saves.
          const resolve = (view: EditorView, url: string, dataUrl: string | null) => {
            inFlight.delete(url);
            if (destroyed || !view.editable) return;
            const { state } = view;
            const targets: Array<{ pos: number; size: number; attrs: Record<string, unknown> }> = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === "image" && node.attrs.src === url) {
                targets.push({ pos, size: node.nodeSize, attrs: node.attrs });
              }
            });
            if (targets.length === 0) return;
            const tr = state.tr;
            // Back to front so earlier positions stay valid.
            for (const t of targets.reverse()) {
              if (dataUrl) {
                tr.setNodeMarkup(t.pos, undefined, { ...t.attrs, src: dataUrl });
              } else {
                const paragraph = state.schema.nodes.paragraph;
                const italic = state.schema.marks.italic;
                const text = state.schema.text(IMAGE_NOT_EMBEDDED_NOTE, italic ? [italic.create()] : []);
                tr.replaceWith(t.pos, t.pos + t.size, paragraph.create(null, text));
              }
            }
            view.dispatch(tr);
          };

          const scan = (view: EditorView) => {
            if (!view.editable) return;
            view.state.doc.descendants((node) => {
              if (node.type.name !== "image") return;
              const src = node.attrs.src;
              if (!isRemoteImageSrc(src) || inFlight.has(src)) return;
              inFlight.add(src);
              void fetchImage(src)
                .catch(() => null)
                .then((dataUrl) => resolve(view, src, dataUrl));
            });
          };

          scan(initialView);
          let wasEditable = initialView.editable;
          return {
            update(view, prevState) {
              // Rescan on edits, and when a locked editor becomes editable.
              const unlocked = view.editable && !wasEditable;
              wasEditable = view.editable;
              if (unlocked || view.state.doc !== prevState.doc) scan(view);
            },
            destroy() {
              destroyed = true;
            },
          };
        },
      }),
    ];
  },
});
