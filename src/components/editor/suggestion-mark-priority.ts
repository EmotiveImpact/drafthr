import { SuggestionMark } from "@/lib/tiptap/suggestion-mark";

/**
 * The suggestion mark, parsed ahead of StarterKit's Strike. Strike also
 * claims `<del>`, and with equal priority it wins (StarterKit is listed
 * first), so a pending deletion loaded into the editor turned into a plain
 * `<s>` and stayed struck after Accept. Raising the priority keeps the
 * deletion a suggestion, so Accept drops the words and Reject keeps them.
 */
export const SuggestionMarkFirst = SuggestionMark.extend({
  parseHTML() {
    return [
      { tag: "ins[data-suggestion-id]", priority: 60 },
      { tag: "del[data-suggestion-id]", priority: 60 },
    ];
  },
});
