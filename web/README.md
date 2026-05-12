# DraftHR — Marketing site

Standalone front page for **DraftHR**. Independent of the main app in `/src` —
edit, restyle, or replace freely without touching product code.

## What's in here

```
web/
├── index.html        Landing page (nav · hero · value · how · letters · trust · CTA · footer)
├── styles.css        All styles. Uses the same design tokens as the app for brand consistency.
├── logo.png          Full DraftHR lockup (logo + wordmark)
├── d-mark.png        The "D" mark alone — used as nav chip, hero watermark, final-CTA watermark
└── README.md         You are here.
```

## How to launch

Three ways, in order of zero-config to full:

### 1. Open the file directly
Double-click `web/index.html`. Loads in your browser via `file://`. Works for
quick checks; some browsers restrict image loading and CORS on `file://`
URLs — if anything looks broken, use option 2 or 3.

### 2. One-line static server (no install)
From the `web/` folder:

```bash
npx serve .
```

or, no Node needed:

```bash
python3 -m http.server 4400
```

Then open <http://localhost:4400/>.

### 3. Deploy to Vercel (own project, own domain)

```bash
cd web
vercel
```

Pick a new project — keeps the marketing site separate from the app on
Vercel too. `web/` has no build step, so the static files are served as-is.

## Conventions

- **CTAs link to `http://localhost:5273/`** during development. Replace with
  the production app URL when you deploy.
- **Fonts:** Geist (sans) and Playfair Display (display serif) — loaded from
  Google Fonts.
- **Brand colours and tokens** mirror `src/styles/globals.css`. Keep them in
  sync if you tweak either side.
- **No JavaScript framework.** Plain HTML + CSS. Add a `<script>` block in
  `index.html` if you need interactivity later.

## What to edit

- Headline / value props / copy: `index.html`
- Layout, spacing, colours, type: `styles.css`
- Logo / watermark imagery: replace `logo.png` and `d-mark.png` (keep the
  filenames so HTML references don't break)

## Migrating to a richer setup later

If this grows beyond a static site, the natural next step is a separate
Vite + React project in this folder with its own `package.json` —
mirrors how `src/` is set up but isolated. Until then, the static
HTML / CSS / image trio is intentionally the simplest thing that works.
