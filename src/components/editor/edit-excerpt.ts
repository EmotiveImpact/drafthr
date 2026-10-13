import { sanitizeLetterHtml } from "@/lib/sanitize";

/** One run of a suggested edit as the Edits card shows it. */
export type ExcerptPart = { kind: "text" | "del" | "ins"; text: string };

const BLOCK = "p,li,h1,h2,h3,h4,h5,h6,blockquote,div,td,th";
/** Words of the letter kept either side of the change. */
const CONTEXT_WORDS = 6;
/** Unchanged words between two changes before the middle is shortened. */
const GAP_WORDS = 10;

/**
 * The words around a suggested edit, read as a sentence: the changed runs
 * (struck and inserted) with the unchanged words between them and a few
 * words either side, so "telling / calling the start of / , as the absence
 * procedure requires" reads "…without ~~telling~~ calling your manager
 * before the start of your shift, as the absence procedure requires." Other
 * suggestions in the paragraph show as the current text (their deletions as
 * plain words, their insertions left out).
 */
export function editExcerpt(html: string, ids: string[]): ExcerptPart[] {
  if (typeof document === "undefined" || ids.length === 0) return [];
  const root = document.createElement("div");
  root.innerHTML = sanitizeLetterHtml(html ?? "");
  const want = new Set(ids);
  const raw: ExcerptPart[] = [];
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    if (!text) continue;
    const parent = n.parentElement;
    const block = parent?.closest(BLOCK) ?? null;
    if (lastBlock && block !== lastBlock) push(raw, "text", " ");
    lastBlock = block;
    const mark = parent?.closest("ins[data-suggestion-id], del[data-suggestion-id]");
    if (mark) {
      const id = mark.getAttribute("data-suggestion-id") ?? "";
      const isDel = mark.tagName === "DEL";
      if (want.has(id)) push(raw, isDel ? "del" : "ins", text);
      else if (isDel) push(raw, "text", text);
      // Someone else's insertion is not in the text yet: leave it out.
      continue;
    }
    push(raw, "text", text);
  }
  const parts = raw.map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ") }));
  const first = parts.findIndex((p) => p.kind !== "text");
  if (first < 0) return [];
  let last = first;
  parts.forEach((p, i) => {
    if (p.kind !== "text") last = i;
  });
  const out: ExcerptPart[] = [];
  const before = parts.slice(0, first).map((p) => p.text).join("");
  const lead = tailWords(before, CONTEXT_WORDS);
  if (lead) out.push({ kind: "text", text: lead });
  for (let i = first; i <= last; i += 1) {
    const p = parts[i];
    if (p.kind === "text") out.push({ kind: "text", text: shortenGap(p.text) });
    else out.push(p);
  }
  const after = parts.slice(last + 1).map((p) => p.text).join("");
  const trail = headWords(after, CONTEXT_WORDS);
  if (trail) out.push({ kind: "text", text: trail });
  return out.filter((p) => p.text.length > 0);
}

function push(list: ExcerptPart[], kind: ExcerptPart["kind"], text: string) {
  const prev = list[list.length - 1];
  if (prev && prev.kind === kind) prev.text += text;
  else list.push({ kind, text });
}

/** The last few words before the change, from the sentence start when it is near. */
function tailWords(s: string, n: number): string {
  if (!s.trim()) return "";
  const sentence = s.split(/(?<=[.!?])\s+/).pop() ?? s;
  const words = sentence.split(/(\s+)/);
  // words alternates word, space; keep the trailing space so the change joins cleanly.
  const real = words.filter((w) => w.trim()).length;
  if (real <= n) return sentence.replace(/^\s+/, "");
  const kept: string[] = [];
  let count = 0;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (words[i].trim()) count += 1;
    if (count > n) break;
    kept.unshift(words[i]);
  }
  return `…${kept.join("").replace(/^\s+/, "")}`;
}

/** The first few words after the change, to the sentence end when it is near. */
function headWords(s: string, n: number): string {
  if (!s.trim()) return "";
  const end = s.search(/[.!?](\s|$)/);
  const sentence = end >= 0 ? s.slice(0, end + 1) : s;
  const words = sentence.split(/(\s+)/);
  const real = words.filter((w) => w.trim()).length;
  if (real <= n) return sentence.replace(/\s+$/, "");
  const kept: string[] = [];
  let count = 0;
  for (const w of words) {
    if (w.trim()) count += 1;
    if (count > n) break;
    kept.push(w);
  }
  return `${kept.join("").replace(/\s+$/, "")}…`;
}

/** Unchanged words between two changes, shortened in the middle when long. */
function shortenGap(s: string): string {
  const words = s.trim().split(/\s+/);
  if (words.length <= GAP_WORDS) return s;
  const lead = /^\s/.test(s) ? " " : "";
  const trail = /\s$/.test(s) ? " " : "";
  const half = Math.floor(GAP_WORDS / 2);
  return `${lead}${words.slice(0, half).join(" ")} … ${words.slice(-half).join(" ")}${trail}`;
}
