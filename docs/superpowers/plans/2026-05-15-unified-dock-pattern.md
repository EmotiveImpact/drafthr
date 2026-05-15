# Unified Dock Pattern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor's desktop default flip from "AI rail open as right column" to "twin pills at bottom-right" (Evidence + Ask AI). Add an explicit pin gesture to Ask AI so either dock can become the right rail. Mutually exclusive — pinning one unpins the other.

**Architecture:** Build on existing pieces rather than rewrite. The codebase already has (a) a collapsible AI rail with a floating Ask AI pill ([Editor.tsx:1462](src/routes/Editor.tsx:1462)), (b) an EvidenceDrawer with floating + pinned modes ([EvidenceDrawer.tsx](src/components/editor/EvidenceDrawer.tsx)), and (c) a tablet/mobile pattern where Ask AI is a pill that opens a slide-in rail ([Editor.tsx:1437](src/routes/Editor.tsx:1437)). The unified dock model is achieved by: (1) flipping the desktop `railCollapsed` default to `true`, (2) adding an Evidence pill to the bottom-right dock tray alongside the existing Ask AI pill, (3) adding a pin button to the AI rail header, and (4) making the two pinned modes mutually exclusive via a single source-of-truth state `pinnedDock: 'evidence' | 'ai' | null`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Framer Motion, Vite, Radix UI primitives.

---

## File Structure

**Modify only — no new components needed.** The existing components already encapsulate the right things; we just rewire defaults and add mutual exclusion.

- `src/routes/Editor.tsx` — replace `railCollapsed: boolean` + `evidencePinned: boolean` (two separate states) with `pinnedDock: 'evidence' | 'ai' | null` and a derived `aiRailOpen` / `evidencePinned`. Flip desktop default so neither is pinned and AI rail is collapsed. Add the Evidence pill to the bottom-right dock tray (next to the existing Ask AI pill).
- `src/components/editor/AIPanel.tsx` — add an optional `onPin` prop next to the existing `onCollapse`. Renders a pin button in the AI panel header when supplied.
- `src/components/editor/EvidenceDrawer.tsx` — no signature changes; pinned-mode banner copy tweak ("AI rail collapsed" → "Ask AI is a pill"). The `onPinnedChange` callback is already there.
- `public/evidence-dock-pattern.html` — no changes (already represents the target).

**Why no `<Dock>` shell extraction?** The two surfaces have substantively different bodies (AIPanel vs EvidenceDrawer's tabbed list). A shared shell would be ~12 lines of header chrome — not enough payoff to justify the extraction right now. YAGNI. Revisit if a third dock arrives.

---

## Task 1: Add `pinnedDock` state and derive existing states

**Files:**
- Modify: `src/routes/Editor.tsx` around line 128 (state declarations) and line 163 (`railCollapsed`).

**Why:** Single source of truth. Today there are two independent booleans (`railCollapsed` and `evidence.pinned` inside the draft). Putting them under one `pinnedDock` state makes mutual exclusion provable and the default flip trivial.

- [ ] **Step 1: Read the current state declarations**

Read `src/routes/Editor.tsx` lines 120–170 to confirm exact location of `railCollapsed` and any existing evidence-pinned state.

- [ ] **Step 2: Add `pinnedDock` state and derive the existing flags**

Replace the existing `railCollapsed` `useState` line. Locate:

```tsx
const [railCollapsed, setRailCollapsed] = useState(false);
```

Replace with:

```tsx
// Unified dock state. `pinnedDock` is the single source of truth for which
// dock (if any) is mounted as the full-height right rail. Mutually exclusive.
// Default: null → twin pills at bottom-right, letter at full width.
const [pinnedDock, setPinnedDock] = useState<"evidence" | "ai" | null>(null);

// Derived: the AI rail is open as the right column only when AI is pinned.
const railCollapsed = pinnedDock !== "ai";
const setRailCollapsed = (next: boolean) =>
  setPinnedDock(next ? (pinnedDock === "ai" ? null : pinnedDock) : "ai");
```

- [ ] **Step 3: Add a `pinEvidence` / `pinAI` / `unpinAll` helper trio**

Immediately after the state declaration, add:

```tsx
const pinEvidence = () => setPinnedDock("evidence");
const pinAI = () => setPinnedDock("ai");
const unpinAll = () => setPinnedDock(null);
```

- [ ] **Step 4: Find every existing reference to evidence pinning**

Run: `grep -n "evidence.pinned\|isEvidencePinned\|pinned:" src/routes/Editor.tsx`

For every place that reads "is evidence pinned" or sets it, replace with the new state. Specifically:
- Reading: `evidence.pinned` or similar → `pinnedDock === "evidence"`
- Setting to true → `pinEvidence()`
- Setting to false → `unpinAll()` (or `setPinnedDock(pinnedDock === "evidence" ? null : pinnedDock)` if AI pin should survive)

- [ ] **Step 5: Verify in browser**

Run dev server preview, navigate to an editor route, confirm the page renders without errors and the AI rail is now collapsed by default (pill visible at bottom-right).

- [ ] **Step 6: Commit**

```bash
git add src/routes/Editor.tsx
git commit -m "Unified dock state — pinnedDock as single source of truth"
```

---

## Task 2: Add an Evidence pill to the bottom-right dock tray

**Files:**
- Modify: `src/routes/Editor.tsx` around line 1466 (the existing desktop "Ask AI" pill `AnimatePresence` block).

**Why:** Today only the Ask AI pill sits in the bottom-right corner. We need an Evidence pill next to it whenever neither dock is pinned.

- [ ] **Step 1: Read the existing Ask AI pill JSX**

Read `src/routes/Editor.tsx` lines 1462–1500 to copy the existing animation + styling pattern.

- [ ] **Step 2: Add the Evidence pill next to the Ask AI pill**

Inside the same `AnimatePresence` block that renders the desktop Ask AI pill, add a sibling motion button. Important: render both when `pinnedDock === null` (neither pinned). When AI is pinned, Evidence pill should NOT render (it would be a Sheet trigger that competes with the rail). When Evidence is pinned, AI pill should still render (so user can switch). So the conditions are asymmetric — see notes below.

Locate:

```tsx
{!focusMode && railCollapsed && (
  <motion.button
    key="desktop-ask-ai"
    ...
```

Wrap both pills in a flex row container and add the Evidence pill:

```tsx
<AnimatePresence>
  {!focusMode && pinnedDock !== "ai" && (
    <motion.div
      key="desktop-dock-tray"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7, delay: 0.08 }}
      className="hidden lg:flex fixed bottom-4 right-4 z-30 items-end gap-2"
    >
      {/* Evidence pill — only when not pinned */}
      {pinnedDock !== "evidence" && (
        <button
          type="button"
          onClick={() => setEvidenceDrawerOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] border border-[var(--ds-amber-bd)] shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:opacity-95"
          aria-label="Open evidence drawer"
        >
          <span className="grid place-items-center size-5 rounded-full bg-white/40">
            <Paperclip className="size-3" />
          </span>
          <span className="text-[12px] font-semibold">Evidence</span>
          {(draft.evidence?.length ?? 0) > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--ds-amber-fg)] text-white text-[10px] font-bold">
              {draft.evidence?.length}
            </span>
          )}
        </button>
      )}

      {/* Ask AI pill — existing, but unconditional under !railCollapsed needs review */}
      <button
        type="button"
        onClick={() => setRailCollapsed(false)}
        className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-ink)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.16)] hover:opacity-95"
        aria-label="Open AI agent"
      >
        <span className="grid place-items-center size-5 rounded-full bg-white/15">
          <Sparkles className="size-3" />
        </span>
        <span className="drafthr-text-shimmer text-[12px] font-medium">Ask AI</span>
      </button>
    </motion.div>
  )}
</AnimatePresence>
```

Note: this REPLACES the existing single Ask AI motion.button. The previous standalone Framer animation moves to the wrapper div so both pills animate as a unit.

- [ ] **Step 3: Import `Paperclip` from lucide-react**

At the top of `Editor.tsx`, add `Paperclip` to the `lucide-react` import line if not already present.

- [ ] **Step 4: Verify in browser**

Reload preview at any editor route. Expect: bottom-right shows both pills side-by-side (Evidence amber, Ask AI dark). Clicking Evidence opens the existing drawer. Clicking Ask AI un-collapses the rail. Letter is full-width.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Editor.tsx
git commit -m "Add Evidence pill to desktop dock tray"
```

---

## Task 3: Add a pin button to the AI rail header

**Files:**
- Modify: `src/components/editor/AIPanel.tsx` — add `onPin?: () => void` prop, render a pin button next to the existing collapse chevron.
- Modify: `src/components/editor/RightRail.tsx` — forward the new prop.
- Modify: `src/routes/Editor.tsx` — pass `onPin={pinAI}` to `<RightRail />` in the desktop rail block.

**Why:** Today the AI rail can only be collapsed. After this, it can also be "pinned" — same gesture as Evidence has. Conceptually: pinning means "this is the dominant work mode, stay open until I unpin".

- [ ] **Step 1: Read AIPanel.tsx header section**

Read the AIPanel component to locate the header row where `onCollapse` is rendered.

- [ ] **Step 2: Add `onPin` prop to AIPanel signature**

Find the `onCollapse?` prop in AIPanel's props type. Add a sibling:

```tsx
/** Convert the rail to "pinned" mode. When supplied, renders a pin button
 * next to the collapse chevron. Pin is mutually exclusive with Evidence pin
 * — the parent enforces this via the shared `pinnedDock` state. */
onPin?: () => void;
isPinned?: boolean;
```

- [ ] **Step 3: Render the pin button in AIPanel header**

Next to the existing collapse-chevron in the header row, add:

```tsx
{onPin && (
  <button
    type="button"
    onClick={onPin}
    className={
      "inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-[0.04em] border " +
      (isPinned
        ? "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)] border-[var(--ds-violet-bd)]"
        : "bg-transparent text-[var(--ds-muted)] border-[var(--ds-line-2)] hover:text-[var(--ds-ink)]")
    }
    title={isPinned ? "Pinned — click to unpin" : "Pin Ask AI as the right rail (collapses Evidence)"}
    aria-pressed={isPinned}
  >
    <Pin className="size-3" />
    {isPinned ? "Pinned" : "Pin"}
  </button>
)}
```

Import `Pin` from `lucide-react` at the top of AIPanel.tsx.

- [ ] **Step 4: Forward props through RightRail.tsx**

Edit `RightRail.tsx` to add `onPin` and `isPinned` props on the wrapper, forward to `<AIPanel>`. The component currently has 4 props (draft, tab, onTabChange, pendingComment, onPendingCommentConsumed, activeSectionId, onCollapse). Add:

```tsx
onPin?: () => void;
isPinned?: boolean;
```

And pass them to `<AIPanel>`.

- [ ] **Step 5: Wire from Editor.tsx**

In the desktop rail block around line 1367, change:

```tsx
<RightRail
  draft={draft}
  tab={rightTab}
  onTabChange={setRightTab}
  ...
  onCollapse={() => setRailCollapsed(true)}
/>
```

to also pass `onPin={pinAI}` and `isPinned={pinnedDock === "ai"}`.

- [ ] **Step 6: Verify in browser**

Reload preview. Open the AI rail (click Ask AI pill). Confirm a Pin button is visible in the AIPanel header. Click Pin. Expect: nothing visually changes yet (AI is already a right rail when un-collapsed), but `pinnedDock` is now `"ai"`. Open the React DevTools to verify state if needed, OR proceed to Task 4 which is where the visual effect lands.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/AIPanel.tsx src/components/editor/RightRail.tsx src/routes/Editor.tsx
git commit -m "Add Pin button to AI rail header"
```

---

## Task 4: Make Evidence pinning auto-unpin AI (and vice versa)

**Files:**
- Modify: `src/routes/Editor.tsx` at the existing Evidence pinned-mode wiring.

**Why:** Mutual exclusion. The previous tasks set `pinnedDock` to one value or the other; this task makes sure pinning one explicitly removes the other.

- [ ] **Step 1: Find the existing evidence pin handler**

Run: `grep -n "onPinnedChange\|setEvidencePinned\|pinned:" src/routes/Editor.tsx`

Look for where `<EvidenceDrawer onPinnedChange={...}>` is rendered.

- [ ] **Step 2: Update the handler to use the unified state**

The handler is called with a boolean (`true` = pin, `false` = unpin). Change it to:

```tsx
onPinnedChange={(next) => {
  if (next) {
    setPinnedDock("evidence");
  } else {
    setPinnedDock(pinnedDock === "evidence" ? null : pinnedDock);
  }
}}
```

- [ ] **Step 3: Update the `pinned` prop being passed to EvidenceDrawer**

Wherever the editor passes `pinned={...}` to `<EvidenceDrawer>`, change it to:

```tsx
pinned={pinnedDock === "evidence"}
```

- [ ] **Step 4: Verify mutual exclusion in browser**

Reload preview. Pin Evidence from the drawer header → expect Evidence becomes the right rail, AI rail (if it was open) disappears, Ask AI pill appears at bottom-right. Now pin AI from the AIPanel header → expect AI becomes the right rail, Evidence un-pins, Evidence pill appears.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Editor.tsx
git commit -m "Mutually exclusive pinning between Evidence and Ask AI"
```

---

## Task 5: Update pinned-mode banner copy in EvidenceDrawer

**Files:**
- Modify: `src/components/editor/EvidenceDrawer.tsx` around line 320 ("Evidence rail · AI agent hidden while pinned").

**Why:** Copy refresh. The banner currently says "AI agent hidden while pinned" — under the new model, AI is not hidden, it's a pill.

- [ ] **Step 1: Locate the banner**

Run: `grep -n "AI agent hidden" src/components/editor/EvidenceDrawer.tsx`

- [ ] **Step 2: Update copy**

Replace `Evidence rail · AI agent hidden while pinned` with:

```
Evidence pinned · Ask AI is a pill at bottom-right
```

Also update the title attribute on the unpin button (around line 313): `"Unpin — return to floating drawer (AI agent rail comes back)"` → `"Unpin — return both Evidence and Ask AI to pills"`.

- [ ] **Step 3: Verify in browser**

Pin Evidence, confirm the new banner copy appears at the top of the pinned rail.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/EvidenceDrawer.tsx
git commit -m "Refresh pinned-rail banner copy for unified dock model"
```

---

## Task 6: Reorder top-bar — Invite pill before Review CTA

**Files:**
- Modify: `src/routes/Editor.tsx` around lines 885–915 (Invite pill) and the Review CTA placement.

**Why:** Cosmetic. Mockup shows Invite pill living closer to the Review CTA in the right cluster, before the avatar group.

- [ ] **Step 1: Read the current toolbar right-cluster**

Read `src/routes/Editor.tsx` lines 880–930.

- [ ] **Step 2: Move the Invite button JSX**

Move the Invite `<Button>` block to render BEFORE the avatars group but AFTER any existing pills in the right cluster. The exact reorder is local — no logic change, just JSX order.

- [ ] **Step 3: Verify in browser**

Reload preview. Right cluster order should now read (left → right): Invite · avatars · Review →.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Editor.tsx
git commit -m "Reorder top-bar: Invite pill before avatar cluster"
```

---

## Task 7: Persist `pinnedDock` per draft

**Files:**
- Modify: `src/routes/Editor.tsx` — wrap `pinnedDock` state in a localStorage-backed effect, keyed by draft id.

**Why:** Mockup spec: "State is per-draft" — a tribunal claim might live in Evidence-pinned mode; a holiday request never leaves twin pills. Without persistence, the user has to re-pin on every page load.

- [ ] **Step 1: Replace the `useState` with a load-on-mount + save-on-change pair**

Locate `const [pinnedDock, setPinnedDock] = useState<...>(null);`. Replace with:

```tsx
const dockStorageKey = `drafthr.pinnedDock:${draft.id}`;
const [pinnedDock, setPinnedDock] = useState<"evidence" | "ai" | null>(() => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(dockStorageKey);
    return raw === "evidence" || raw === "ai" ? raw : null;
  } catch {
    return null;
  }
});

useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    if (pinnedDock) {
      window.localStorage.setItem(dockStorageKey, pinnedDock);
    } else {
      window.localStorage.removeItem(dockStorageKey);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota) — non-fatal.
  }
}, [pinnedDock, dockStorageKey]);
```

- [ ] **Step 2: Verify persistence in browser**

Pin Evidence. Reload the page. Expect: Evidence is still pinned. Unpin → reload → expect: twin pills.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Editor.tsx
git commit -m "Persist pinnedDock per-draft in localStorage"
```

---

## Self-review checklist (do at end)

- [ ] Run `npm run typecheck` (or equivalent) — no TS errors.
- [ ] Visit all editor route variants in preview: empty draft, draft with evidence, draft mid-AI-suggestion.
- [ ] Resize viewport from desktop → tablet → mobile — confirm pills behave correctly at each breakpoint.
- [ ] Verify focus mode (`focusMode`) still hides both pills.
- [ ] Verify no console errors.

---

## Out-of-scope (intentionally NOT in this plan)

- Extracting a shared `<Dock>` component (YAGNI until a third dock exists).
- Animating the pin/unpin transition (today it's an instant swap; smoothing it is a separate polish PR).
- Adding a notification badge on the Ask AI pill when AI has a new suggestion (mentioned in mockup as "mitigation" — separate feature).
- Changing AI rail content or Evidence drawer content (this PR is structural only).
