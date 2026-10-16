import { describe, expect, it } from "vitest";
import { PAGE_COMMANDS, TEXT_STYLES, pageFormatActive, pageTextStyle } from "./pageFormat";
import type { PageFormatState } from "./types";

const base: PageFormatState = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
  block: "p",
  align: "",
  link: false,
  linkHref: "",
  pasteFormatting: "clean",
  canUndo: false,
  canRedo: false,
};

describe("Page view format tools", () => {
  it("runs pagedly's own command for every ribbon button", () => {
    expect(PAGE_COMMANDS.bold).toEqual(["bold"]);
    expect(PAGE_COMMANDS.underline).toEqual(["underline"]);
    expect(PAGE_COMMANDS.bullets).toEqual(["insertUnorderedList"]);
    expect(PAGE_COMMANDS.numbered).toEqual(["insertOrderedList"]);
    expect(PAGE_COMMANDS.centre).toEqual(["justifyCenter"]);
    expect(PAGE_COMMANDS.justify).toEqual(["justifyFull"]);
    expect(PAGE_COMMANDS.clear).toEqual(["removeFormat"]);
  });

  it("offers paragraph and three heading levels, each with its block tag", () => {
    expect(TEXT_STYLES.map((s) => `${s.label}=${s.block}`)).toEqual(["Paragraph=p", "Heading 1=h1", "Heading 2=h2", "Heading 3=h3"]);
  });

  it("reads pressed states from pagedly's toolbar state", () => {
    expect(pageFormatActive(null, "bold")).toBe(false);
    expect(pageFormatActive({ ...base, bold: true }, "bold")).toBe(true);
    expect(pageFormatActive({ ...base, unorderedList: true }, "bullets")).toBe(true);
    expect(pageFormatActive({ ...base, align: "center" }, "centre")).toBe(true);
    expect(pageFormatActive({ ...base, align: "center" }, "left")).toBe(false);
    // No alignment set is not "Align left" pressed (the Sections view agrees).
    expect(pageFormatActive(base, "left")).toBe(false);
    expect(pageFormatActive({ ...base, bold: true }, "clear")).toBe(false);
  });

  it("names the caret's text style", () => {
    expect(pageTextStyle("p")).toBe("Paragraph");
    expect(pageTextStyle("h2")).toBe("Heading 2");
    expect(pageTextStyle("H4")).toBe("Heading 4");
    expect(pageTextStyle("li")).toBe("Paragraph");
    expect(pageTextStyle(undefined)).toBe("Paragraph");
  });
});
