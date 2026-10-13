/**
 * How the Ctrl K palette matches what was typed (CREATE-X15).
 *
 * cmdk's default filter is fuzzy: "tour" matched any letter whose keywords
 * held a t, then an o, then a u, then an r somewhere, so about 16 letters
 * and letter types sat above "Replay the guided tour". Here a row matches
 * only when every typed word starts a word in its label or keywords, or the
 * whole query appears as typed (section and comment text). Rows whose label
 * matches rank first; cmdk sorts the groups by their best row.
 *
 * The label is the first keyword each row passes.
 */
const WORD_SPLIT = /[^\p{L}\p{N}£]+/u;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function words(s: string): string[] {
  return s.split(WORD_SPLIT).filter(Boolean);
}

export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const q = norm(search);
  if (!q) return 1;
  const kw = keywords && keywords.length > 0 ? keywords : [value];
  const label = norm(kw[0] ?? "");
  const hay = norm(kw.join(" "));
  const tokens = words(q);
  if (tokens.length === 0) return hay.includes(q) ? 0.3 : 0;
  const hayWords = words(hay);
  const allPrefix = tokens.every((t) => hayWords.some((w) => w.startsWith(t)));
  if (!allPrefix && !hay.includes(q)) return 0;
  if (label.startsWith(q)) return 1;
  const labelWords = words(label);
  if (tokens.every((t) => labelWords.some((w) => w.startsWith(t)))) return 0.8;
  return allPrefix ? 0.6 : 0.3;
}
