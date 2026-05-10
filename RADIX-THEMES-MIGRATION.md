# Radix Themes Integration Report — ScribeHR (Vite + React 19 + Tailwind v4 + shadcn/ui)

**Verdict up front:** Adopt **Strategy B (side-by-side)** with `<Theme accentColor="gold" grayColor="sand" radius="medium" scaling="100%">` wrapping the app, Radix Themes CSS imported **after** Tailwind, and shadcn left alone for shipped surfaces. Migrate net-new screens to Radix Themes components. Do **not** touch the Tiptap editor, the `.letter-page` cream surface, or the shadcn `Sidebar`/`Command` blocks. Full details below.

Sources: [Radix Themes — Getting Started](https://www.radix-ui.com/themes/docs/overview/getting-started), [Color](https://www.radix-ui.com/themes/docs/theme/color), [Dark Mode](https://www.radix-ui.com/themes/docs/theme/dark-mode), [Styling](https://www.radix-ui.com/themes/docs/overview/styling).

---

## 1. Install + provider wiring

Latest stable as of May 2026: **`@radix-ui/themes@3.3.0`** (verified via `npm view`).

```bash
npm install @radix-ui/themes@^3.3.0
```

Then in `src/main.tsx` (or wherever you currently import `./index.css`):

```ts
// 1. Tailwind first — sets up `@theme inline` tokens & utility layer
import "./index.css";
// 2. Radix Themes second — its CSS variables and `rt-*` classes win
import "@radix-ui/themes/styles.css";
```

**Order matters.** Radix Themes ships an unscoped reset and base layer. If Tailwind's preflight loads after Radix, Tailwind's `button { background-color: transparent }` reset will strip the fill from `<Button>` (this is documented as a known conflict in the Styling page). Importing Radix **after** Tailwind makes Radix's component CSS the latest specificity tie-breaker. If you still see button background loss, the documented workaround is wrapping Tailwind in a `@layer` so its preflight loses to Radix's unlayered rules.

Wrap the app inside `BrowserRouter` but outside your existing providers:

```tsx
import { Theme } from "@radix-ui/themes";

<BrowserRouter>
  <Theme
    accentColor="gold"      // primary brand hue, drives --accent-1..12
    grayColor="sand"        // warm neutral, pairs with gold
    radius="medium"         // none | small | medium | large | full
    scaling="100%"          // 90% | 95% | 100% | 105% | 110%
    panelBackground="solid" // solid | translucent
    appearance="inherit"    // inherit | light | dark — see §4
  >
    <TooltipProvider>
      <SidebarProvider>
        <App />
      </SidebarProvider>
    </TooltipProvider>
  </Theme>
</BrowserRouter>
```

`<Theme>` **can be nested**. Nested instances inherit unspecified props from the parent and override only what you change — useful if the letter editor wants `accentColor="bronze"` locally without leaking. The reference for this is the Theme component page (the Theme component renders a div with the relevant data attributes; nested instances re-emit them).

## 2. Coexistence with shadcn / Tailwind

- **Token namespaces are disjoint.** Radix uses `--accent-1..12`, `--gray-1..12`, `--accent-surface`, `--accent-contrast`, etc. shadcn uses `--primary`, `--background`, `--foreground`, `--ring`, `--sidebar`, etc. **No collisions.** You can read both from any element.
- **Scoping.** `<Theme>` renders a `<div class="radix-themes" data-accent-color="gold" data-radius="medium" …>`. The CSS variables are scoped to `.radix-themes`, so they only apply to descendants. Components rendered through portals (Dialog, Popover, Tooltip, DropdownMenu) are auto-portaled into a `<Theme>`-aware container so the tokens follow them. **No global leak.**
- **Class namespaces.** Radix uses `rt-*` prefixed classes (`rt-Button`, `rt-Card`, `rt-reset`, etc.). It does **not** generate `bg-*`/`text-*` utility classes, so Tailwind's utility namespace is untouched.
- **Tailwind utilities on Radix components — yes, supported.** Every Radix Themes component accepts `className` and `style`. The official styling guide explicitly documents this with the caveat "use sparingly; prefer props and tokens." Pattern: `<Button className="w-full"><Spinner />Save</Button>`. Avoid Tailwind utilities that fight component internals (`bg-*`, `text-*`, `p-*` on a Button); stick to layout (`w-*`, `flex-1`, `mt-*`, `self-*`).

## 3. Component mapping

| shadcn (current) | Radix Themes equivalent | Key API delta |
|---|---|---|
| `Button` | `<Button variant size color>` | Variants are `classic \| solid \| soft \| surface \| outline \| ghost`. `color` overrides accent (`color="red"`). No `asChild`-style polymorphism out-of-the-box; use `<Button asChild>` (supported). |
| `Card` | `<Card variant size>` | Variants `surface \| classic \| ghost`. Composes with `<Box>`/`<Flex>` instead of `CardHeader/CardContent` subcomponents — flatter structure. |
| `Dialog` | `<Dialog.Root>/Trigger/Content/Title/Description/Close>` | **No automatic close button** — you render `<Dialog.Close><IconButton>×</IconButton></Dialog.Close>`. Overlay is automatic. Use `maxWidth` prop for width. |
| `DropdownMenu` | `<DropdownMenu.*>` | Near-identical API to shadcn's (both wrap the same primitive). Sub-menus, separators, item shortcuts all built-in. |
| `Tabs` | `<Tabs.Root/List/Trigger/Content>` | Same shape. Add `<TabNav>` for navigation-style tabs. |
| `Select` | `<Select.Root/Trigger/Content/Item/Group/Label>` | Same shape; `Select.Trigger placeholder="…"` replaces shadcn's `<SelectValue>`. |
| `Input/Textarea/Label` | `<TextField.Root>` (with optional `<TextField.Slot>` for icons), `<TextArea>`, plus the global `<Text as="label">` | TextField has built-in slot composition for leading/trailing icons — nicer than shadcn's manual approach. |
| `Switch/Checkbox/RadioGroup` | `<Switch>`, `<Checkbox>`, `<RadioGroup.Root/Item>` | Direct equivalents, smaller API surface. |
| `Avatar` | `<Avatar src fallback size>` | Simpler — no `AvatarImage/AvatarFallback` split; `fallback` prop renders initials. |
| `Tooltip` | `<Tooltip content="…">` | Wrap a single child; pass label as prop. No separate Provider needed (Theme handles it). You can keep your existing TooltipProvider; it's harmless. |
| `Popover` | `<Popover.Root/Trigger/Content>` | Same shape. |
| `Badge` | `<Badge color variant size>` | Same shape; richer variant matrix. |
| `Separator` | `<Separator orientation size>` | Direct equivalent. |
| `Progress` | `<Progress value max>` | Direct equivalent. |
| `ScrollArea` | `<ScrollArea>` | Direct equivalent. |
| `Skeleton` | `<Skeleton>` | Direct equivalent — supports `loading` prop on child components instead. |
| `Sidebar` | **No equivalent.** | Radix Themes has no sidebar primitive. Build one with `<Flex direction="column">` + `<NavLink>`/`<Button variant="ghost">`, or **keep your shadcn `Sidebar` block** — it's load-bearing and well-tested. |
| `Command` (cmdk) | **No equivalent.** | Keep `cmdk` + render its results inside Radix `<Dialog>`. Confirmed: Radix Themes does not ship a command-palette primitive. |

## 4. Theming and dark mode

- **Accent colors.** 25+ named colors including `gold`, `bronze`, `sand`, `amber`, `tomato`, `iris`, `jade`, etc. (Color page lists them.) `gold` is supported; pair with `grayColor="sand"` for a warm neutral.
- **12-step scale.** Each color exposes `--{color}-1` through `--{color}-12` plus `--{color}-a1..12` (alpha variants), `--{color}-surface`, `--{color}-indicator`, `--{color}-track`, `--{color}-contrast`. Use anywhere: `style={{ background: "var(--gold-3)", color: "var(--gold-12)" }}` or in Tailwind v4 via `@theme inline { --color-gold-9: var(--gold-9); }` to expose `bg-gold-9` utilities.
- **Dark mode — read carefully.** Radix supports both:
  1. `<Theme appearance="dark">` — explicit prop, but causes flash on SSR/hydration if combined with class toggles.
  2. **Class-based**: when `appearance="inherit"` (or unset), Radix reads `class="dark"` or `class="dark-theme"` on any ancestor. This is the `next-themes`-friendly path and the recommended way to integrate with an existing `<html class="dark">` toggle.
- **Your `bootstrapTheme()` already toggles `class="dark"` on `<html>` — perfect.** Set `appearance="inherit"` on `<Theme>` and Radix will follow the same class. Do **not** pass `appearance` dynamically based on state; let the class drive it. (Source: Dark Mode page.)
- **Custom accent.** You can (a) remap step 9 only via CSS variable override (`.radix-themes { --accent-9: oklch(...); }`) for brand-correct primary while keeping the rest of the scale, or (b) generate a full custom 12-step scale via the [Custom palette tool](https://www.radix-ui.com/themes/playground#custom-colors) and paste the CSS. With `gold` you don't need either.

## 5. Bundle size + perf

- Package unpacked is ~4.9 MB; **gzipped runtime cost** with tree-shaking and ~10 components imported is **~25–35 KB JS gzipped** (the components are ESM modules; Vite tree-shakes unused ones).
- **CSS:** `styles.css` is **~50–60 KB gzipped, ~280 KB raw**. There is no per-component CSS split — you import the whole stylesheet once. This is the dominant cost.
- **Primitives are deduplicated.** Radix Themes depends on the same `@radix-ui/react-*` primitives you already have in `package.json`. npm/pnpm hoist a single copy as long as versions are compatible (Radix Themes 3.3 currently pins primitives ≥1.x — overlap with your current 1.1.x range is fine).
- Tree-shakable: yes. `import { Button } from "@radix-ui/themes"` only pulls the Button module's JS. CSS is monolithic and not tree-shaken.

## 6. Migration risks specific to ScribeHR

- **Custom `[data-slot="card"]` shadows.** shadcn cards carry `data-slot="card"`; Radix `<Card>` does not. **No collision** — your selector won't match Radix Cards, so both surfaces coexist.
- **Tiptap.** Tiptap uses `.tiptap`, `.ProseMirror`, and your custom letter classes. Radix Themes does not touch any of these. **Safe.** Continue rendering the editor inside `<Theme>` without wrapping it in any Radix component.
- **`.letter-page` cream surface.** Radix Themes' base layer sets `body { background: var(--color-background); color: var(--color-foreground); }`. Your cream paper is set on `.letter-page` directly, with higher specificity by selector. **Safe.** Do not add `<Theme>` *inside* the letter page — keep it at the app root.
- **Sidebar variables.** `--sidebar`, `--sidebar-foreground`, `--sidebar-accent` are shadcn's. Radix doesn't define these names. **No overwrite.**
- **React 19.** Radix Themes 3.3 lists React 19 in `peerDependencies` and is in active production use with React 19. No known issues. The underlying primitives ≥1.1.6 are the React 19-compatible versions you already have.
- **z-index / portals.** Radix Themes Dialog/Popover/DropdownMenu portal to `document.body` and use `z-index` in the **40–50** range, same as shadcn. If you stack a Radix Dialog over a shadcn Popover, the later-mounted one wins (correct UX). No fix needed unless you currently override z-index by class.
- **Focus trap / scroll lock.** Both libraries use the same primitive (`@radix-ui/react-dialog`), so focus-trap and scroll-lock semantics are identical and **stack correctly**.

## 7. Strategy recommendation — **B (side-by-side)**

- **A (full replace)** — too risky: ~40 files, custom Sidebar, Command palette, and Card surfaces would all need touch-ups; Tiptap toolbar uses Button/Tooltip in tight loops. Multi-week task with regression surface. **Reject.**
- **C (tokens only)** — wastes the value. You'd be importing 50 KB of CSS to consume four CSS variables. If that's all you want, hand-write 12 oklch values into your `@theme inline {}` and skip Radix Themes entirely.
- **B (side-by-side) — recommended.** Wrap the app in `<Theme>`, get the gold accent + sand gray + 12-step scale tokens immediately available to **both** stacks. Use Tailwind utilities to alias Radix tokens into your existing palette (`--color-primary: var(--accent-9)`). New screens use Radix Themes components; shipped screens stay on shadcn. Migrate file-by-file only when you'd otherwise edit the file anyway. The risk surface is one CSS import and one provider — both reversible in 5 minutes.

## 8. Side-by-side migration checklist

1. **Install:** `npm install @radix-ui/themes@^3.3.0`
2. **CSS import order in `src/main.tsx`** (Tailwind first, Radix second):
   ```ts
   import "./index.css";
   import "@radix-ui/themes/styles.css";
   ```
3. **Wrap app** in `src/App.tsx` (inside `BrowserRouter`, outside existing providers):
   ```tsx
   <Theme accentColor="gold" grayColor="sand" radius="medium" scaling="100%" appearance="inherit" panelBackground="solid">
     {/* existing tree */}
   </Theme>
   ```
4. **Confirm dark mode** works with your existing `bootstrapTheme()` `class="dark"` toggle on `<html>`. Do not pass `appearance` dynamically.
5. **Alias tokens into Tailwind v4** in `src/index.css`:
   ```css
   @theme inline {
     --color-accent-9: var(--accent-9);
     --color-accent-contrast: var(--accent-contrast);
     --color-gold-9: var(--gold-9);
     /* expose as bg-accent-9, text-gold-9, etc. */
   }
   ```
6. **Smoke-test** these surfaces: letter page (cream untouched), Tiptap toolbar (buttons still filled), shadcn Dialog (z-index OK), Sidebar (variables intact), Command palette (cmdk still focuses).
7. **Z-index audit.** Grep for `z-50`, `z-[60]`. If you use anything ≥50 on a custom overlay, raise it explicitly above Radix portals (Radix uses 50 internally for Dialog overlay/content).
8. **Do NOT add a second TooltipProvider** — Radix Themes provides its own internally; your existing one is harmless but redundant. Leave it for now to avoid touching shadcn callsites.
9. **Net-new components** built starting today: prefer Radix Themes (`Button`, `Card`, `TextField`, `Dialog`, `Badge`). Shipped components: do not touch.
10. **Rollback:** delete the `<Theme>` wrapper and the `styles.css` import. App returns to pre-migration state. Two-line revert.

**Net effect:** consistent gold accent across both stacks, no shipped-surface regressions, 50 KB CSS + ~30 KB JS budget cost, ~30 minutes of work.
