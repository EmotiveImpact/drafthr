/**
 * The Home ribbon's format tools, mapped onto pagedly for the Page view.
 * The same buttons format a section in the Sections view (through Tiptap);
 * here each one names the pagedly command it runs and how its pressed state
 * reads from pagedly's toolbar state.
 */
import type { PageFormatState } from "./types";

export type FormatKey =
  | "bold"
  | "italic"
  | "underline"
  | "bullets"
  | "numbered"
  | "left"
  | "centre"
  | "right"
  | "justify"
  | "clear";

/** The text styles the ribbon offers, with the block tag each one sets. */
export const TEXT_STYLES = [
  { label: "Paragraph", block: "p" },
  { label: "Heading 1", block: "h1" },
  { label: "Heading 2", block: "h2" },
  { label: "Heading 3", block: "h3" },
] as const;

export type TextStyle = (typeof TEXT_STYLES)[number]["label"];

/** The pagedly command (and value) each format button runs. */
export const PAGE_COMMANDS: Record<FormatKey, readonly [string, string?]> = {
  bold: ["bold"],
  italic: ["italic"],
  underline: ["underline"],
  bullets: ["insertUnorderedList"],
  numbered: ["insertOrderedList"],
  left: ["justifyLeft"],
  centre: ["justifyCenter"],
  right: ["justifyRight"],
  justify: ["justifyFull"],
  clear: ["removeFormat"],
};

/** Whether a format button shows pressed for the caret's position. */
export function pageFormatActive(state: PageFormatState | null, key: FormatKey): boolean {
  if (!state) return false;
  switch (key) {
    case "bold":
      return state.bold;
    case "italic":
      return state.italic;
    case "underline":
      return state.underline;
    case "bullets":
      return state.unorderedList;
    case "numbered":
      return state.orderedList;
    case "left":
      return state.align === "left";
    case "centre":
      return state.align === "center";
    case "right":
      return state.align === "right";
    case "justify":
      return state.align === "justify";
    case "clear":
      return false;
  }
}

/** The style menu's label for the caret's block ("Heading 4" for an h4 the
 *  menu does not offer, "Paragraph" for anything that is not a heading). */
export function pageTextStyle(block: string | undefined): string {
  const m = /^h([1-6])$/i.exec(block ?? "");
  return m ? `Heading ${m[1]}` : "Paragraph";
}
