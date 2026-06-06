import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  hasPendingSuggestions,
  listSuggestions,
  listSuggestionsHtml,
  mergeAcceptedSuggestions,
  mergeAcceptedSuggestionsHtml,
  type SuggestionSummary,
} from "./suggestion-merge";

/* ----------------------------------------------------------------------------
 * Helpers — minimal JSONContent doc factories. Tiptap mark.attrs are partial
 * by design, so we mirror the editor's output shape only with the fields the
 * merge logic actually reads.
 * --------------------------------------------------------------------------*/

function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

function text(value: string, marks?: JSONContent["marks"]): JSONContent {
  return { type: "text", text: value, ...(marks ? { marks } : {}) };
}

function suggestionMark(attrs: {
  id: string;
  kind: "insertion" | "deletion";
  status: "pending" | "accepted" | "rejected";
  author?: string;
  body?: string;
  authorId?: string;
  createdAt?: number;
}) {
  return [
    {
      type: "suggestion",
      attrs: {
        id: attrs.id,
        kind: attrs.kind,
        status: attrs.status,
        author: attrs.author ?? "Test reviewer",
        body: attrs.body,
        authorId: attrs.authorId,
        createdAt: attrs.createdAt ?? 0,
      },
    },
  ];
}

/* ============================================================================
 * mergeAcceptedSuggestions — JSONContent walker
 * ==========================================================================*/

describe("mergeAcceptedSuggestions (JSON)", () => {
  it("strips an accepted insertion mark but keeps the text", () => {
    const input = doc(
      text("hello "),
      text("world", suggestionMark({ id: "a", kind: "insertion", status: "accepted" })),
    );
    const output = mergeAcceptedSuggestions(input);
    const para = output.content?.[0];
    expect(para?.content).toHaveLength(2);
    expect(para?.content?.[1]).toEqual({ type: "text", text: "world" });
    // No suggestion marks left after a successful accept.
    const summaries = listSuggestions(output);
    expect(summaries).toHaveLength(0);
  });

  it("removes accepted deletion text (mark + wrapped text both gone)", () => {
    const input = doc(
      text("keep "),
      text("delete me", suggestionMark({ id: "d", kind: "deletion", status: "accepted" })),
      text(" trailing"),
    );
    const output = mergeAcceptedSuggestions(input);
    const para = output.content?.[0];
    expect(para?.content?.map((n) => n.text)).toEqual(["keep ", " trailing"]);
  });

  it("leaves rejected marks untouched (text still wrapped)", () => {
    const input = doc(
      text("a "),
      text("b", suggestionMark({ id: "r", kind: "insertion", status: "rejected" })),
    );
    const output = mergeAcceptedSuggestions(input);
    const para = output.content?.[0];
    expect(para?.content?.[1].marks?.[0]?.type).toBe("suggestion");
    expect(para?.content?.[1].marks?.[0]?.attrs?.status).toBe("rejected");
  });

  it("strips pending insertion marks (treats indecision as 'do not apply')", () => {
    const input = doc(
      text("a "),
      text("pending", suggestionMark({ id: "p", kind: "insertion", status: "pending" })),
    );
    const output = mergeAcceptedSuggestions(input);
    const para = output.content?.[0];
    // Pending insertion's text vanishes — it was never canonical.
    expect(para?.content?.map((n) => n.text)).toEqual(["a "]);
  });

  it("strips pending deletion marks but keeps the wrapped text", () => {
    // Pending deletion = reviewer wants to remove this but hasn't been
    // accepted yet, so the canonical doc still contains it.
    const input = doc(
      text("a "),
      text("undecided", suggestionMark({ id: "p", kind: "deletion", status: "pending" })),
      text(" b"),
    );
    const output = mergeAcceptedSuggestions(input);
    const para = output.content?.[0];
    expect(para?.content?.map((n) => n.text)).toEqual(["a ", "undecided", " b"]);
    expect(para?.content?.[1].marks).toBeUndefined();
  });

  it("preserves other marks (bold, italic) when stripping a suggestion mark", () => {
    const input = doc(
      text("yo", [
        { type: "bold" },
        ...suggestionMark({ id: "x", kind: "insertion", status: "accepted" }),
      ]),
    );
    const output = mergeAcceptedSuggestions(input);
    const node = output.content?.[0].content?.[0];
    expect(node?.marks?.map((m) => m.type)).toEqual(["bold"]);
  });
});

/* ============================================================================
 * listSuggestions — flat summary list
 * ==========================================================================*/

describe("listSuggestions (JSON)", () => {
  it("returns one summary per mark with correct attributes", () => {
    const input = doc(
      text("a"),
      text("ins", suggestionMark({ id: "i1", kind: "insertion", status: "pending", author: "AI" })),
      text(" "),
      text("del", suggestionMark({
        id: "d1",
        kind: "deletion",
        status: "rejected",
        author: "Sarah",
        body: "Wording too loose",
      })),
    );
    const out = listSuggestions(input);
    expect(out).toHaveLength(2);
    const byId = Object.fromEntries(out.map((s) => [s.id, s])) as Record<string, SuggestionSummary>;
    expect(byId.i1).toMatchObject({ kind: "insertion", status: "pending", author: "AI", text: "ins" });
    expect(byId.d1).toMatchObject({
      kind: "deletion",
      status: "rejected",
      author: "Sarah",
      body: "Wording too loose",
      text: "del",
    });
  });

  it("dedupes by id and concatenates fragmented text spans", () => {
    const mark = suggestionMark({ id: "same", kind: "insertion", status: "pending" });
    const input = doc(text("foo", mark), text(" "), text("bar", mark));
    const out = listSuggestions(input);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("foobar");
  });
});

/* ============================================================================
 * HTML helpers — used by the store action. jsdom provides DOMParser.
 * ==========================================================================*/

describe("mergeAcceptedSuggestionsHtml + listSuggestionsHtml (DOM)", () => {
  it("folds accepted insertions into the prose", () => {
    const html =
      '<p>hello <ins data-suggestion-id="a" data-suggestion-kind="insertion" data-status="accepted">world</ins></p>';
    const out = mergeAcceptedSuggestionsHtml(html);
    expect(out).toBe("<p>hello world</p>");
  });

  it("drops accepted deletions entirely", () => {
    const html =
      '<p>keep <del data-suggestion-id="d" data-suggestion-kind="deletion" data-status="accepted">delete</del> trailing</p>';
    const out = mergeAcceptedSuggestionsHtml(html);
    expect(out).toBe("<p>keep  trailing</p>");
  });

  it("leaves rejected suggestion marks untouched", () => {
    const html =
      '<p><ins data-suggestion-id="r" data-status="rejected">stays</ins></p>';
    const out = mergeAcceptedSuggestionsHtml(html);
    expect(out).toContain('data-suggestion-id="r"');
  });

  it("drops pending insertions and keeps pending deletions", () => {
    const html =
      '<p><ins data-suggestion-id="p1" data-suggestion-kind="insertion" data-status="pending">gone</ins>' +
      '<del data-suggestion-id="p2" data-suggestion-kind="deletion" data-status="pending">stays</del></p>';
    const out = mergeAcceptedSuggestionsHtml(html);
    expect(out).not.toContain("gone");
    expect(out).toContain("stays");
    expect(out).not.toContain("data-suggestion-id");
  });

  it("listSuggestionsHtml returns one entry per id with author + status", () => {
    const html =
      '<p>x <ins data-suggestion-id="a" data-suggestion-kind="insertion" data-author="AI" ' +
      'data-status="pending">y</ins> ' +
      '<del data-suggestion-id="b" data-suggestion-kind="deletion" data-author="Sarah" ' +
      'data-status="rejected">z</del></p>';
    const out = listSuggestionsHtml(html);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.id === "a")).toMatchObject({
      kind: "insertion",
      author: "AI",
      status: "pending",
      text: "y",
    });
    expect(out.find((s) => s.id === "b")).toMatchObject({
      kind: "deletion",
      author: "Sarah",
      status: "rejected",
      text: "z",
    });
  });

  it("hasPendingSuggestions short-circuits when there are no suggestion marks", () => {
    expect(hasPendingSuggestions("<p>plain</p>")).toBe(false);
    expect(
      hasPendingSuggestions(
        '<p><ins data-suggestion-id="x" data-status="rejected">no</ins></p>'
      )
    ).toBe(false);
    expect(
      hasPendingSuggestions(
        '<p><ins data-suggestion-id="x" data-status="pending">yes</ins></p>'
      )
    ).toBe(true);
  });

  // --- export mode (bug #1): reviewer track-changes must never reach a file ---
  describe("forExport mode", () => {
    it("removes a REJECTED insertion's text entirely (not reinstated as prose)", () => {
      const html =
        '<p>Before <ins data-suggestion-id="r" data-suggestion-kind="insertion" data-status="rejected">This clause is waived.</ins> after</p>';
      const out = mergeAcceptedSuggestionsHtml(html, { forExport: true });
      expect(out).not.toContain("This clause is waived.");
      expect(out).not.toContain("<ins");
      expect(out).toContain("Before");
      expect(out).toContain("after");
    });

    it("unwraps a REJECTED deletion — original text stays, strike markup gone", () => {
      const html =
        '<p>keep <del data-suggestion-id="d" data-suggestion-kind="deletion" data-status="rejected">original text</del> end</p>';
      const out = mergeAcceptedSuggestionsHtml(html, { forExport: true });
      expect(out).toContain("original text");
      expect(out).not.toContain("<del");
    });

    it("drops a PENDING insertion's text on export", () => {
      const html =
        '<p><ins data-suggestion-id="p" data-suggestion-kind="insertion" data-status="pending">draft only</ins>final</p>';
      const out = mergeAcceptedSuggestionsHtml(html, { forExport: true });
      expect(out).not.toContain("draft only");
      expect(out).toContain("final");
    });

    it("still folds accepted insertions in (export keeps accepted edits)", () => {
      const html =
        '<p><ins data-suggestion-id="a" data-suggestion-kind="insertion" data-status="accepted">accepted addition</ins></p>';
      const out = mergeAcceptedSuggestionsHtml(html, { forExport: true });
      expect(out).toContain("accepted addition");
      expect(out).not.toContain("<ins");
    });

    it("authoring mode (default) still LEAVES rejected marks intact", () => {
      const html =
        '<p><ins data-suggestion-id="r" data-status="rejected">stays in editor</ins></p>';
      const out = mergeAcceptedSuggestionsHtml(html);
      expect(out).toContain("stays in editor");
      expect(out).toContain('data-suggestion-id="r"');
    });
  });
});
