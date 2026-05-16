import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";

import { toast } from "sonner";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import {
  isAllowedEmbeddedImageFile,
  isSafeImageDataUrl,
  SAFE_IMAGE_ACCEPT,
} from "@/lib/safe-data-url";

import {
  PAGE_CONTENT_HEIGHT_PX,
  PAGE_CONTENT_WIDTH_PX,
  PAGE_WIDTH_PX,
  applyResponsivePageScale,
  observeResponsivePageScale,
  pagedPreviewStylesheet,
} from "./printCss";
import { buildPreviewSourceHtml, signatureImageHtml } from "./sourceHtml";

/**
 * Edit-on-page that IS paged.js. Each rendered .pagedjs_page card is
 * the user's edit surface — they type directly into the same A4 cards
 * Preview shows, with real whitespace between pages. No fake overlay
 * strips, no continuous scrolling card. The on-screen letter and the
 * printed letter are the same DOM.
 *
 * The hard part: paged.js mutates its DOM during a flow. Live TipTap
 * can't survive that, which is why earlier iterations punted to a
 * single continuous editor. Here we take a different deal: TipTap is
 * gone, the source of truth is plain HTML in state, and we re-flow on
 * a typing-idle debounce. Cursor is captured before each re-flow
 * (against a stable data-paged-ref + char offset) and restored after.
 *
 * Tradeoffs the user explicitly accepted picking this approach:
 *   - Cursor jumps briefly during re-pagination (~60-150 ms of layout)
 *   - Overflow text spills past the page bottom until re-flow lands
 *   - No collaborative cursor; undo/redo is local to this editor session
 *
 * Tradeoffs avoided:
 *   - No fake "page-break" overlays — page breaks are real DOM
 *   - No drift between editor and print render — they share CSS, paged.js
 *   - No two-tree-sync problem
 */

const REPAGINATE_DELAY_MS = 600;
const PAGE_WIDTH_FALLBACK_PX = PAGE_WIDTH_PX;
const OVERSIZED_BLOCK_MAX_HEIGHT_PX = PAGE_CONTENT_HEIGHT_PX - 24;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type CursorState = {
  start: CursorPoint;
  end: CursorPoint;
};

type CursorPoint = {
  /** data-paged-ref of the source block the caret is inside. */
  ref: string;
  /** Logical offset from the start of that block. Text chars count normally; <br>/<img>/<hr> count as one. */
  offset: number;
};

type ToolbarFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  block: string;
  align: "left" | "center" | "right" | "justify" | "";
};

type PreviewerInstance = {
  preview: (
    content: string | HTMLElement,
    stylesheets: Array<string | Record<string, string>>,
    renderTo: HTMLElement,
  ) => Promise<{ total?: number | null }>;
  chunker?: {
    stop?: () => void;
    destroy?: () => void;
  };
  polisher?: {
    destroy?: () => void;
  };
};

/**
 * Imperative handle exposed to the parent (the Editor route) so the
 * top File/Edit/Tools menubar can call into the active editor. Kept
 * deliberately small — only the actions the Edit menu surfaces.
 */
export type PagedEditorActions = {
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  openFind: () => void;
};

export function PagedEditor({
  draft,
  onDone,
  actionsRef,
}: {
  draft: Draft;
  onDone: () => void;
  /** Optional handle the parent uses to drive the editor from the
   * top menubar (Edit → Undo / Redo / Select all / Find). */
  actionsRef?: MutableRefObject<PagedEditorActions | null>;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  /** The HTML truth — kept current via reconstructSourceHtml() on every save. */
  const sourceHtmlRef = useRef<string>(buildMergedSourceHtml(draft));
  /** Monotonic token to drop stale paginations when typing fires fast. */
  const flowTokenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const activePreviewerRef = useRef<PreviewerInstance | null>(null);
  const mountedRef = useRef(false);
  const composingRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const savedSelectionRef = useRef<Range | null>(null);
  // Tracks dirty state across renders so we can fire a "Saved" toast
  // only on the dirty → clean transition (i.e. a flush actually
  // completed). Without this we'd toast on the initial render too.
  const wasDirtyRef = useRef(false);

  const [, setBusy] = useState(true);
  const [, setPageCount] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [formatState, setFormatState] = useState<ToolbarFormatState>({
    bold: false,
    italic: false,
    underline: false,
    unorderedList: false,
    orderedList: false,
    block: "p",
    align: "",
  });

  /* Find-in-letter state. Match locations are stored as Range objects
   * keyed against the live DOM; we register them with the CSS Custom
   * Highlight API so highlights never touch contenteditable content
   * (mutating the DOM would round-trip into the saved source). */
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findIndex, setFindIndex] = useState(0);
  /** Bumped on every successful repaginate so the find effect re-scans
   * fresh text nodes — paged.js replaces them on each flow. */
  const [renderToken, setRenderToken] = useState(0);
  const findBarInputRef = useRef<HTMLInputElement>(null);
  const findHighlightRef = useRef<Highlight | null>(null);
  const findActiveHighlightRef = useRef<Highlight | null>(null);

  const refreshHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResponsivePageScale(container);
  }, []);

  const clearPendingDebounce = useCallback(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const rememberSelection = useCallback(() => {
    const container = containerRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.rangeCount === 0 || !selectionInsideLetterBody(container)) {
      return;
    }
    savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const restoreRememberedSelection = useCallback(() => {
    const container = containerRef.current;
    const range = savedSelectionRef.current;
    if (!container || !range || !container.contains(range.commonAncestorContainer)) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const refreshFormatState = useCallback(() => {
    const container = containerRef.current;
    if (!container || !selectionInsideLetterBody(container)) {
      setFormatState((current) => ({
        ...current,
        bold: false,
        italic: false,
        underline: false,
        unorderedList: false,
        orderedList: false,
        align: "",
      }));
      return;
    }

    const block = normalizeFormatBlock(queryCommandValue("formatBlock")) || "p";
    const align: ToolbarFormatState["align"] = queryCommandState("justifyCenter")
      ? "center"
      : queryCommandState("justifyRight")
      ? "right"
      : queryCommandState("justifyFull")
      ? "justify"
      : queryCommandState("justifyLeft")
      ? "left"
      : "";
    setFormatState({
      bold: queryCommandState("bold"),
      italic: queryCommandState("italic"),
      underline: queryCommandState("underline"),
      unorderedList: queryCommandState("insertUnorderedList"),
      orderedList: queryCommandState("insertOrderedList"),
      block,
      align,
    });
  }, []);

  const commitSource = useCallback((nextSource: string, pushHistory = true) => {
    const previous = sourceHtmlRef.current;
    const normalized = normalizeOversizedSourceHtml(
      normalizeSourceHtml(nextSource, draft, previous),
    );
    if (normalized !== previous && pushHistory) {
      undoStackRef.current.push(previous);
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      redoStackRef.current = [];
    }
    sourceHtmlRef.current = normalized;
    saveToStore(normalized, draft, updateSection);
    setDirty(false);
    refreshHistoryState();
    return normalized !== previous;
  }, [draft, refreshHistoryState, updateSection]);

  /* ------------------------------------------------------------------------
   * Render pipeline — paginate sourceHtmlRef into the container.
   * ----------------------------------------------------------------------*/
  const repaginate = useCallback(async (cursor: CursorState | null) => {
    const container = containerRef.current;
    if (!container) return;
    const token = ++flowTokenRef.current;
    let previewer: PreviewerInstance | null = null;
    let staging: HTMLElement | null = null;

    const scrollEl = findScrollAncestor(container);
    const scrollTop = scrollEl?.scrollTop ?? 0;

    setBusy(true);
    setError(null);
    try {
      const { Previewer } = await import("pagedjs");
      if (token !== flowTokenRef.current || !mountedRef.current) return;

      // Stamp data-paged-ref on visible blocks before passing to paged.js
      // so we can match source positions in the rendered clones after.
      sourceHtmlRef.current = normalizeOversizedSourceHtml(sourceHtmlRef.current);
      const stamped = stampPagedRefs(sourceHtmlRef.current);
      const full = buildPreviewSourceHtml(draft, { letterBodyHtml: stamped });

      staging = createPaginationStagingHost(container);
      previewer = new Previewer() as PreviewerInstance;
      const flow = await previewer.preview(full, [pagedPreviewStylesheet()], staging);
      if (
        token !== flowTokenRef.current ||
        !mountedRef.current ||
        container !== containerRef.current
      ) {
        destroyPreviewer(previewer);
        staging.remove();
        return;
      }

      destroyPreviewer(activePreviewerRef.current);
      activePreviewerRef.current = previewer;
      container.replaceChildren(...Array.from(staging.childNodes));
      staging.remove();
      applyResponsivePageScale(container);

      setPageCount(flow.total ?? null);

      // Keep page content overflow visible while typing ahead of the next
      // reflow, but only make the actual letter body editable. If the whole
      // page content is editable, users can type into paged.js margin/chrome
      // and that text has no section anchor to save back to.
      const pageContents =
        container.querySelectorAll<HTMLElement>(".pagedjs_page_content");
      for (const pc of pageContents) {
        pc.contentEditable = "false";
        pc.style.overflow = "visible";
      }
      for (const body of findRenderedSourceRoots(container)) {
        body.contentEditable = "true";
        body.spellcheck = true;
        body.tabIndex = 0;
        body.setAttribute("role", "textbox");
        body.setAttribute("aria-multiline", "true");
        body.style.outline = "none";
        body.style.overflow = "visible";
      }
      for (const anchor of container.querySelectorAll<HTMLElement>("[data-section-anchor]")) {
        anchor.contentEditable = "false";
        anchor.setAttribute("aria-hidden", "true");
      }
      for (const chrome of container.querySelectorAll<HTMLElement>(
        ".letterhead, .attachments-section, .figures-section, .letter-disclaimer, .letter-rule, [data-generated-letter-chrome]",
      )) {
        chrome.contentEditable = "false";
        chrome.setAttribute("aria-readonly", "true");
      }

      // Restore caret + scroll *after* contentEditable is set, otherwise
      // some browsers reject the selection on read-only nodes.
      if (cursor) {
        restoreCursor(container, cursor);
        rememberSelection();
        refreshFormatState();
      }
      if (scrollEl) scrollEl.scrollTop = scrollTop;
      setBusy(false);
      // Bump renderToken so the Find effect re-scans the freshly
      // replaced text nodes — Ranges that pointed at the old DOM
      // are dead after replaceChildren().
      setRenderToken((token) => token + 1);
    } catch (err) {
      if (previewer) destroyPreviewer(previewer);
      staging?.remove();
      if (token === flowTokenRef.current && mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to paginate");
        setBusy(false);
      }
    }
  }, [draft, refreshFormatState, rememberSelection]);

  /* ------------------------------------------------------------------------
   * Lifecycle — initial paginate + cleanup.
   * ----------------------------------------------------------------------*/
  useEffect(() => {
    mountedRef.current = true;
    sourceHtmlRef.current = buildMergedSourceHtml(draft);
    undoStackRef.current = [];
    redoStackRef.current = [];
    refreshHistoryState();
    void repaginate(null);
    return () => {
      // Invalidate any in-flight pagination so it can't setState after unmount.
      mountedRef.current = false;
      flowTokenRef.current++;
      clearPendingDebounce();
      destroyPreviewer(activePreviewerRef.current);
      activePreviewerRef.current = null;
    };
    // We want one paginate per draft.id — rebuilding on every render would
    // wipe the user's keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  useEffect(() => {
    const onSelectionChange = () => {
      rememberSelection();
      refreshFormatState();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [refreshFormatState, rememberSelection]);

  /* ------------------------------------------------------------------------
   * Input handler — debounce + reconstruct source + save + re-paginate.
   * ----------------------------------------------------------------------*/
  const flushPendingEdit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    normalizeRenderedPagedRefs(container);
    const cursor = captureCursor(container);
    commitSource(reconstructSourceHtml(container));
    void repaginate(cursor);
  }, [commitSource, draft, repaginate]);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      flushPendingEdit();
    }, REPAGINATE_DELAY_MS);
  }, [flushPendingEdit]);

  const afterToolbarMutation = useCallback(() => {
    setDirty(true);
    refreshFormatState();
    scheduleFlush();
  }, [refreshFormatState, scheduleFlush]);

  const runNativeCommand = useCallback((command: string, value?: string) => {
    const container = containerRef.current;
    if (!container) return;
    restoreRememberedSelection();
    if (!selectionInsideLetterBody(container)) return;
    focusSelectionLetterBody(container);
    runEditorCommand(command, value);
    rememberSelection();
    afterToolbarMutation();
  }, [afterToolbarMutation, rememberSelection, restoreRememberedSelection]);

  const toggleBlock = useCallback((block: "h2" | "h3") => {
    const next = formatState.block === block ? "p" : block;
    runNativeCommand("formatBlock", next);
  }, [formatState.block, runNativeCommand]);


  const onImageChosen = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAllowedEmbeddedImageFile(file)) {
      window.alert("Please use a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      window.alert("Image larger than 5 MB — use the Evidence step for full-quality originals.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (!isSafeImageDataUrl(src)) return;
      restoreRememberedSelection();
      insertHtmlAtCurrentSelection(
        containerRef.current,
        `<img src="${escAttr(src)}" alt="${escAttr(file.name)}" />`,
      );
      rememberSelection();
      afterToolbarMutation();
    };
    reader.readAsDataURL(file);
  }, [afterToolbarMutation, rememberSelection, restoreRememberedSelection]);

  const onInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    rememberSelection();
    setDirty(true);
    if (composingRef.current || isComposingInput(event.nativeEvent)) return;
    scheduleFlush();
  }, [rememberSelection, scheduleFlush]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    setDirty(true);
    scheduleFlush();
  }, [scheduleFlush]);

  const onPaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const safeHtml = html
      ? sanitizePastedHtml(html)
      : escHtml(text).replace(/\r\n|\r|\n/g, "<br>");

    insertHtmlAtCurrentSelection(containerRef.current, safeHtml);
    rememberSelection();
    setDirty(true);
    scheduleFlush();
  }, [rememberSelection, scheduleFlush]);

  const handleUndo = useCallback(() => {
    clearPendingDebounce();
    const container = containerRef.current;
    let cursor: CursorState | null = null;
    let liveSource = sourceHtmlRef.current;
    let hasUnsavedDom = false;
    if (container) {
      normalizeRenderedPagedRefs(container);
      cursor = captureCursor(container);
      if (dirty) {
        liveSource = normalizeSourceHtml(reconstructSourceHtml(container), draft, sourceHtmlRef.current);
        hasUnsavedDom = liveSource !== sourceHtmlRef.current;
      }
    }

    let target: string | undefined;
    if (hasUnsavedDom) {
      target = sourceHtmlRef.current;
      redoStackRef.current.push(liveSource);
    } else {
      target = undoStackRef.current.pop();
      if (!target) {
        refreshHistoryState();
        return;
      }
      redoStackRef.current.push(sourceHtmlRef.current);
    }

    commitSource(target, false);
    void repaginate(cursor);
  }, [clearPendingDebounce, commitSource, dirty, draft, refreshHistoryState, repaginate]);

  const handleRedo = useCallback(() => {
    if (dirty) return;
    clearPendingDebounce();
    const container = containerRef.current;
    const cursor = container ? captureCursor(container) : null;
    const target = redoStackRef.current.pop();
    if (!target) {
      refreshHistoryState();
      return;
    }
    undoStackRef.current.push(sourceHtmlRef.current);
    commitSource(target, false);
    void repaginate(cursor);
  }, [clearPendingDebounce, commitSource, dirty, refreshHistoryState, repaginate]);

  /* ----------------------------------------------------------------------
   * Find-in-letter — runs against the live rendered DOM via the CSS
   * Custom Highlight API. Open with Cmd-F, navigate matches with
   * Enter / Shift-Enter, close with Esc.
   * --------------------------------------------------------------------*/
  const openFind = useCallback(() => {
    rememberSelection();
    setFindOpen(true);
    // Defer focus until the input has rendered.
    window.setTimeout(() => {
      findBarInputRef.current?.focus();
      findBarInputRef.current?.select();
    }, 0);
  }, [rememberSelection]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindMatchCount(0);
    setFindIndex(0);
    findHighlightRef.current?.clear();
    findActiveHighlightRef.current?.clear();
    restoreRememberedSelection();
  }, [restoreRememberedSelection]);

  // Register the two highlight buckets once. Browsers that lack the
  // Custom Highlight API (Safari < 17.2 / very old Chrome) just won't
  // see highlights — the bar still works, navigation still scrolls.
  useEffect(() => {
    const hl = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
    if (!hl) return;
    const style = document.createElement("style");
    style.textContent = `
      ::highlight(drafthr-find) {
        background-color: rgba(250, 204, 21, 0.35);
      }
      ::highlight(drafthr-find-active) {
        background-color: rgba(250, 204, 21, 0.85);
        color: #0f172a;
      }
    `;
    document.head.appendChild(style);
    const all = new Highlight();
    const active = new Highlight();
    findHighlightRef.current = all;
    findActiveHighlightRef.current = active;
    hl.set("drafthr-find", all);
    hl.set("drafthr-find-active", active);
    return () => {
      hl.delete("drafthr-find");
      hl.delete("drafthr-find-active");
      findHighlightRef.current = null;
      findActiveHighlightRef.current = null;
      style.remove();
    };
  }, []);

  // Recompute matches on query / open / renderToken change.
  useEffect(() => {
    if (!findOpen) return;
    const container = containerRef.current;
    const all = findHighlightRef.current;
    const active = findActiveHighlightRef.current;
    all?.clear();
    active?.clear();
    if (!findQuery || !container) {
      setFindMatchCount(0);
      setFindIndex(0);
      return;
    }
    const matches = findAllMatches(container, findQuery);
    if (all) for (const r of matches) all.add(r);
    setFindMatchCount(matches.length);
    setFindIndex((current) => {
      if (matches.length === 0) return 0;
      return Math.min(current, matches.length - 1);
    });
  }, [findOpen, findQuery, renderToken]);

  // When the active index moves, refresh the focused highlight + scroll.
  useEffect(() => {
    if (!findOpen) return;
    const container = containerRef.current;
    if (!container) return;
    const active = findActiveHighlightRef.current;
    active?.clear();
    if (findMatchCount === 0) return;
    const matches = findAllMatches(container, findQuery);
    const target = matches[findIndex];
    if (!target) return;
    if (active) active.add(target);
    const parent = target.startContainer.parentElement;
    parent?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [findIndex, findMatchCount, findQuery, findOpen, renderToken]);

  const nextMatch = useCallback(() => {
    setFindIndex((i) => (findMatchCount === 0 ? 0 : (i + 1) % findMatchCount));
  }, [findMatchCount]);
  const prevMatch = useCallback(() => {
    setFindIndex((i) => (findMatchCount === 0 ? 0 : (i - 1 + findMatchCount) % findMatchCount));
  }, [findMatchCount]);

  const selectAll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const body = container.querySelector<HTMLElement>(
      '.letter-body[contenteditable="true"]',
    );
    if (!body) return;
    body.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(body);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    rememberSelection();
  }, [rememberSelection]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && findOpen) {
      event.preventDefault();
      closeFind();
      return;
    }
    const key = event.key.toLowerCase();
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    } else if (key === "y") {
      event.preventDefault();
      handleRedo();
    } else if (key === "f") {
      event.preventDefault();
      openFind();
    } else if (key === "a") {
      // Only intercept Cmd-A when the selection is already inside the
      // editor — letting Cmd-A elsewhere on the page fall through to
      // the browser's default Select All is the right behaviour.
      if (containerRef.current && selectionInsideLetterBody(containerRef.current)) {
        event.preventDefault();
        selectAll();
      }
    }
  }, [closeFind, findOpen, handleRedo, handleUndo, openFind, selectAll]);

  // Publish the imperative handle for the parent menubar to call.
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      undo: handleUndo,
      redo: handleRedo,
      selectAll,
      openFind,
    };
    return () => {
      if (actionsRef.current && actionsRef.current.undo === handleUndo) {
        actionsRef.current = null;
      }
    };
  }, [actionsRef, handleUndo, handleRedo, selectAll, openFind]);

  /* ------------------------------------------------------------------------
   * Done — flush pending edit, save, hand back to parent.
   * ----------------------------------------------------------------------*/
  const handleDone = useCallback(() => {
    clearPendingDebounce();
    const container = containerRef.current;
    if (container) {
      normalizeRenderedPagedRefs(container);
      commitSource(reconstructSourceHtml(container));
    }
    onDone();
  }, [clearPendingDebounce, commitSource, draft, onDone]);

  const canUndo = dirty || historyState.canUndo;
  const canRedo = !dirty && historyState.canRedo;

  // Toast "Saved" on the dirty → clean transition. Shares an id so
  // back-to-back saves (fast typing → debounce → save → typing again)
  // replace the same toast slot rather than stacking up. Initial mount
  // doesn't toast because wasDirtyRef starts false.
  useEffect(() => {
    if (wasDirtyRef.current && !dirty && !error) {
      toast.success("Saved", { id: "drafthr-paged-saved", duration: 1200 });
    }
    wasDirtyRef.current = dirty;
  }, [dirty, error]);

  // Pagination failure — surface as an error toast since the inline
  // status pill is gone.
  useEffect(() => {
    if (error) {
      toast.error(error, { id: "drafthr-paged-error" });
    }
  }, [error]);

  return (
    <div className="paged-edit-shell">
      <div className="sticky top-1 z-30 mx-auto mb-3 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-[11px] shadow-md">
        <input
          ref={imageInputRef}
          type="file"
          accept={SAFE_IMAGE_ACCEPT}
          className="hidden"
          onChange={onImageChosen}
        />

        <div className="flex items-center gap-0.5">
          <NativeToolbarButton
            label="Bold"
            active={formatState.bold}
            onClick={() => runNativeCommand("bold")}
          >
            <Bold className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Italic"
            active={formatState.italic}
            onClick={() => runNativeCommand("italic")}
          >
            <Italic className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Underline"
            active={formatState.underline}
            onClick={() => runNativeCommand("underline")}
          >
            <UnderlineIcon className="size-3.5" />
          </NativeToolbarButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-0.5">
          <NativeToolbarButton
            label="Paragraph"
            active={formatState.block === "p"}
            onClick={() => runNativeCommand("formatBlock", "p")}
          >
            <Pilcrow className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Heading 2"
            active={formatState.block === "h2"}
            onClick={() => toggleBlock("h2")}
          >
            <Heading2 className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Heading 3"
            active={formatState.block === "h3"}
            onClick={() => toggleBlock("h3")}
          >
            <Heading3 className="size-3.5" />
          </NativeToolbarButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-0.5">
          <NativeToolbarButton
            label="Bullet list"
            active={formatState.unorderedList}
            onClick={() => runNativeCommand("insertUnorderedList")}
          >
            <List className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Numbered list"
            active={formatState.orderedList}
            onClick={() => runNativeCommand("insertOrderedList")}
          >
            <ListOrdered className="size-3.5" />
          </NativeToolbarButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-0.5">
          <NativeToolbarButton
            label="Align left"
            active={formatState.align === "left"}
            onClick={() => runNativeCommand("justifyLeft")}
          >
            <AlignLeft className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Align center"
            active={formatState.align === "center"}
            onClick={() => runNativeCommand("justifyCenter")}
          >
            <AlignCenter className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Align right"
            active={formatState.align === "right"}
            onClick={() => runNativeCommand("justifyRight")}
          >
            <AlignRight className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Justify"
            active={formatState.align === "justify"}
            onClick={() => runNativeCommand("justifyFull")}
          >
            <AlignJustify className="size-3.5" />
          </NativeToolbarButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-0.5">
          <NativeToolbarButton
            label="Insert image"
            onClick={() => {
              rememberSelection();
              imageInputRef.current?.click();
            }}
          >
            <ImageIcon className="size-3.5" />
          </NativeToolbarButton>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <NativeToolbarButton
              label="Undo"
              disabled={!canUndo}
              onClick={handleUndo}
            >
              <Undo2 className="size-3.5" />
            </NativeToolbarButton>
            <NativeToolbarButton
              label="Redo"
              disabled={!canRedo}
              onClick={handleRedo}
            >
              <Redo2 className="size-3.5" />
            </NativeToolbarButton>
          </div>
          <button
            type="button"
            onClick={handleDone}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--ds-ink)] px-2.5 text-[11px] font-medium text-white transition hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>

      {findOpen && (
        <div className="mx-auto mb-3 flex w-[min(8.27in,100%)] items-center gap-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-[11px] shadow-sm">
          <input
            ref={findBarInputRef}
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) prevMatch();
                else nextMatch();
              } else if (event.key === "Escape") {
                event.preventDefault();
                closeFind();
              }
            }}
            placeholder="Find in letter"
            className="h-7 min-w-0 flex-1 rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] outline-none focus:border-[var(--ds-ink)]"
          />
          <span className="min-w-[54px] text-center text-[10px] text-[var(--ds-muted)] tabular-nums">
            {findQuery ? `${findMatchCount === 0 ? 0 : findIndex + 1}/${findMatchCount}` : "0/0"}
          </span>
          <NativeToolbarButton
            label="Previous match"
            disabled={findMatchCount === 0}
            onClick={prevMatch}
          >
            <ChevronUp className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton
            label="Next match"
            disabled={findMatchCount === 0}
            onClick={nextMatch}
          >
            <ChevronDown className="size-3.5" />
          </NativeToolbarButton>
          <NativeToolbarButton label="Close find" onClick={closeFind}>
            <X className="size-3.5" />
          </NativeToolbarButton>
        </div>
      )}

      {/* The paged.js render IS the editor. onInput bubbles up here from
       * every contentEditable page-content child. */}
      <div
        ref={containerRef}
        className="paged-editor-canvas"
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function NativeToolbarButton({
  label,
  active,
  disabled,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition",
        "text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        active ? "bg-[var(--ds-ink)] text-white hover:bg-[var(--ds-ink)] hover:text-white" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--ds-line)]" />;
}

/* ============================================================================
 * Source HTML composition
 * ==========================================================================*/

/**
 * Merge all sections into one HTML fragment with hidden section-anchor
 * sentinels between them. The anchors survive paged.js's clone-and-stamp
 * pass and let us split content back into sections at save time.
 */
function buildMergedSourceHtml(draft: Draft): string {
  return draft.sections
    .map((s) => {
      const generated =
        s.sectionId === "signature"
          ? signatureImageHtml(draft, ' data-generated-letter-chrome="signature" contenteditable="false"')
          : "";
      return anchorHtmlFor(s.id) + generated + sanitizeLetterHtml(s.html || "");
    })
    .join("");
}

/**
 * Stamp `data-paged-ref="0..N"` on every top-level visible block (skipping
 * section anchors). Refs are by position; they're stable for one round-trip
 * from "render → user edits → reconstruct → re-render" and that's all we
 * need. Returns the letter-body inner HTML; buildPreviewSourceHtml owns the
 * outer .letter-body wrapper shared with read-only Preview.
 */
function stampPagedRefs(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return html;
  wrapLooseTopLevelContent(root);
  let i = 0;
  let currentSectionId: string | null = null;
  for (const child of Array.from(root.children)) {
    if (child.hasAttribute("data-section-anchor")) {
      currentSectionId = child.getAttribute("data-section-id");
      // Do not give paged.js hidden section sentinels to lay out. Chrome can
      // split the wrapper around them and emit blank/duplicated first pages.
      child.remove();
      continue;
    }
    if (child.hasAttribute("data-generated-letter-chrome")) continue;
    child.setAttribute("data-paged-ref", String(i));
    if (currentSectionId) child.setAttribute("data-section-id", currentSectionId);
    i++;
  }
  return root.innerHTML;
}

/* ============================================================================
 * Cursor capture / restore — keep the caret stable across re-pagination.
 * ==========================================================================*/

function captureCursor(root: HTMLElement): CursorState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const start = captureCursorPoint(root, range.startContainer, range.startOffset);
  if (!start) return null;
  const end = range.collapsed
    ? start
    : captureCursorPoint(root, range.endContainer, range.endOffset);
  return { start, end: end ?? start };
}

function captureCursorPoint(
  root: HTMLElement,
  target: Node,
  targetOffset: number,
): CursorPoint | null {
  // Only care about selections inside our editable surface — paged.js
  // chrome (page numbers, etc.) shouldn't be the cursor anchor anyway.
  if (!root.contains(target)) return null;
  let el: HTMLElement | null =
    target.nodeType === Node.TEXT_NODE
      ? (target.parentElement as HTMLElement | null)
      : (target as HTMLElement);
  let refEl: HTMLElement | null = null;
  while (el && el !== root) {
    if (el.hasAttribute && el.hasAttribute("data-paged-ref")) {
      refEl = el;
      break;
    }
    el = el.parentElement;
  }
  if (!refEl) return null;

  const ref = refEl.getAttribute("data-paged-ref")!;
  let offset = positionOffsetWithin(refEl, target, targetOffset);
  const matches = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-paged-ref="${CSS.escape(ref)}"]`),
  );
  for (const match of matches) {
    if (match === refEl) break;
    offset += positionLength(match);
  }
  return { ref, offset };
}

function positionOffsetWithin(
  root: HTMLElement,
  target: Node,
  targetOffset: number,
): number {
  let total = 0;
  let found = false;

  const visit = (node: Node): void => {
    if (found) return;
    if (isIgnoredPositionNode(node)) return;
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += Math.max(0, Math.min(targetOffset, node.textContent?.length ?? 0));
      } else {
        const children = Array.from(node.childNodes).slice(0, targetOffset);
        total += children.reduce((sum, childNode) => sum + positionLength(childNode), 0);
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE || isAtomicPositionNode(node)) {
      total += positionLength(node);
      return;
    }

    for (const childNode of Array.from(node.childNodes)) visit(childNode);
  };

  visit(root);
  return total;
}

function positionLength(node: Node): number {
  if (isIgnoredPositionNode(node)) return 0;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (isAtomicPositionNode(node)) return 1;
  let total = 0;
  for (const child of Array.from(node.childNodes)) {
    total += positionLength(child);
  }
  return total;
}

function restoreCursor(root: HTMLElement, cursor: CursorState): void {
  const start = findCursorPoint(root, cursor.start);
  const end = findCursorPoint(root, cursor.end);
  if (!start || !end) return;

  start.pageContent?.focus({ preventScroll: true });
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function findCursorPoint(
  root: HTMLElement,
  cursor: CursorPoint,
): { node: Node; offset: number; pageContent: HTMLElement | null } | null {
  // A long block may have been split across multiple pages, so a single
  // data-paged-ref can appear in several rendered clones. Walk them in
  // order and decrement the offset until it lands inside one.
  const matches = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-paged-ref="${CSS.escape(cursor.ref)}"]`),
  );
  if (matches.length === 0) return null;

  let remaining = cursor.offset;
  for (const match of matches) {
    const len = positionLength(match);
    if (remaining <= len) {
      const point = pointAtPositionOffset(match, remaining);
      return {
        ...point,
        pageContent:
          match.closest<HTMLElement>(".letter-body") ??
          match.closest<HTMLElement>(".pagedjs_page_content"),
      };
    }
    remaining -= len;
  }
  // Cursor fell past the content (e.g. content shrunk) — drop it at the
  // end of the last matching block instead of losing it entirely.
  const last = matches[matches.length - 1];
  return {
    node: last,
    offset: last.childNodes.length,
    pageContent:
      last.closest<HTMLElement>(".letter-body") ??
      last.closest<HTMLElement>(".pagedjs_page_content"),
  };
}

function pointAtPositionOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, offset);

  const beforeNode = (node: Node) => ({
    node: node.parentNode ?? root,
    offset: node.parentNode ? Array.prototype.indexOf.call(node.parentNode.childNodes, node) : 0,
  });
  const afterNode = (node: Node) => ({
    node: node.parentNode ?? root,
    offset: node.parentNode ? Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1 : 0,
  });

  const find = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) return { node, offset: remaining };
      remaining -= len;
      return null;
    }

    if (isAtomicPositionNode(node)) {
      if (remaining === 0) return beforeNode(node);
      remaining -= 1;
      if (remaining === 0) return afterNode(node);
      return null;
    }

    for (const child of Array.from(node.childNodes)) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };

  return find(root) ?? { node: root, offset: root.childNodes.length };
}

function isAtomicPositionNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return ["BR", "IMG", "HR"].includes((node as HTMLElement).tagName);
}

function isIgnoredPositionNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  return (
    el.hasAttribute("data-section-anchor") ||
    el.hasAttribute("data-generated-letter-chrome") ||
    el.getAttribute("aria-hidden") === "true" ||
    el.style.display === "none"
  );
}

/* ============================================================================
 * Source reconstruction — fold the rendered page-contents back into the
 * source HTML that paginate() consumes. Handles paged.js's mid-block splits
 * by merging all instances of a given data-paged-ref into a single element
 * whose innerHTML is the concatenation of every instance's innerHTML.
 * ==========================================================================*/

type RebuildItem =
  | { kind: "anchor"; outerHTML: string; sectionId: string }
  | { kind: "block"; ref: string; first: HTMLElement; innerParts: string[] };

function reconstructSourceHtml(container: HTMLElement): string {
  normalizeRenderedPagedRefs(container);
  const roots = findRenderedSourceRoots(container);
  const items: RebuildItem[] = [];
  const blockIndex = new Map<string, number>();
  const seenAnchors = new Set<string>();
  let currentSectionId: string | null = null;

  const appendSectionAnchor = (sectionId: string | null) => {
    if (!sectionId || seenAnchors.has(sectionId)) return;
    seenAnchors.add(sectionId);
    items.push({
      kind: "anchor",
      sectionId,
      outerHTML: anchorHtmlFor(sectionId),
    });
  };

  for (const root of roots) {
    for (const node of Array.from(root.children) as HTMLElement[]) {
      if (node.hasAttribute("data-section-anchor")) {
        const id = node.getAttribute("data-section-id") || "";
        currentSectionId = id || currentSectionId;
        appendSectionAnchor(id);
      } else if (node.hasAttribute("data-generated-letter-chrome")) {
        continue;
      } else if (node.hasAttribute("data-paged-ref")) {
        const ref = node.getAttribute("data-paged-ref")!;
        const sectionId: string | null = node.getAttribute("data-section-id") || currentSectionId;
        currentSectionId = sectionId;
        appendSectionAnchor(sectionId);
        if (blockIndex.has(ref)) {
          const item = items[blockIndex.get(ref)!];
          if (item.kind === "block") item.innerParts.push(node.innerHTML);
        } else {
          blockIndex.set(ref, items.length);
          items.push({
            kind: "block",
            ref,
            first: node,
            innerParts: [node.innerHTML],
          });
        }
      }
    }
  }

  const parts: string[] = [];
  for (const item of items) {
    if (item.kind === "anchor") {
      parts.push(item.outerHTML);
      continue;
    }
    const clone = item.first.cloneNode(false) as HTMLElement;
    clone.innerHTML = item.innerParts.join("");
    stripPagedArtifacts(clone);
    clone.removeAttribute("data-paged-ref");
    parts.push(clone.outerHTML);
  }

  return parts.join("");
}

function anchorHtmlFor(id: string): string {
  return `<template data-section-anchor data-section-id="${escAttr(id)}"></template>`;
}

function findRenderedSourceRoots(container: HTMLElement): HTMLElement[] {
  const pageContents = container.querySelectorAll<HTMLElement>(".pagedjs_page_content");
  const roots: HTMLElement[] = [];

  for (const pc of pageContents) {
    const letterBodies = Array.from(pc.querySelectorAll<HTMLElement>(".letter-body"))
      .filter((el) => !el.parentElement?.closest(".letter-body"));
    if (letterBodies.length > 0) {
      roots.push(...letterBodies);
      continue;
    }

    const wrapper = pc.firstElementChild as HTMLElement | null;
    if (wrapper && hasDirectSourceChildren(wrapper)) roots.push(wrapper);
  }

  return roots;
}

function hasDirectSourceChildren(root: HTMLElement): boolean {
  return Array.from(root.children).some(
    (child) =>
      child.hasAttribute("data-section-anchor") ||
      child.hasAttribute("data-paged-ref"),
  );
}

function normalizeRenderedPagedRefs(container: HTMLElement): void {
  const roots = findRenderedSourceRoots(container);
  const refMap = new Map<string, string>();
  let nextRef = 0;
  let currentSectionId: string | null = null;

  for (const root of roots) {
    wrapLooseTopLevelContent(root);
    for (const child of Array.from(root.children) as HTMLElement[]) {
      if (child.hasAttribute("data-section-anchor")) {
        currentSectionId = child.getAttribute("data-section-id") || currentSectionId;
        continue;
      }
      if (child.hasAttribute("data-generated-letter-chrome")) continue;

      const sectionId = child.getAttribute("data-section-id") || currentSectionId;
      if (sectionId) {
        child.setAttribute("data-section-id", sectionId);
        currentSectionId = sectionId;
      }

      const oldRef = child.getAttribute("data-paged-ref");
      let next = oldRef ? refMap.get(oldRef) : undefined;
      if (next === undefined) {
        next = String(nextRef++);
        if (oldRef) refMap.set(oldRef, next);
      }
      child.setAttribute("data-paged-ref", next);
    }
  }
}

function wrapLooseTopLevelContent(root: HTMLElement): void {
  let paragraph: HTMLParagraphElement | null = null;

  const ensureParagraphBefore = (node: Node): HTMLParagraphElement => {
    if (!paragraph) {
      paragraph = root.ownerDocument.createElement("p");
      root.insertBefore(paragraph, node);
    }
    return paragraph;
  };

  const closeParagraph = () => {
    paragraph = null;
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent ?? "";
      if (!compactText(text)) {
        node.remove();
        continue;
      }
      if (text.includes("\n")) {
        text = text.replace(/\s*\n\s*/g, " ");
        if (!paragraph) text = text.trimStart();
        if (nextSiblingClosesLooseParagraph(node)) text = text.trimEnd();
      }
      if (!text) {
        node.remove();
        continue;
      }
      ensureParagraphBefore(node).appendChild(root.ownerDocument.createTextNode(text));
      node.remove();
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      closeParagraph();
      continue;
    }

    const element = node as HTMLElement;
    if (
      element.hasAttribute("data-section-anchor") ||
      element.hasAttribute("data-generated-letter-chrome") ||
      isTopLevelFlowElement(element)
    ) {
      closeParagraph();
      continue;
    }

    ensureParagraphBefore(element).appendChild(element);
  }
}

function nextSiblingClosesLooseParagraph(node: Node): boolean {
  let next = node.nextSibling;
  while (next) {
    if (next.nodeType === Node.COMMENT_NODE) {
      next = next.nextSibling;
      continue;
    }
    if (next.nodeType === Node.TEXT_NODE && !compactText(next.textContent ?? "")) {
      next = next.nextSibling;
      continue;
    }
    if (next.nodeType !== Node.ELEMENT_NODE) return true;
    const element = next as HTMLElement;
    return (
      element.hasAttribute("data-section-anchor") ||
      element.hasAttribute("data-generated-letter-chrome") ||
      isTopLevelFlowElement(element)
    );
  }
  return true;
}

function isTopLevelFlowElement(element: HTMLElement): boolean {
  return TOP_LEVEL_FLOW_TAGS.has(element.tagName);
}

const TOP_LEVEL_FLOW_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "IMG",
  "OL",
  "P",
  "PRE",
  "TABLE",
  "UL",
]);

function stripPagedArtifacts(root: HTMLElement): void {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of elements) {
    if (el.classList.contains("pagedjs_hyphen")) {
      removeGeneratedHyphen(el);
    }

    el.removeAttribute("data-ref");
    el.removeAttribute("data-id");
    el.removeAttribute("data-paged-ref");
    el.removeAttribute("data-section-id");
    el.removeAttribute("data-split-from");
    el.removeAttribute("data-split-to");
    el.removeAttribute("data-previous-break-after");
    el.removeAttribute("data-break-before");
    el.removeAttribute("data-undisplayed");
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");

    for (const className of Array.from(el.classList)) {
      if (className.startsWith("pagedjs_")) el.classList.remove(className);
    }
    if (el.classList.length === 0) el.removeAttribute("class");
  }
}

function removeGeneratedHyphen(el: HTMLElement): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    last = node;
    node = walker.nextNode() as Text | null;
  }
  if (last?.textContent?.endsWith("\u2011")) {
    last.textContent = last.textContent.slice(0, -1);
  }
}

/* ============================================================================
 * Save — split reconstructed source by anchor + push each section to store.
 * ==========================================================================*/

function saveToStore(
  sourceHtml: string,
  draft: Draft,
  updateSection: (draftId: string, sectionId: string, html: string) => void,
): void {
  const splits = splitBySection(sourceHtml);
  for (const section of draft.sections) {
    if (!Object.prototype.hasOwnProperty.call(splits, section.id)) continue;
    const next = sanitizeLetterHtml(splits[section.id] ?? "");
    if (next !== (section.html || "")) {
      updateSection(draft.id, section.id, next);
    }
  }
}

function normalizeSourceHtml(sourceHtml: string, draft: Draft, fallbackSourceHtml = ""): string {
  const firstSectionId = draft.sections[0]?.id;
  const splits = splitBySection(sourceHtml, firstSectionId);
  const fallbackSplits = fallbackSourceHtml ? splitBySection(fallbackSourceHtml, firstSectionId) : {};
  return draft.sections
    .map((section) => {
      const raw = Object.prototype.hasOwnProperty.call(splits, section.id)
        ? splits[section.id]
        : Object.prototype.hasOwnProperty.call(fallbackSplits, section.id)
        ? fallbackSplits[section.id]
        : section.html || "";
      const generated =
        section.sectionId === "signature"
          ? signatureImageHtml(draft, ' data-generated-letter-chrome="signature" contenteditable="false"')
          : "";
      return anchorHtmlFor(section.id) + generated + sanitizeLetterHtml(raw || "");
    })
    .join("");
}

function splitBySection(sourceHtml: string, firstSectionId?: string): Record<string, string> {
  const doc = new DOMParser().parseFromString(`<div>${sourceHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const result: Record<string, string> = {};
  if (!root) return result;
  let currentId: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentId != null) result[currentId] = buf.join("");
    buf = [];
  };
  for (const node of Array.from(root.childNodes)) {
    if (
      node.nodeType === 1 &&
      (node as HTMLElement).getAttribute("data-section-anchor") !== null
    ) {
      flush();
      currentId = (node as HTMLElement).getAttribute("data-section-id");
      continue;
    }
    if (
      node.nodeType === 1 &&
      (node as HTMLElement).getAttribute("data-generated-letter-chrome") !== null
    ) {
      continue;
    }
    if (currentId == null && firstSectionId) currentId = firstSectionId;
    if (node.nodeType === 1) buf.push((node as HTMLElement).outerHTML);
    else if (node.nodeType === 3) buf.push(node.textContent ?? "");
  }
  flush();
  return result;
}

/* ============================================================================
 * Oversized-block normalization
 * ==========================================================================*/

function normalizeOversizedSourceHtml(sourceHtml: string): string {
  if (typeof document === "undefined") return sourceHtml;
  const doc = new DOMParser().parseFromString(`<div>${sourceHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return sourceHtml;

  const measureHost = createMeasureHost();
  try {
    fitMediaElements(root);
    normalizeOversizedChildren(root, measureHost);
    return root.innerHTML;
  } finally {
    measureHost.remove();
  }
}

function normalizeOversizedChildren(parent: HTMLElement, measureHost: HTMLElement): void {
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child.hasAttribute("data-section-anchor")) continue;
    if (child.hasAttribute("data-generated-letter-chrome")) continue;

    fitMediaElements(child);

    if (isListElement(child)) {
      replaceElement(child, splitOversizedList(child, measureHost));
      continue;
    }

    if (child.tagName === "TABLE") {
      replaceElement(child, splitOversizedTable(child, measureHost));
      continue;
    }

    normalizeOversizedChildren(child, measureHost);

    if (isSplittableTextBlock(child) && measureElementHeight(child, measureHost) > OVERSIZED_BLOCK_MAX_HEIGHT_PX) {
      replaceElement(child, splitOversizedTextBlock(child, measureHost));
    }
  }
}

function createMeasureHost(): HTMLElement {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "absolute",
    left: "-100000px",
    top: "0",
    width: `${PAGE_CONTENT_WIDTH_PX}px`,
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "visible",
    fontFamily:
      '"Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: "11pt",
    lineHeight: "1.55",
    color: "#0f172a",
  });
  document.body.appendChild(host);
  return host;
}

function measureElementHeight(element: HTMLElement, host: HTMLElement): number {
  host.replaceChildren(document.importNode(element, true));
  const measured = host.firstElementChild as HTMLElement | null;
  return measured?.getBoundingClientRect().height ?? 0;
}

function replaceElement(original: HTMLElement, replacements: HTMLElement[]): void {
  if (replacements.length === 0) {
    original.remove();
    return;
  }
  original.replaceWith(...replacements);
}

function fitMediaElements(root: HTMLElement): void {
  const images =
    root.tagName === "IMG"
      ? [root as HTMLImageElement]
      : Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  for (const img of images) {
    appendStyleDeclarations(img, {
      "max-width": "100%",
      "max-height": `${OVERSIZED_BLOCK_MAX_HEIGHT_PX}px`,
      height: "auto",
      "object-fit": "contain",
    });
  }
}

function appendStyleDeclarations(el: HTMLElement, declarations: Record<string, string>): void {
  const existing = el.getAttribute("style")?.trim();
  const next = Object.entries(declarations)
    .map(([prop, value]) => `${prop}: ${value};`)
    .join(" ");
  el.setAttribute("style", [existing, next].filter(Boolean).join(" "));
}

function isListElement(el: HTMLElement): el is HTMLOListElement | HTMLUListElement {
  return el.tagName === "UL" || el.tagName === "OL";
}

function isSplittableTextBlock(el: HTMLElement): boolean {
  return ["P", "DIV", "BLOCKQUOTE", "LI"].includes(el.tagName) && Boolean(compactText(el.textContent ?? ""));
}

function splitOversizedTextBlock(element: HTMLElement, measureHost: HTMLElement): HTMLElement[] {
  if (!compactText(element.textContent ?? "")) return [element];
  const chunks = splitElementToMeasuredChunks(element, measureHost);
  if (chunks.length <= 1) return [element];
  return chunks;
}

function splitElementToMeasuredChunks(
  template: HTMLElement,
  measureHost: HTMLElement,
): HTMLElement[] {
  const wordRanges = wordRangesFor(template.textContent ?? "");
  if (wordRanges.length === 0) return [template];

  const chunks: HTMLElement[] = [];
  let index = 0;

  while (index < wordRanges.length) {
    let low = 1;
    let high = wordRanges.length - index;
    let best = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const range = textRangeForWords(wordRanges, index, mid);
      const clone = cloneElementWithTextRange(template, range.start, range.end);
      if (measureElementHeight(clone, measureHost) <= OVERSIZED_BLOCK_MAX_HEIGHT_PX) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const range = textRangeForWords(wordRanges, index, best);
    if (best === 1 && range.end - range.start > 500) {
      for (const hardRange of splitLongTextRange(range.start, range.end, 500)) {
        chunks.push(cloneElementWithTextRange(template, hardRange.start, hardRange.end));
      }
    } else {
      chunks.push(cloneElementWithTextRange(template, range.start, range.end));
    }
    index += best;
  }

  return chunks;
}

type TextRange = { start: number; end: number };

function wordRangesFor(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const matcher = /\S+/g;
  let match = matcher.exec(text);
  while (match) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    match = matcher.exec(text);
  }
  return ranges;
}

function textRangeForWords(ranges: TextRange[], startIndex: number, wordCount: number): TextRange {
  const first = ranges[startIndex];
  const last = ranges[startIndex + wordCount - 1] ?? first;
  return { start: first.start, end: last.end };
}

function splitLongTextRange(start: number, end: number, maxChars: number): TextRange[] {
  const ranges: TextRange[] = [];
  for (let i = start; i < end; i += maxChars) {
    ranges.push({ start: i, end: Math.min(i + maxChars, end) });
  }
  return ranges;
}

function cloneElementWithTextRange(template: HTMLElement, start: number, end: number): HTMLElement {
  const clone = template.cloneNode(false) as HTMLElement;
  clone.removeAttribute("data-paged-ref");
  clone.appendChild(cloneContentsByTextRange(template, start, end));
  return clone;
}

function cloneContentsByTextRange(root: HTMLElement, start: number, end: number): DocumentFragment {
  const fragment = root.ownerDocument.createDocumentFragment();
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let consumed = 0;
  let node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const nodeStart = consumed;
      const nodeEnd = consumed + text.length;
      const sliceStart = Math.max(start, nodeStart);
      const sliceEnd = Math.min(end, nodeEnd);

      if (sliceStart < sliceEnd) {
        const textClone = root.ownerDocument.createTextNode(
          text.slice(sliceStart - nodeStart, sliceEnd - nodeStart),
        );
        appendNodeWithAncestorChain(fragment, root, node, textClone);
      }

      consumed = nodeEnd;
    } else if (isAtomicPositionNode(node)) {
      if (consumed >= start && consumed <= end) {
        appendNodeWithAncestorChain(fragment, root, node, node.cloneNode(true));
      }
    }

    if (consumed >= end) break;
    node = walker.nextNode();
  }

  return fragment;
}

function appendNodeWithAncestorChain(
  fragment: DocumentFragment,
  root: HTMLElement,
  sourceNode: Node,
  clonedNode: Node,
): void {
  let next = clonedNode;
  let parent = sourceNode.parentElement;

  while (parent && parent !== root) {
    const parentClone = parent.cloneNode(false) as HTMLElement;
    parentClone.removeAttribute("data-paged-ref");
    parentClone.appendChild(next);
    next = parentClone;
    parent = parent.parentElement;
  }

  fragment.appendChild(next);
}

function splitOversizedList(
  list: HTMLOListElement | HTMLUListElement,
  measureHost: HTMLElement,
): HTMLElement[] {
  const doc = list.ownerDocument;
  const allItems = Array.from(list.children)
    .filter((child): child is HTMLLIElement => child.tagName === "LI")
    .flatMap((item) =>
      measureElementHeight(item, measureHost) > OVERSIZED_BLOCK_MAX_HEIGHT_PX
        ? splitOversizedTextBlock(item, measureHost)
        : [item.cloneNode(true) as HTMLElement],
    );

  if (allItems.length === 0) return [list];

  const chunks: HTMLElement[] = [];
  let nextStart = Number(list.getAttribute("start") || "1");
  let current = createListShell(list, doc, nextStart);

  for (const item of allItems) {
    current.appendChild(item.cloneNode(true));
    if (measureElementHeight(current, measureHost) > OVERSIZED_BLOCK_MAX_HEIGHT_PX && current.children.length > 1) {
      const moved = current.lastElementChild;
      if (moved) current.removeChild(moved);
      chunks.push(current);
      nextStart += current.children.length;
      current = createListShell(list, doc, nextStart);
      if (moved) current.appendChild(moved);
    }
  }

  if (current.children.length > 0) chunks.push(current);
  return chunks;
}

function createListShell(
  template: HTMLOListElement | HTMLUListElement,
  doc: Document,
  start: number,
): HTMLElement {
  const list = doc.createElement(template.tagName.toLowerCase());
  copySafeAttributes(template, list);
  list.removeAttribute("data-paged-ref");
  if (template.tagName === "OL" && start > 1) list.setAttribute("start", String(start));
  return list;
}

function splitOversizedTable(table: HTMLElement, measureHost: HTMLElement): HTMLElement[] {
  const rows = collectBodyRows(table).flatMap((row) => splitOversizedTableRow(row, measureHost));
  if (rows.length === 0) return [table];

  const chunks: HTMLElement[] = [];
  let current = createTableShell(table);

  for (const row of rows) {
    appendTableRow(current, row.cloneNode(true) as HTMLTableRowElement);
    if (measureElementHeight(current, measureHost) > OVERSIZED_BLOCK_MAX_HEIGHT_PX && tableBodyRowCount(current) > 1) {
      const body = current.querySelector("tbody");
      const moved = body?.lastElementChild;
      if (moved) body?.removeChild(moved);
      chunks.push(current);
      current = createTableShell(table);
      if (moved) appendTableRow(current, moved as HTMLTableRowElement);
    }
  }

  if (tableBodyRowCount(current) > 0) chunks.push(current);
  return chunks;
}

function collectBodyRows(table: HTMLElement): HTMLTableRowElement[] {
  const tbodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
  if (tbodyRows.length > 0) return tbodyRows;
  return Array.from(table.children).filter(
    (child): child is HTMLTableRowElement => child.tagName === "TR",
  );
}

function splitOversizedTableRow(row: HTMLTableRowElement, measureHost: HTMLElement): HTMLTableRowElement[] {
  if (measureElementHeight(wrapRowForMeasure(row), measureHost) <= OVERSIZED_BLOCK_MAX_HEIGHT_PX) {
    return [row.cloneNode(true) as HTMLTableRowElement];
  }

  const cells = Array.from(row.children).filter(
    (child): child is HTMLTableCellElement => child.tagName === "TD" || child.tagName === "TH",
  );
  const cellChunks = cells.map((cell) => splitTableCellContent(cell, 650));
  const chunkCount = Math.max(...cellChunks.map((chunks) => chunks.length), 1);
  const rows: HTMLTableRowElement[] = [];

  for (let index = 0; index < chunkCount; index++) {
    const nextRow = row.ownerDocument.createElement("tr");
    copySafeAttributes(row, nextRow);
    nextRow.removeAttribute("data-paged-ref");
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const sourceCell = cells[cellIndex];
      const nextCell = sourceCell.cloneNode(false) as HTMLTableCellElement;
      const fragment = cellChunks[cellIndex]?.[index] ?? sourceCell.ownerDocument.createDocumentFragment();
      nextCell.appendChild(fragment);
      nextRow.appendChild(nextCell);
    }
    rows.push(nextRow);
  }

  return rows;
}

function splitTableCellContent(cell: HTMLTableCellElement, maxChars: number): DocumentFragment[] {
  const text = cell.textContent ?? "";
  if (!compactText(text)) return [cloneAllChildNodes(cell)];

  const ranges = chunkTextRangesByMaxChars(text, maxChars);
  return ranges.map((range) => cloneContentsByTextRange(cell, range.start, range.end));
}

function cloneAllChildNodes(root: HTMLElement): DocumentFragment {
  const fragment = root.ownerDocument.createDocumentFragment();
  for (const child of Array.from(root.childNodes)) {
    fragment.appendChild(child.cloneNode(true));
  }
  return fragment;
}

function chunkTextRangesByMaxChars(text: string, maxChars: number): TextRange[] {
  const words = wordRangesFor(text);
  if (words.length === 0) return [{ start: 0, end: text.length }];

  const ranges: TextRange[] = [];
  let chunkStart = words[0].start;
  let previousEnd = chunkStart;

  for (const word of words) {
    const wordLength = word.end - word.start;
    if (wordLength > maxChars) {
      if (previousEnd > chunkStart) ranges.push({ start: chunkStart, end: previousEnd });
      ranges.push(...splitLongTextRange(word.start, word.end, maxChars));
      chunkStart = word.end;
      previousEnd = word.end;
      continue;
    }

    if (previousEnd === chunkStart) chunkStart = word.start;
    if (word.end - chunkStart > maxChars && previousEnd > chunkStart) {
      ranges.push({ start: chunkStart, end: previousEnd });
      chunkStart = word.start;
    }
    previousEnd = word.end;
  }

  if (previousEnd > chunkStart) ranges.push({ start: chunkStart, end: previousEnd });
  return ranges;
}

function createTableShell(template: HTMLElement): HTMLElement {
  const table = template.ownerDocument.createElement("table");
  copySafeAttributes(template, table);
  table.removeAttribute("data-paged-ref");

  for (const selector of [":scope > caption", ":scope > colgroup", ":scope > thead"]) {
    const el = template.querySelector(selector);
    if (el) table.appendChild(el.cloneNode(true));
  }

  table.appendChild(template.ownerDocument.createElement("tbody"));
  return table;
}

function appendTableRow(table: HTMLElement, row: HTMLTableRowElement): void {
  let body = table.querySelector("tbody");
  if (!body) {
    body = table.ownerDocument.createElement("tbody");
    table.appendChild(body);
  }
  body.appendChild(row);
}

function tableBodyRowCount(table: HTMLElement): number {
  return table.querySelectorAll("tbody > tr").length;
}

function wrapRowForMeasure(row: HTMLTableRowElement): HTMLElement {
  const table = row.ownerDocument.createElement("table");
  const body = row.ownerDocument.createElement("tbody");
  body.appendChild(row.cloneNode(true));
  table.appendChild(body);
  return table;
}

function copySafeAttributes(from: HTMLElement, to: HTMLElement): void {
  for (const attr of Array.from(from.attributes)) {
    if (attr.name === "data-paged-ref") continue;
    to.setAttribute(attr.name, attr.value);
  }
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/* ============================================================================
 * Utilities
 * ==========================================================================*/

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function selectionInsideLetterBody(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return false;
  }
  const anchor =
    sel.anchorNode.nodeType === Node.TEXT_NODE
      ? sel.anchorNode.parentElement
      : (sel.anchorNode as HTMLElement | null);
  const focus =
    sel.focusNode?.nodeType === Node.TEXT_NODE
      ? sel.focusNode.parentElement
      : (sel.focusNode as HTMLElement | null);
  return Boolean(anchor?.closest(".letter-body") && focus?.closest(".letter-body"));
}

function focusSelectionLetterBody(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel?.anchorNode || !root.contains(sel.anchorNode)) return;
  const anchor =
    sel.anchorNode.nodeType === Node.TEXT_NODE
      ? sel.anchorNode.parentElement
      : (sel.anchorNode as HTMLElement | null);
  anchor?.closest<HTMLElement>(".letter-body")?.focus({ preventScroll: true });
}

function runEditorCommand(command: string, value?: string): boolean {
  try {
    document.execCommand("styleWithCSS", false, "false");
  } catch {
    // Some browsers ignore styleWithCSS; formatting still works without it.
  }

  if (command === "formatBlock" && value) {
    return runFormatBlockCommand(value);
  }
  return execCommandSafe(command, value);
}

function runFormatBlockCommand(value: string): boolean {
  const tag = normalizeFormatBlock(value) || "p";
  const candidates = [tag, tag.toUpperCase(), `<${tag}>`, `<${tag.toUpperCase()}>`];
  for (const candidate of candidates) {
    const ok = execCommandSafe("formatBlock", candidate);
    const applied = normalizeFormatBlock(queryCommandValue("formatBlock")) === tag;
    if (ok && applied) return true;
  }
  return false;
}

function execCommandSafe(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

function queryCommandState(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function queryCommandValue(command: string): string {
  try {
    return String(document.queryCommandValue(command) ?? "");
  } catch {
    return "";
  }
}

function normalizeFormatBlock(value: string): string {
  const normalized = value.replace(/[<>]/g, "").toLowerCase();
  if (normalized === "heading 2") return "h2";
  if (normalized === "heading 3") return "h3";
  if (normalized === "normal" || normalized === "div") return "p";
  return normalized;
}

function isComposingInput(event: Event): boolean {
  return "isComposing" in event && Boolean((event as InputEvent).isComposing);
}

function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  normalizeOfficePaste(parsed.body);
  convertWordListParagraphs(parsed.body);
  const bodyHtml = parsed.body.innerHTML || html;
  const sanitized = sanitizeLetterHtml(bodyHtml);
  const doc = new DOMParser().parseFromString(`<div>${sanitized}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    scrubPasteAttributes(el);
  }

  return root.innerHTML;
}

function normalizeOfficePaste(root: HTMLElement): void {
  const comments = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const toRemove: Node[] = [];
  let comment = comments.nextNode();
  while (comment) {
    toRemove.push(comment);
    comment = comments.nextNode();
  }
  for (const node of toRemove) node.parentNode?.removeChild(node);

  for (const selector of ["style", "meta", "link", "script"]) {
    for (const el of Array.from(root.querySelectorAll(selector))) el.remove();
  }

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const tag = el.tagName.toLowerCase();
    if (tag.includes(":") || tag === "xml") {
      el.replaceWith(...Array.from(el.childNodes));
    }
  }
}

function convertWordListParagraphs(root: HTMLElement): void {
  for (const child of Array.from(root.children) as HTMLElement[]) {
    convertWordListParagraphs(child);
  }

  let currentList: HTMLOListElement | HTMLUListElement | null = null;
  let currentKind: "ol" | "ul" | null = null;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE || !isWordListParagraph(node as HTMLElement)) {
      currentList = null;
      currentKind = null;
      continue;
    }

    const paragraph = node as HTMLElement;
    const kind = wordListKind(paragraph);
    if (!currentList || currentKind !== kind) {
      currentList = document.createElement(kind);
      currentKind = kind;
      root.insertBefore(currentList, paragraph);
    }
    const li = document.createElement("li");
    li.innerHTML = wordListItemHtml(paragraph);
    currentList.appendChild(li);
    paragraph.remove();
  }
}

function isWordListParagraph(el: HTMLElement): boolean {
  if (!["P", "DIV"].includes(el.tagName)) return false;
  const className = el.getAttribute("class") ?? "";
  const style = el.getAttribute("style") ?? "";
  return /MsoListParagraph/i.test(className) || /mso-list\s*:/i.test(style);
}

function wordListKind(el: HTMLElement): "ol" | "ul" {
  const text = (el.textContent ?? "").trim();
  return /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]\s+/i.test(text) ? "ol" : "ul";
}

function wordListItemHtml(el: HTMLElement): string {
  const text = (el.textContent ?? "")
    .replace(/^\s*(?:[\u2022\u00b7\u25cf\u25cb\u25aa\-\*o]|\d+|[a-z]|[ivxlcdm]+)[.)]?\s+/i, "")
    .trim();
  return escHtml(text);
}

function scrubPasteAttributes(el: HTMLElement): void {
  const tag = el.tagName;
  const allowed = new Set<string>();
  const textAlign = safeTextAlignFromStyle(el.getAttribute("style") ?? "");

  if (tag === "A") {
    allowed.add("href");
    allowed.add("target");
    allowed.add("rel");
  } else if (tag === "IMG") {
    allowed.add("src");
    allowed.add("alt");
    allowed.add("title");
    allowed.add("width");
    allowed.add("height");
  } else if (tag === "TD" || tag === "TH") {
    allowed.add("colspan");
    allowed.add("rowspan");
  }
  if (textAlign && /^(P|DIV|H1|H2|H3|H4|LI|TD|TH)$/.test(tag)) {
    allowed.add("style");
  }

  for (const attr of Array.from(el.attributes)) {
    if (!allowed.has(attr.name)) el.removeAttribute(attr.name);
  }
  if (textAlign) el.setAttribute("style", `text-align: ${textAlign};`);
}

function safeTextAlignFromStyle(style: string): "left" | "center" | "right" | "justify" | "" {
  const match = /text-align\s*:\s*(left|center|right|justify)\b/i.exec(style);
  return (match?.[1]?.toLowerCase() as "left" | "center" | "right" | "justify" | undefined) ?? "";
}

function insertHtmlAtCurrentSelection(root: HTMLElement | null, html: string): void {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return;
  }
  const anchorElement =
    sel.anchorNode.nodeType === Node.TEXT_NODE
      ? sel.anchorNode.parentElement
      : (sel.anchorNode as HTMLElement | null);
  if (!anchorElement?.closest(".letter-body")) return;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const source = doc.body.firstElementChild;
  if (!source) return;

  const fragment = document.createDocumentFragment();
  for (const node of Array.from(source.childNodes)) {
    fragment.appendChild(document.importNode(node, true));
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function findAllMatches(container: HTMLElement, query: string): Range[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: Range[] = [];
  for (const root of findRenderedSourceRoots(container)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (
          parent.closest(
            "[data-section-anchor], [data-generated-letter-chrome], [aria-hidden='true']",
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return compactText(node.textContent ?? "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    let node = walker.nextNode() as Text | null;
    while (node) {
      const text = node.textContent ?? "";
      const haystack = text.toLowerCase();
      let index = haystack.indexOf(needle);
      while (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        matches.push(range);
        index = haystack.indexOf(needle, index + needle.length);
      }
      node = walker.nextNode() as Text | null;
    }
  }

  return matches;
}

function destroyPreviewer(previewer: PreviewerInstance | null): void {
  if (!previewer) return;
  try {
    previewer.chunker?.stop?.();
    previewer.chunker?.destroy?.();
    previewer.polisher?.destroy?.();
  } catch {
    // paged.js cleanup should not mask the edit/save path.
  }
}

function createPaginationStagingHost(container: HTMLElement): HTMLElement {
  const host = document.createElement("div");
  const width = container.getBoundingClientRect().width || PAGE_WIDTH_FALLBACK_PX;
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    left: "-100000px",
    top: "0",
    width: `${width}px`,
    minHeight: "1px",
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "visible",
  });
  document.body.appendChild(host);
  return host;
}

function findScrollAncestor(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const cs = getComputedStyle(cur);
    if (/(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

export const __pagedEditorInternals = {
  captureCursor,
  restoreCursor,
  reconstructSourceHtml,
  normalizeRenderedPagedRefs,
  normalizeSourceHtml,
  normalizeOversizedSourceHtml,
  sanitizePastedHtml,
  splitBySection,
  stampPagedRefs,
};
