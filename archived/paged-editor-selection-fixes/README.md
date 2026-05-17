# Paged-editor selection / undo / cursor fixes — archived patch

**Status:** ✅ HISTORICAL ONLY — all 4 bugs already fixed in `main` (audited
2026-05-17 by Codex GPT-5.5 with HIGH confidence, per-bug evidence below).
The patch is kept as a reference record; no porting needed.

**Origin:** A `~/drafthr-stepper` git worktree on branch
`explore/stepper-onboarding` was discovered with 554 lines of
uncommitted work on `PagedEditor.tsx` + tests. Base commit was
`fa56d94` (release 0.6.0). The worktree was deleted on 2026-05-17;
the patch was preserved here so the work isn't lost.

## What the patch contains

Four bugfixes to the paged editor ("edit on page" mode — A4 page cards
the user can type directly on). The default section-by-section editor is
unaffected by any of these.

| # | Bug | What user sees today (without fix) |
|---|---|---|
| 1 | **Toolbar steals selection on click** | Highlight a word → click Bold → highlight disappears. Click Italic next? Nothing applies. |
| 2 | **Undo misses recent keystrokes** | Type fast, immediately hit Cmd+Z. Sometimes leaves the last few characters behind. |
| 3 | **Cursor jumps on repagination** | Typing in page 3, paged.js rebuilds page breaks, cursor jumps to page 1. |
| 4 | **Toolbar buttons flicker un-pressed on click** | Bold-is-pressed state visually deactivates briefly when you click another toolbar button. Cosmetic only. |

The patch also includes 200+ lines of new tests covering all four
fixes — high regression confidence if ported cleanly.

## How the patch was built

Concept additions to `src/components/editor/paged-edit/PagedEditor.tsx`:

- `SELECTION_PRESERVING_COMMANDS` — Set of toolbar commands that should
  preserve the user's selection across the click (bold / italic /
  underline / formatBlock / justifyLeft/Center/Right/Full).
- `EditableSelection` / `EditableTextSelection` / `EditableTextPoint`
  types — model the selection independent of DOM identity so it can be
  restored after the DOM is touched.
- `dirtyRef` + sync `setEditorDirty` — lets external code (the menubar's
  Undo handler) see the latest dirty state synchronously, before React
  re-renders the menubar's action props.
- `captureCursorWithRefRecovery` / `captureEditableTextSelection` /
  `restoreSelectionAfterCommand` — capture before, restore after,
  recover when the DOM was reconstructed.
- `shouldPreserveFormatStateAfterSelectionLoss` — heuristic that keeps
  Bold visually pressed when the toolbar steals focus.
- `reconstructSourceHtml` reworked to operate on a snapshot, not the
  live DOM — keeps the user's cursor intact across rebuilds.

Test additions in `PagedEditor.test.tsx`:

- Reconstruction without mutating live DOM (cursor + selection
  preserved through the snapshot pipeline).
- External undo handler sees dirty DOM before React republishes.
- Toolbar formatting stays selected during toolbar focus changes.
- Selected range stays active across repeated alignment commands.

## Risk if applied today

- Patch base is commit `fa56d94` (0.6.0). Main is at 0.11.2+ with the
  0.11.2 paged-editor mobile-scaling rewrite on top. `PagedEditor.tsx`
  has been heavily modified since this patch was written.
- A direct `git apply` will conflict. The work has to be ported
  semantically — read the patch, understand the four fixes, apply
  the equivalent changes against current `PagedEditor.tsx`.
- Risk is bounded — these touch selection / cursor / undo / toolbar
  logic only. No data, auth, persistence, payment, or AI surface.
  Worst case: paged editor misbehaves; section editor is unaffected;
  one commit can be reverted.

## Codex audit verdict (2026-05-17)

All four bugs verified ALREADY FIXED in current `main` with HIGH confidence.
The stepper exploration appears to have been independently shipped through
a different commit path — the same identifier names show up in current
`PagedEditor.tsx` (`SELECTION_PRESERVING_COMMANDS`, `dirtyRef`,
`shouldPreserveFormatStateAfterSelectionLoss`).

| Bug | Status | Where in current code |
|---|---|---|
| #1 Toolbar steals selection | ✅ FIXED | `PagedEditor.tsx:84` defines `SELECTION_PRESERVING_COMMANDS`; lines 497-518 capture selection + bookmarks, run `runEditorCommand`, then `restoreSelectionAfterCommand`; lines 1350-1363 restore selection after preserved commands; lines 2402-2428 wrap `document.execCommand`. Test: `PagedEditor.test.tsx:428` (alignment selection survives repeated toolbar commands). |
| #2 Undo handler stale state | ✅ FIXED | `PagedEditor.tsx:190` defines `dirtyRef`; lines 227-230 sync separately from React state; lines 586-598 `handleUndo` checks `dirtyRef.current` and reconstructs dirty DOM before undoing; line 619 `handleRedo` same. Test: `PagedEditor.test.tsx:363`. |
| #3 Cursor jumps on repagination | ✅ FIXED | `PagedEditor.tsx:1562` `reconstructSourceHtml` clones container first, normalizes the snapshot, finds roots from the snapshot at 1563-1565 — never mutates live DOM. Lines 475-480 capture cursor before reconstruction + repagination. Test: `PagedEditor.test.tsx:175` (live DOM + selection unchanged). |
| #4 Toolbar buttons flicker | ✅ FIXED | `PagedEditor.tsx:273` suppresses format-state reset when `shouldPreserveFormatStateAfterSelectionLoss` returns true; lines 1509-1525 implement the heuristic; line 833 wires `editorRootRef`; line 1061 exposes active state via `aria-pressed`. Test: `PagedEditor.test.tsx:395`. |

**Recommendation:** safe to delete the entire `archived/paged-editor-selection-fixes/`
folder if disk hygiene matters — there's no scenario where main needs this
patch. Keeping it as a historical breadcrumb is fine too; it's only 32 KB.

## When to revisit (only if circumstances change)

Trigger any of these:

- You (or a user) hit one of the four bugs and find it annoying enough
  to fix
- You're already touching `PagedEditor.tsx` for another reason and may
  as well port these while you're in there
- The paged editor becomes a frequent-use feature (e.g. promoted in
  onboarding, default for some letter type)

If none of the above fire, leave this archived. The bugs are real but
non-critical — paged editor is an optional WYSIWYG mode, not the
primary editing surface.

## How to port (when ready)

**Recommended path:**

1. Dispatch Codex to read both files and produce a clean port:
   ```bash
   codex exec --sandbox workspace-write --skip-git-repo-check \
     "Port the four bugfixes documented in
     archived/paged-editor-selection-fixes/README.md into
     src/components/editor/paged-edit/PagedEditor.tsx + its test file.
     Use the patch at archived/paged-editor-selection-fixes/paged-editor-selection-fixes.patch
     as reference. Verify with npm run lint && npx tsc --noEmit &&
     npm test -- --run. Do NOT commit." </dev/null > /tmp/codex-port.log 2>&1 &
   ```
2. Review the diff.
3. Smoke-test the paged editor in a browser.
4. Commit + push.

**Alternative:** apply manually with `git apply --3way`:

```bash
git apply --3way archived/paged-editor-selection-fixes/paged-editor-selection-fixes.patch
```

Resolve conflicts by hand. Slower but full control.

## Before any port — check whether these are already fixed

The patch was written against 0.6.0. Some of the four bugs may have
been fixed independently in later work (especially the 0.11.2
paged-editor hardening commits). Before porting, dispatch Codex to
audit:

```bash
codex exec --sandbox read-only --skip-git-repo-check \
  "Check src/components/editor/paged-edit/PagedEditor.tsx + its
  test file against the four bugs documented in
  archived/paged-editor-selection-fixes/README.md. For each bug,
  report:
   - is it ALREADY FIXED in current main?
   - is it PARTIALLY FIXED?
   - is it UNFIXED?
  Be specific about line numbers and which patterns indicate
  presence/absence of the fix." </dev/null > /tmp/codex-audit.log 2>&1 &
```

This saves wasted porting work if main already shipped equivalents.
