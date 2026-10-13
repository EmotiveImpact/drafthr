import type { Draft, PendingChange, Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { useDraftStore } from "@/lib/store";

/**
 * One suggested edit as the letter workspace shows it: a margin card beside
 * its paragraph and a card in the Edits tab. Built from the same data the
 * journey counts (src/lib/journey/stage.ts pendingSuggestionGroups):
 *
 *   section   a section proposal (pendingChange). Inline proposals also left
 *             <ins>/<del> marks in the text; card proposals did not.
 *   marks     loose pending marks from one author at one time, with no
 *             section proposal behind them (a reviewer's tracked changes).
 */
export type SuggestedEdit = {
  key: string;
  kind: "section" | "marks";
  section: Section;
  /** Mark ids on the page (empty for a card-mode proposal). */
  ids: string[];
  author: string;
  authorId?: string;
  /** DraftHR, not a person. */
  ai: boolean;
  createdAt: number;
  /** Why: the instruction or the reviewer's note. */
  note?: string;
  pending?: PendingChange;
};

const AI_AUTHOR = /claude|draft\s?hr|^ai$|^$/i;

export function isAiAuthor(name: string | undefined): boolean {
  return AI_AUTHOR.test((name ?? "").trim());
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? decode(m[1]) : undefined;
}

function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Every suggested edit waiting for a decision, in document order. */
export function suggestedEdits(draft: Draft): SuggestedEdit[] {
  const out: SuggestedEdit[] = [];
  for (const section of draft.sections ?? []) {
    const html = section.html ?? "";
    const tags = (html.match(/<(ins|del)\b[^>]*>/gi) ?? []).filter((t) => /data-status\s*=\s*"pending"/i.test(t));
    const p = section.pendingChange;
    if (p) {
      const ids = (p.diffViewMode ?? "inline") === "inline"
        ? [...new Set(tags.map((t) => attr(t, "data-suggestion-id")).filter(Boolean) as string[])]
        : [];
      out.push({
        key: `sec:${section.id}`,
        kind: "section",
        section,
        ids,
        author: p.authorName ?? "DraftHR",
        authorId: p.authorId,
        ai: !p.authorName || isAiAuthor(p.authorName),
        createdAt: p.createdAt,
        note: p.instruction && p.instruction !== "Suggested edit" && p.instruction !== "AI regenerate" ? p.instruction : undefined,
        pending: p,
      });
      continue;
    }
    const groups = new Map<string, SuggestedEdit>();
    for (const tag of tags) {
      const id = attr(tag, "data-suggestion-id");
      if (!id) continue;
      const author = attr(tag, "data-author") ?? "";
      const at = attr(tag, "data-created-at") ?? "";
      const key = at ? `${author}|${at}` : `id|${id}`;
      const g =
        groups.get(key) ??
        ({
          key: `marks:${section.id}:${key}`,
          kind: "marks",
          section,
          ids: [],
          author: isAiAuthor(author) ? "DraftHR" : author,
          authorId: attr(tag, "data-author-id"),
          ai: isAiAuthor(author),
          createdAt: Number(at) || 0,
          note: attr(tag, "data-body") || undefined,
        } satisfies SuggestedEdit);
      if (!g.ids.includes(id)) g.ids.push(id);
      groups.set(key, g);
    }
    out.push(...groups.values());
  }
  return out;
}

/**
 * Resolve a group of loose marks in one section: accept folds the inserted
 * words in and drops the struck ones; reject does the opposite. Returns the
 * new html (or the same html when nothing matched).
 */
export function resolveMarksHtml(html: string, ids: string[], accept: boolean): string {
  if (typeof window === "undefined" || !html || ids.length === 0) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  const want = new Set(ids);
  let touched = false;
  root.querySelectorAll<HTMLElement>("ins[data-suggestion-id], del[data-suggestion-id]").forEach((el) => {
    const id = el.getAttribute("data-suggestion-id") ?? "";
    if (!want.has(id)) return;
    touched = true;
    const keep = el.tagName === "INS" ? accept : !accept;
    if (keep) el.replaceWith(...Array.from(el.childNodes));
    else el.remove();
  });
  return touched ? sanitizeLetterHtml(root.innerHTML) : html;
}

/**
 * Decide one suggested edit for real: a section proposal goes through the
 * store's accept or reject (which versions the old text); loose marks are
 * folded in or dropped in place and the section saved.
 */
export function decideEdit(draftId: string, edit: SuggestedEdit, accept: boolean): void {
  const store = useDraftStore.getState();
  if (edit.kind === "section") {
    if (accept) store.acceptSectionPending(draftId, edit.section.id);
    else store.rejectSectionPending(draftId, edit.section.id);
    recordDecision(draftId, [edit], accept);
    return;
  }
  const live = store.drafts[draftId]?.sections.find((s) => s.id === edit.section.id);
  if (!live) return;
  const next = resolveMarksHtml(live.html, edit.ids, accept);
  if (next === live.html) return;
  if (accept) {
    store.pushSectionVersion(draftId, live.id, { id: `ver_${Date.now()}`, createdAt: Date.now(), html: live.html });
  }
  store.updateSection(draftId, live.id, next);
  recordDecision(draftId, [edit], accept);
}

/**
 * Keep a record of each decision on a suggested edit in the letter's
 * timeline (who suggested it, which marks, accepted or kept as it was), so
 * the Approve step can say "You accepted 2 changes, kept 1".
 */
export function recordDecision(draftId: string, edits: SuggestedEdit[], accept: boolean): void {
  const store = useDraftStore.getState();
  for (const edit of edits) {
    store.recordTimelineEvent(draftId, {
      kind: "sections_updated",
      title: accept ? "Accepted a suggested edit" : "Kept the original wording",
      sectionId: edit.section.id,
      sectionTitle: edit.section.title,
      actorName: undefined,
      meta: {
        decision: accept ? "accepted" : "rejected",
        suggestedBy: edit.ai ? "DraftHR" : edit.author,
        suggestionIds: [edit.pending?.id, ...edit.ids].filter(Boolean).join(","),
      },
    });
  }
}

/** Decisions recorded on suggested edits by one person (or ids). */
export function decisionsFor(draft: Draft, author: string, ids: Set<string>): { accepted: number; rejected: number } {
  let accepted = 0;
  let rejected = 0;
  const who = author.trim().toLowerCase();
  for (const t of draft.timeline ?? []) {
    const decision = t.meta?.decision;
    if (t.kind !== "sections_updated" || (decision !== "accepted" && decision !== "rejected")) continue;
    const by = String(t.meta?.suggestedBy ?? "").trim().toLowerCase();
    const tIds = String(t.meta?.suggestionIds ?? "").split(",").filter(Boolean);
    if ((who && by === who) || tIds.some((id) => ids.has(id))) {
      if (decision === "accepted") accepted += 1;
      else rejected += 1;
    }
  }
  return { accepted, rejected };
}

/** The person prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

let settleStyle: HTMLStyleElement | null = null;
function settleSheet(): HTMLStyleElement {
  if (!settleStyle || !settleStyle.isConnected) {
    settleStyle = document.createElement("style");
    settleStyle.setAttribute("data-lw-settle", "");
    document.head.appendChild(settleStyle);
  }
  return settleStyle;
}

const cssId = (id: string) => id.replace(/["\\]/g, "");

/**
 * Accept with the felt motion (letter-live step 1): the struck words fade
 * out, the new words settle from green or lilac to ink, the paragraph bar
 * fades; then the change is applied. Instant with reduced motion.
 */
export function acceptWithSettle(draftId: string, edit: SuggestedEdit, onApplied?: () => void): void {
  if (prefersReducedMotion() || edit.ids.length === 0) {
    decideEdit(draftId, edit, true);
    onApplied?.();
    return;
  }
  const sheet = settleSheet();
  const rules = edit.ids
    .map((raw) => {
      const id = cssId(raw);
      return [
        `.lw-paper del[data-suggestion-id="${id}"]{opacity:0 !important}`,
        `.lw-paper ins[data-suggestion-id="${id}"]{background-color:transparent !important;color:inherit !important;border-bottom-color:transparent !important}`,
        `.lw-paper .ProseMirror :is(p,li,h2,h3):has(> [data-suggestion-id="${id}"])::before{opacity:0 !important}`,
      ].join("\n");
    })
    .join("\n");
  const marker = `/*${edit.key}*/`;
  sheet.textContent = `${sheet.textContent ?? ""}\n${marker}\n${rules}`;
  window.setTimeout(() => {
    decideEdit(draftId, edit, true);
    onApplied?.();
    // Drop the rules once the new text has replaced the marks.
    window.setTimeout(() => {
      const t = sheet.textContent ?? "";
      const i = t.indexOf(marker);
      if (i >= 0) sheet.textContent = t.slice(0, i) + t.slice(i + marker.length + 1 + rules.length);
    }, 200);
  }, 760);
}
