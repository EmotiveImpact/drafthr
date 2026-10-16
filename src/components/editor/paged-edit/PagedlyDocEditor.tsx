import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  LetterEditor,
  type EditorFeatures,
  type EditorHandle,
  type LetterEditorChange,
} from "pagedly";
import "pagedly/styles.css";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { toLetterDraft } from "@/lib/letters/toLetterDraft";
import type { PageFormatState, PagedEditorActions } from "./types";

/** pagedly lays out an A4 page at 794px; below this container width it is
 *  zoomed down to fit (see the effect in the component). */
const A4_PAGE_PX = 794;
const A4_FIT_WIDTH = A4_PAGE_PX + 32;
/** Below this container width (phones) the page narrows to the screen. */
const PHONE_PAGE_MAX = 600;
const A4_RATIO = 297 / 210;

/**
 * Edit-on-page engine, backed by the vendored **pagedly** library. This is the
 * sole on-page editor (the home-grown paged.js engine it replaced has been
 * removed). It exposes the small `{ draft, readOnly?, onDone?, actionsRef? }`
 * contract (see ./types `PagedEditorActions`) so LetterPreview and the editor's
 * File/Edit/Tools menubar drive it directly. Toggling the "Page" view mounts THIS.
 *
 * SOURCE OF TRUTH stays the app store: user edits flow back per-section through
 * updateSection. The draft is mapped to pagedly's LetterDraft ONCE per mount —
 * pagedly then keeps its own live copy. That mount-once design means the store
 * can legitimately move ahead of pagedly while this is open (an AI rewrite from
 * the still-reachable AI rail, an Accept-all, a streaming generation, another
 * browser tab), so persist() is written to WRITE ONLY sections the user actually
 * changed on the page and NEVER to clobber content that moved on underneath it:
 *
 *   - baseline guard: a section whose STORE copy changed since we mounted (or
 *     since our last write) was edited elsewhere → the external edit wins, skip.
 *   - streaming guard: never fight an in-flight AI stream on a section.
 *   - app-marks guard: pagedly's sanitiser cannot round-trip the app's inline
 *     markup — comment anchors (<mark data-comment-id>), figure refs
 *     (data-fig-id) and suggestion diffs (data-suggestion-*). Editing such a
 *     section here would silently strip them, so we refuse to persist it and
 *     point the user at the Sections view (which owns comments/suggestions).
 *   - blank-artifact guard: pagedly can momentarily emit "" for a section during
 *     reflow; never blank non-empty stored content.
 *
 * (These guards replaced a naive "write every diverged section" loop that caused
 * cross-section data loss — see BUGS_AND_FIXES 2026-07-02.)
 *
 * comments + inline-AI are OFF: pagedly stores comment spans inside section HTML
 * (comments are app-owned), and the AI adapter is a separate follow-up.
 */
const FEATURES: EditorFeatures = {
  // — Inline text formatting a letter actually uses —
  bold: true,
  italic: true,
  underline: true,
  removeFormat: true,
  // — Block structure —
  headings: true,
  bulletList: true,
  numberedList: true,
  alignment: true,
  link: true,
  // — Quality-of-life behaviours (little/no toolbar footprint) —
  find: true,
  paste: true,
  // Off: counted by the app under the page (pagedly's count only updates
  // once the cursor is in the page, so it read "0 words" on arrival).
  wordCount: false,
  markdownShortcuts: true,
  smartTypography: true,
  autoLink: true,
  slashMenu: true,
  commandPalette: true,
  hyphenation: true,
  widowControl: true,
  // — Off: not appropriate for a fixed-format HR letter —
  strikethrough: false,
  superscript: false,
  subscript: false,
  inlineCode: false,
  fontColor: false,
  highlight: false,
  fontFamily: false,
  fontSize: false,
  blockquote: false,
  codeBlock: false,
  indent: false,
  lineSpacing: false,
  footnotes: "off",
  checklist: false,
  image: false,
  table: false,
  horizontalRule: false,
  pageBreak: false,
  outline: false,
  toc: false,
  sections: false,
  columns: false,
  leaders: false,
  // — Off: duplicate paths / app-owned —
  print: false,
  downloadPdf: false,
  exportDocx: false,
  importDocx: false,
  exportMarkdown: false,
  importMarkdown: false,
  trackChanges: false, // app owns the suggestion/diff review surface
  comments: false, // app-owned (spans would pollute stored section HTML)
  ai: false, // inline-AI adapter is a separate follow-up
};

/** App inline markup pagedly's sanitiser cannot round-trip. A section carrying
 *  any of these must be edited in the Sections view, not on the page. */
export function hasAppMarks(html: string): boolean {
  return /data-comment-id|data-fig-id|data-suggestion-id|<mark[\s>/]/i.test(html);
}

/** Pure decision for whether a pagedly-emitted section edit is safe to write
 *  back to the store. Extracted + exported so the guard rules are unit-tested
 *  (they are the fix for the cross-section data-loss regression). Returns one of
 *  "write" | a skip-reason. "marked" is surfaced to the user (edit in Sections). */
export type SectionWriteDecision = "write" | "noop" | "streaming" | "external" | "marked" | "blank";
export function decideSectionWrite(args: {
  incomingHtml: string;
  currentHtml: string;
  currentStatus?: string;
  baselineHtml: string | undefined;
  /** Review mode: pagedly OWNS the comment/track-change marks on the page, so a
   *  marked section is exactly what we want to persist — don't refuse it. */
  allowMarks?: boolean;
}): SectionWriteDecision {
  const { incomingHtml, currentHtml, currentStatus, baselineHtml, allowMarks } = args;
  if (currentHtml === incomingHtml) return "noop";
  if (currentStatus === "streaming") return "streaming";
  // External change since our last write (AI / other tab / Accept-all) → store wins.
  if ((baselineHtml ?? currentHtml) !== currentHtml) return "external";
  if (!allowMarks && hasAppMarks(currentHtml)) return "marked";
  if (incomingHtml === "" && currentHtml.trim() !== "") return "blank";
  return "write";
}

export function PagedlyDocEditor({
  draft,
  readOnly,
  actionsRef,
  reviewMode = false,
  suggesting = false,
  onCommentAdd,
  onCommentClick,
  toolbar = true,
}: {
  draft: Draft;
  /** Render non-editable (e.g. while a draft is locked for review). Pagination
   *  + selection still work; the content just can't be changed. */
  readOnly?: boolean;
  /** Present for contract parity with the old PagedEditor; pagedly has no
   *  in-surface "done" affordance — the parent toggle owns exit. */
  onDone?: () => void;
  actionsRef?: MutableRefObject<PagedEditorActions | null>;
  /** Review surface: turn on pagedly's native comments + track-changes so the
   *  collaboration happens ON the page. Marks are then intended, so persist
   *  writes them back (allowMarks) instead of refusing marked sections. */
  reviewMode?: boolean;
  /** Track-changes recording — reviewer edits become <ins>/<del> instead of
   *  overwriting. Only meaningful with reviewMode. */
  suggesting?: boolean;
  /** Pagedly wrapped a selection in a comment highlight (id + quoted text). */
  onCommentAdd?: (commentId: string, quotedText: string) => void;
  /** An existing comment highlight was clicked. */
  onCommentClick?: (commentId: string) => void;
  /** pagedly's own toolbar above the page. The letter editor turns it off and
   *  formats the page from its Home ribbon instead (through actionsRef). */
  toolbar?: boolean;
}) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const editorRef = useRef<EditorHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draftId = draft.id;

  // REVIEW-MODE LIVE REFRESH — pagedly maps the draft once at mount, so store
  // changes made OUTSIDE pagedly (a suggestion staged from the rail, an
  // accept/reject folding a redline in) wouldn't paint until a reload. In
  // review mode we detect those external writes (section html differing from
  // our baseline, which pagedly's own persist advances first) and remount the
  // editor with a fresh mapping, restoring the scroll position. The main
  // editor's Page view keeps the mount-once behaviour untouched.
  const [mountVersion, setMountVersion] = useState(0);
  const savedScrollRef = useRef<number | null>(null);

  // Map once per draft (or per detected external change in review mode) —
  // re-mapping on every store change would fight pagedly's internal live copy
  // and clobber in-progress edits.
  const mapped = useMemo(
    () => toLetterDraft(useDraftStore.getState().drafts[draftId] ?? draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftId, mountVersion],
  );

  // Baseline of each section's stored HTML, captured at mount and advanced after
  // each successful write. Lets persist tell "the user edited this on the page"
  // apart from "the store moved ahead underneath us" (AI stream, another tab,
  // Accept-all): in the latter case the external change wins and we skip.
  const baselineRef = useRef<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    const d = useDraftStore.getState().drafts[draftId];
    baselineRef.current = Object.fromEntries((d?.sections ?? []).map((s) => [s.id, s.html]));
  }, [draftId]);

  const markedToastShown = useRef(false);

  // Signature of the store's section HTML — the subscription that lets review
  // mode notice external writes. pagedly's OWN writes advance baselineRef
  // before this effect runs, so they never trigger a remount.
  // Gated on reviewMode so the main editor's Page view doesn't pay an
  // O(letter-html) string build + re-render on every store write.
  const sectionsSig = useDraftStore((s) => {
    if (!reviewMode) return "";
    const d = s.drafts[draftId];
    return d ? d.sections.map((x) => x.id + " " + x.html).join("") : "";
  });
  const refreshingRef = useRef(false);
  useEffect(() => {
    if (!reviewMode || refreshingRef.current) return;
    const d = useDraftStore.getState().drafts[draftId];
    if (!d) return;
    // A streaming section's html churns token-by-token — never remount for
    // those (and a stale stuck "streaming" flag must not veto refreshes for
    // the whole draft, so the check is per-section, not draft-wide).
    const changed = d.sections.some(
      (x) => x.status !== "streaming" && (baselineRef.current[x.id] ?? x.html) !== x.html,
    );
    if (!changed) return;
    // FLUSH FIRST, then advance baselines. The outgoing pagedly instance may
    // hold a debounced user edit; flushing it now makes that write land
    // against the OLD baselines, where the "external change wins -> skip"
    // guard applies to the changed sections. If we advanced baselines first,
    // the stale flush would look like a fresh page edit and overwrite the
    // just-staged / just-accepted html (data loss).
    refreshingRef.current = true;
    const editor = editorRef.current;
    void (async () => {
      try {
        await Promise.race([
          editor?.flush(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        /* a failed flush must not block the refresh */
      }
      refreshingRef.current = false;
      const fresh = useDraftStore.getState().drafts[draftId];
      if (!fresh) return;
      savedScrollRef.current = findScroller(wrapRef.current)?.scrollTop ?? null;
      baselineRef.current = Object.fromEntries(fresh.sections.map((x) => [x.id, x.html]));
      setMountVersion((v) => v + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsSig, reviewMode, draftId]);

  // After a live-refresh remount, put the scroll back where the user was.
  // Pagedly paginates asynchronously, so retry over a short window.
  useEffect(() => {
    if (mountVersion === 0 || savedScrollRef.current == null) return;
    const target = savedScrollRef.current;
    savedScrollRef.current = null;
    const timers = [60, 300, 800].map((ms) =>
      setTimeout(() => {
        const sc = findScroller(wrapRef.current);
        if (sc && Math.abs(sc.scrollTop - target) > 4) sc.scrollTop = target;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [mountVersion]);

  // The word count under the page. pagedly's own toolbar count only updates
  // once the cursor is in the page, so a letter opened without a click read
  // "0 words"; this one reads the stored letter, as the health checks do.
  const live = useDraftStore((s) => s.drafts[draftId]) ?? draft;
  const words = useMemo(() => {
    const text = live.sections
      .map((x) => (x.html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " "))
      .join("\n")
      .trim();
    return text ? text.split(/\s+/).length : 0;
  }, [live.sections]);
  const minutes = Math.max(1, Math.round(words / 200));

  // The format at the caret, for the ribbon. pagedly sets editorRef after its
  // first render (and again after a review-mode remount), so attach to its
  // state feed once the handle is there, then pass each state on.
  const formatListeners = useRef(new Set<(state: PageFormatState) => void>());
  const lastFormat = useRef<PageFormatState | null>(null);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let frame = 0;
    const push = (state: PageFormatState) => {
      lastFormat.current = state;
      formatListeners.current.forEach((l) => l(state));
    };
    const attach = () => {
      const ed = editorRef.current;
      if (!ed) {
        frame = requestAnimationFrame(attach);
        return;
      }
      push(ed.getState());
      unsub = ed.subscribe(push);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      unsub?.();
    };
  }, [mountVersion]);

  // Bridge pagedly's imperative handle to the app's PagedEditorActions contract
  // so the top menubar's Edit menu (Undo / Redo / Select all / Find) and the
  // Home ribbon's format tools keep driving whatever engine is mounted.
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      undo: () => editorRef.current?.undo(),
      redo: () => editorRef.current?.redo(),
      selectAll: () => editorRef.current?.selectAll(),
      openFind: () => editorRef.current?.openFind(),
      run: (command, value) => editorRef.current?.runCommand(command, value),
      subscribe: (listener) => {
        formatListeners.current.add(listener);
        if (lastFormat.current) listener(lastFormat.current);
        return () => {
          formatListeners.current.delete(listener);
        };
      },
    };
    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef]);

  // Flush pagedly's debounced pending edit on unmount so a fast Page→Sections
  // toggle (or navigate-away) doesn't drop the last burst of typing.
  useEffect(() => {
    return () => {
      void editorRef.current?.flush();
    };
  }, []);

  // The single write path — safe by construction (see the component doc).
  const persist = (change: LetterEditorChange) => {
    const d = useDraftStore.getState().drafts[draftId];
    if (!d) return;
    for (const [key, html] of Object.entries(change.sections)) {
      const cur = d.sections.find((s) => s.id === key || s.sectionId === key);
      if (!cur) continue; // never blind-create an unknown section
      const decision = decideSectionWrite({
        incomingHtml: html,
        currentHtml: cur.html,
        currentStatus: cur.status,
        baselineHtml: baselineRef.current[cur.id],
        allowMarks: reviewMode,
      });
      if (decision === "marked" && !markedToastShown.current) {
        // Refuse rather than silently strip comment/figure/suggestion markup —
        // point the user at the Sections view (which owns those).
        markedToastShown.current = true;
        toast("Sections with comments, figures or AI suggestions edit in the Sections view.", {
          duration: 6000,
        });
      }
      if (decision !== "write") continue;
      updateSection(d.id, cur.id, html);
      baselineRef.current[cur.id] = html;
    }
  };

  // Review surface turns on pagedly's native COMMENTS only, and only when the
  // surface is editable (a comment-write needs contentEditable + a live
  // onChange to persist the span). Track-changes is deliberately OFF: pagedly's
  // raw <ins>/<del> carry no id/author, don't surface in the rail, and are
  // stripped wholesale on export — so suggestions stay in the rail's attributed,
  // export-safe pendingChange system, the app's single suggestion path.
  // Fit the A4 page (794px) to narrow screens. Without this a phone shows
  // the page's left two thirds and cuts the rest off at the right edge.
  // Wider containers keep zoom 1, so desktop layout is untouched.
  // On a phone that would shrink the words to about 5px, so there the page
  // is narrowed to the screen instead (same proportions, smaller margins) and
  // the letter reflows at its own size (FEAT-X4).
  const [pageZoom, setPageZoom] = useState(1);
  const [phonePageW, setPhonePageW] = useState<number | null>(null);

  // pagedly names its text style menu "Heading — <value>" ("Heading —
  // Heading" when the cursor is in a paragraph). Screen readers get a plain
  // name instead, kept in step as the value changes (LETTER-X54).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fix = () => {
      el.querySelectorAll<HTMLElement>(".pagedly-toolbar__blockstyle[aria-label]").forEach((b) => {
        const now = b.getAttribute("aria-label") ?? "";
        const plain = plainStyleLabel(now);
        if (plain !== now) b.setAttribute("aria-label", plain);
      });
    };
    fix();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(fix);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const w = el.clientWidth;
      const phone = w > 0 && w < PHONE_PAGE_MAX;
      setPhonePageW(phone ? Math.floor(w - 16) : null);
      setPageZoom(!phone && w > 0 && w < A4_FIT_WIDTH ? Math.max(0.4, (w - 16) / A4_PAGE_PX) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const enableComments = reviewMode && !readOnly;
  const features = enableComments ? { ...FEATURES, comments: true } : FEATURES;
  void suggesting; // reserved; app owns suggestions in the rail (see above)

  return (
    <div
      ref={wrapRef}
      data-phone-page={phonePageW ? "" : undefined}
      className="flex min-h-full flex-col [&_.pagedly-ce-footer]:[zoom:var(--dhr-page-zoom,1)] [&_.pagedly-ce-page]:[zoom:var(--dhr-page-zoom,1)] [&_.pagedly-toolbar__wordcount]:text-[var(--ds-muted)] [&_.pagedly-toolbar__wordcount-sep]:opacity-100"
      // The letter on the page is set in the workspace serif (Newsreader),
      // the page chrome in the UI sans (Inter).
      style={
        {
          "--dhr-page-zoom": pageZoom,
          // Read by the [data-phone-page] rule in globals.css, which wins
          // over the A4 size pagedly sets on its own root.
          ...(phonePageW
            ? {
                "--dhr-phone-page-w": `${phonePageW}px`,
                "--dhr-phone-page-h": `${Math.round(phonePageW * A4_RATIO)}px`,
              }
            : {}),
          "--pagedly-font-family": "var(--font-serif)",
          "--pagedly-line-height": "1.5",
          "--pagedly-ui-font": "var(--font-sans)",
          // Toolbar meta text (word count, its separators) in the workspace
          // grey that reads at AA, not pagedly's light default.
          "--pagedly-text-faint": "var(--ds-muted)",
          "--pagedly-muted": "var(--ds-muted)",
          "--pagedly-text-soft": "var(--ds-muted)",
        } as CSSProperties
      }
    >
      <LetterEditor
        key={`${draftId}:${mountVersion}`}
        draft={mapped}
        editorRef={editorRef}
        readOnly={readOnly}
        onCommentAdd={enableComments ? onCommentAdd : undefined}
        onCommentClick={reviewMode ? onCommentClick : undefined}
        toolbar={toolbar}
        // Stationary: the toolbar sits above the page instead of floating
        // over the letter text as it scrolls.
        toolbarPosition="stationary"
        toolbarLayout="compact"
        features={features}
        showPageNumbers
        pageSize="A4"
        // No write-back when read-only (review-locked): guarantees the surface
        // can never mutate the store even if pagedly emits an initial change.
        onChange={readOnly ? undefined : persist}
        className="flex-1"
        canvasClassName="bg-[var(--ds-canvas)]"
      />
      <div
        className="sticky bottom-0 z-10 flex h-8 shrink-0 items-center justify-end gap-1.5 border-t border-[var(--ds-line-2)] bg-[var(--ds-surface)] px-4 text-[12px] text-[var(--ds-muted)]"
        role="status"
        aria-live="off"
        data-testid="page-word-count"
      >
        <span>{words.toLocaleString("en-GB")} {words === 1 ? "word" : "words"}</span>
        <span aria-hidden>·</span>
        <span>{minutes} min read</span>
      </div>
    </div>
  );
}

/** First scrollable descendant — pagedly's internal canvas scroller. Used to
 *  save/restore the reading position across a live-refresh remount. */
function findScroller(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (el.scrollHeight > el.clientHeight + 20) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return el;
    }
  }
  return null;
}

/**
 * The text style menu's accessible name: "Text style" in a paragraph,
 * "Text style: Heading 1" in a heading. Turns pagedly's "<menu> — <value>"
 * (which reads "Heading — Heading" in a paragraph) into that; any other
 * label is returned as it is.
 */
export function plainStyleLabel(label: string): string {
  const m = /^(.+?)\s+\u2014\s+(.+)$/.exec(label.trim());
  if (!m) return label;
  const [, menu, value] = m;
  return menu.trim() === value.trim() ? "Text style" : `Text style: ${value.trim()}`;
}
