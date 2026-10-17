import { describe, expect, it } from "vitest";
import { editExcerpt } from "./edit-excerpt";

const html =
  '<p>At the meeting we discussed your attendance since your first written warning on 29 September 2026, during which you were absent on three further occasions without ' +
  '<del data-suggestion-id="s1" data-status="pending">telling</del><ins data-suggestion-id="s1" data-status="pending">calling</ins> your manager before ' +
  '<ins data-suggestion-id="s2" data-status="pending">the start of </ins>your shift<ins data-suggestion-id="s3" data-status="pending">, as the absence procedure requires</ins>.</p>' +
  "<p>I have decided to issue you with a final written warning.</p>";

const read = (parts: { kind: string; text: string }[]) =>
  parts.map((p) => (p.kind === "del" ? `~~${p.text}~~` : p.kind === "ins" ? `[${p.text}]` : p.text)).join("");

describe("editExcerpt", () => {
  it("reads as a sentence with the unchanged words around the changes", () => {
    const out = read(editExcerpt(html, ["s1", "s2", "s3"]));
    expect(out).toBe(
      "…absent on three further occasions without ~~telling~~[calling] your manager before [the start of ]your shift[, as the absence procedure requires]."
    );
    expect(out).not.toMatch(/ ,/);
  });
  it("shows another suggestion as the current text", () => {
    const out = read(editExcerpt(html, ["s3"]));
    expect(out).toBe("…telling your manager before your shift[, as the absence procedure requires].");
  });
  it("is empty when no mark matches", () => {
    expect(editExcerpt(html, ["nope"])).toEqual([]);
  });
});
