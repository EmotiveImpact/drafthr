# Two-column auth shell with image slideshow

**Date:** 2026-05-20
**Scope:** `/sign-in` and `/sign-in/signup` only.
**Status:** Approved by user 2026-05-20. Ready for plan-writing.

## Why

The current sign-in and signup pages are a single centered card on a soft
background — fine on mobile and laptop, but on a wide desktop screen they look
sparse and miss a chance to set tone before the user is logged in. The login
page is also the first DraftHR surface a brand-new visitor sees; the empty
canvas leaves brand work on the table.

The reference design the user pulled (Future Through Space) splits the screen
50/50: editorial image on the left, sign-in form on the right. We adapt that
two-column pattern to DraftHR's palette and layer a 3-slide crossfade on the
left so each slide can carry its own brand message rather than committing to
one static line.

The transactional auth pages (forgot-password, reset-password, verify-email)
stay on their current centered-card layout — they're short-lived utility
surfaces, the user has already chosen to authenticate, and the marketing
real-estate doesn't earn its weight on those pages.

## Scope

In scope:

- `src/routes/SignIn.tsx` — current page, gets wrapped in the new shell at `lg:` and up
- `src/routes/SignUp.tsx` — same wrapping
- New: `src/routes/sign-in/AuthSplitShell.tsx` — the two-column container
- New: `src/routes/sign-in/SignInSlideshow.tsx` — the left-panel slideshow
- New: 3 JPEG assets in `public/auth/`

Out of scope:

- `/sign-in/forgot-password`, `/sign-in/reset-password`, `/sign-in/verify-email` — unchanged
- The form bodies of `SignIn.tsx` and `SignUp.tsx` (fields, validation, OAuth handlers, error states) — unchanged
- `PublicLegalShell` (privacy/terms) — unaffected
- The single-column mobile/tablet layout below `lg:` — unchanged, exactly the current design

## Layout

### `<lg:` (≤1023px)

Identical to current behavior. The slideshow column is `hidden lg:flex`, so it
doesn't render and its `<img>` tags aren't created — phone users don't pay
for the photos. The form panel renders full-width inside the existing
single-column wrapper.

### `lg:` (≥1024px)

Full-viewport-height grid, `grid-cols-2`, no gap.

```
┌──────────────────────────┬──────────────────────────┐
│                          │                          │
│   slideshow              │   form                   │
│   (left column)          │   (right column)         │
│                          │                          │
│   - full-bleed image     │   - vertically centered  │
│   - persistent brand     │     existing form        │
│     lockup top-left      │   - max-width ~440px     │
│   - tagline bottom-left  │   - same horizontal      │
│   - pagination dots      │     padding as today     │
│     bottom-left          │                          │
└──────────────────────────┴──────────────────────────┘
```

Both columns are `min-h-screen`. The right column uses `flex items-center
justify-center` so the form sits in the same optical position regardless of
how tall the viewport is.

## Slideshow behavior

- **3 slides**, full-bleed `<img>` per slide, sized via `object-cover`.
- **Crossfade**, ~1.1s duration, `opacity` only. No translate/scale —
  movement would compete with the right-side form.
- **6s per slide**, auto-advance via `setInterval`. Pauses while a dot is
  focused or hovered (so a curious user can read a slide without it changing
  under them).
- **Pagination dots** in the bottom-left, in line with the tagline copy.
  Three short pill-shaped indicators; the active one is white, the rest are
  white at 30% opacity. Clicking a dot jumps to that slide and resets the
  6s timer.
- **Persistent brand lockup** (BrandMark + white Wordmark) sits in the
  top-left area, outside the slide stack — it does NOT crossfade. The brand
  is the same on every slide, so re-rendering it per slide just adds
  flicker.
- **`prefers-reduced-motion`**: respects the media query. If set, auto-
  advance is disabled and slides switch instantly (no crossfade) when a
  user clicks a dot. Slide 1 is the default.
- **Keyboard**: dots are real `<button>` elements with `aria-label="Slide N
  of 3"` and visible focus rings. Tab order: form fields first (right
  column), dots last (left column) — login is the primary action.

## Slide content

Each slide carries an image, a headline, and a sub-line. The brand lockup
is rendered once outside the stack.

| # | Image (in `public/auth/`) | Headline | Sub-line |
|---|---|---|---|
| 1 | `slide-1.jpg` (HR conversation, two people) | The hard letters, written well. | For the conversations no one wants to draft alone. |
| 2 | `slide-2.jpg` (architectural / institutional) | Tribunal-grade. Audit-defensible. | Cited clauses, signed exports, full audit chain. |
| 3 | `slide-3.jpg` (warm modern office) | HR letters, done in minutes. | AI-assisted drafting for HR teams across the UK and US. |

Source URLs (used as the basis for downloading, then committed to
`public/auth/`):

- Slide 1: `https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e`
- Slide 2: `https://images.unsplash.com/photo-1486406146926-c627a92ad1ab`
- Slide 3: `https://images.unsplash.com/photo-1497366216548-37526070297c`

Download at ~1600px wide, JPEG quality 78, target ≤120 KB per image.

## Components

### `AuthSplitShell`

```
src/routes/sign-in/AuthSplitShell.tsx
```

```ts
type AuthSplitShellProps = {
  children: React.ReactNode; // the form panel content
};
```

Renders the responsive two-column container. At `<lg` it just renders
`children` inside the existing single-column wrapper (so it's a no-op
visually). At `lg:` it renders the slideshow on the left and `children`
centered on the right.

The form layout inside `children` stays as it is today — the consumer
component is responsible for its own internal styling. `AuthSplitShell` only
provides the outer geometry.

### `SignInSlideshow`

```
src/routes/sign-in/SignInSlideshow.tsx
```

No props. Self-contained. Imports `BrandMark` and `Wordmark` from
`@/components/ds`. Owns:

- The slide array (image src, headline, sub-line) — hardcoded in this file
- The active-index state
- The auto-advance timer
- The crossfade CSS
- The dot controls
- The `prefers-reduced-motion` check

If we ever want to vary the slides per page (e.g. a "Welcome back" set on
signin and a "Welcome to DraftHR" set on signup), the slide array becomes a
prop. Until then, the same 3 slides on both pages is the right call — same
brand promise, no per-page divergence to maintain.

### Wiring

`SignIn.tsx` and `SignUp.tsx` each get an outer `<AuthSplitShell>`
wrapper. The current page body becomes the children. No internal form code
changes.

```tsx
// before
return (
  <main className="...">
    {/* logo + card */}
  </main>
);

// after
return (
  <AuthSplitShell>
    {/* logo + card — exact same JSX */}
  </AuthSplitShell>
);
```

The existing `<main>` and background gradient move into `AuthSplitShell`'s
right column so the right side keeps the same off-white wash on `lg:` (the
left side is the photo; no wash needed). Below `lg:` the gradient still
covers the full viewport.

## Accessibility

- Dots are real `<button>`s with `aria-label="Show slide N of 3"`.
- Active dot has `aria-current="true"`.
- Slide region has `role="region"` and `aria-label="Brand highlights"`.
- `<img>` tags carry `alt=""` (decorative; the tagline beside them
  conveys the meaning).
- Auto-advance halts on focus-within and on hover of the slideshow
  region. Resumes when focus/hover leaves.
- `prefers-reduced-motion: reduce` → no auto-advance, no fade.
- Form remains the first tab stop. Dots come after the form.
- Color contrast: the dark gradient guarantees the headline (white,
  semibold, 30px) stays at 4.5:1 over any image. Sub-line (white at 80%,
  14px) sits at 3:1 — fine for the larger size class but worth verifying
  per slide.

## Performance

- The slideshow component is rendered with `hidden lg:flex` on the
  wrapper. At `<lg:` the wrapper is `display:none`, so React still mounts
  the component but the `<img>` tags don't trigger network fetches in
  most browsers (Chrome / Safari skip image loads for `display:none`
  ancestors). To be safe, the component also checks `window.matchMedia
  ('(min-width: 1024px)')` before kicking off the auto-advance timer — no
  point burning a setInterval on mobile.
- Slide 1 image gets `loading="eager"` + `fetchpriority="high"`. Slides
  2 and 3 get `loading="lazy"`. Sign-in is critical-path, so the first
  slide loading instantly matters; slides 2 and 3 have 6+ seconds before
  they're needed.
- Each JPEG ≤120 KB. Total left-column weight ≤360 KB, all served from
  the same origin. No CDN dependency, no Unsplash runtime call.

## Open questions

None at design time. Outstanding things will be settled in the plan or
during implementation:

- Final compressed sizes of the three JPEGs (target ≤120 KB each)
- Exact horizontal padding on the right column at `lg:` (probably matches
  the current card padding so the form sits in the same optical place
  before/after the change)
- Whether to add a subtle vignette to slide 1 (HR conversation has a
  brighter background than the other two — may or may not need extra
  darkening at the bottom for tagline contrast)
