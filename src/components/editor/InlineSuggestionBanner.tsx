import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check, X, LayoutGrid, AlignLeft } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import {
  hasPendingSuggestions,
  listSuggestionsHtml,
} from "@/lib/tiptap/suggestion-merge";
import {
  getDiffViewMode,
  setDiffViewMode,
  type DiffViewMode,
} from "@/lib/diff-view-mode";
import type { Draft } from "@/lib/letters/types";

/**
 * Canvas-level affordance for inline AI suggestions. Renders when ANY
 * section in the draft has pending track-changes marks. Surfaces:
 *   - Total pending count (deduped by suggestion id across sections)
 *   - Accept-all / Reject-all (mirrors the AIPanel control so users
 *     don't have to dive into the right rail to act on the proposal)
 *   - View toggle: inline diff (default) ↔ side-by-side card view.
 *     Stored as a global localStorage preference so the next AI proposal
 *     opens in the same mode.
 *
 * Returns null when nothing is pending — no chrome cost in the steady state.
 */
export function InlineSuggestionBanner({ draft }: { draft: Draft }) {
  const acceptAllSuggestions = useDraftStore((s) => s.acceptAllSuggestions);
  const rejectAllSuggestions = useDraftStore((s) => s.rejectAllSuggestions);

  // Live diff-mode preference. We listen for the custom event the toggle
  // dispatches so multiple banners (e.g. on focus mode toggle) stay in
  // sync without prop drilling.
  const [mode, setMode] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DiffViewMode>).detail;
      if (detail === "inline" || detail === "card") setMode(detail);
    };
    window.addEventListener("drafthr:diff-view-mode", onChange);
    return () => window.removeEventListener("drafthr:diff-view-mode", onChange);
  }, []);

  const pendingCount = useMemo(() => {
    let count = 0;
    for (const sec of draft.sections) {
      if (!hasPendingSuggestions(sec.html)) continue;
      const list = listSuggestionsHtml(sec.html);
      count += list.filter((s) => s.status === "pending").length;
    }
    return count;
  }, [draft.sections]);

  if (pendingCount === 0) return null;

  return (
    <div className="rounded-md border border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)] px-3 py-2 flex items-center gap-3 flex-wrap text-[12px]">
      <Sparkles className="size-3.5 text-[var(--ds-amber-fg)] shrink-0" />
      <span className="text-[var(--ds-amber-fg)] font-medium">
        AI proposed {pendingCount} {pendingCount === 1 ? "change" : "changes"}
      </span>
      <span className="text-[var(--ds-muted)] hidden sm:inline">
        · Click an underlined / struck-through phrase to accept it on its own.
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => rejectAllSuggestions(draft.id)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--ds-line)] bg-white text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] text-[11.5px]"
          title="Reject every pending suggestion in this draft"
        >
          <X className="size-3" />
          Reject all
        </button>
        <button
          type="button"
          onClick={() => acceptAllSuggestions(draft.id)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--ds-green-fg)] text-white hover:brightness-110 text-[11.5px] font-medium"
          title="Accept every pending suggestion in this draft"
        >
          <Check className="size-3" />
          Accept all
        </button>
        {/* View toggle — inline default; users who prefer the legacy
         * Cursor-style before/after card flip here. The toggle only
         * affects FUTURE proposals; existing pending diffs keep their
         * original mode so undo / accept stays predictable. */}
        <button
          type="button"
          onClick={() => setDiffViewMode(mode === "inline" ? "card" : "inline")}
          className="ml-1 inline-flex items-center gap-1 h-6 px-2 rounded-md text-[var(--ds-amber-fg)] hover:bg-[var(--ds-amber-fg)]/10 text-[11px]"
          title={
            mode === "inline"
              ? "Switch future proposals to side-by-side card view"
              : "Switch future proposals to inline track-changes"
          }
        >
          {mode === "inline" ? (
            <>
              <LayoutGrid className="size-3" />
              Card view
            </>
          ) : (
            <>
              <AlignLeft className="size-3" />
              Inline view
            </>
          )}
        </button>
      </div>
    </div>
  );
}
