# DRAFTHR

AI-assisted HR letter drafting for the UK and US. Wizard-driven, legally aware, with a full-height right-rail AI agent that proposes section-level edits and inline floating comment threads anchored to the document text. Built on Vite + React 19 + TypeScript, AI SDK v6, and Anthropic Claude (`claude-sonnet-4-6` by default).

**Current version:** `0.6.0`

→ **Live design system:** [`/public/design-system.html`](public/design-system.html)
→ **Regenerate UX options:** [`/public/regenerate-options.html`](public/regenerate-options.html)

---

## What it does

- **Wizard → draft** — 35 letter types (14 HR-side, 21 employee-side), each with a UK and US template authored as a structured scaffold (statutory anchors, hard constraints, gold-standard examples). The model fills the scaffold using the user's wizard answers; output is HTML.
- **Per-section editor** — every letter is broken into sections (recipient, subject, opening, body, terms, closing, signature…). Each section regenerates independently, has version history, and can be refined with a freeform instruction ("more conciliatory; cite s.95(1)(c) ERA explicitly").
- **Two editing surfaces** — section-by-section editing for structured drafting, plus edit-on-page mode that renders real paged.js A4 cards and lets the user type directly on the paginated letter. Preview uses the same A4 print geometry.
- **Top File / Tools / View menubar** on desktop — File (project), Tools (AI actions: regen / refine / comments / timeline), View (mode + display toggles). Mobile keeps the previous icon toolbar + ⋯ overflow.
- **Inline floating comments** — selection-triggered "+ Comment" (Tiptap BubbleMenu in the editor, floating button in the preview) opens a `FloatingCommentPanel` portalled to `<body>` and anchored to the highlighted text mark. Self-positions below the anchor, repositions on scroll, dismisses on Esc / outside-click. An *All Comments* dialog (Tools menu) lists every unresolved thread for sweep-before-export. Comments are persisted via a custom `CommentMark` Tiptap extension.
- **Right-rail AI agent** — full-rail-height, no tabs. Typed AI SDK v6 tool-calling: the agent can propose section rewrites, add named clauses, tighten a section to a word-count target, or produce a counsel-grade summary. Mutating calls stay human-in-the-loop: the user reviews each proposal with an Apply button before it commits, and successful applies push the outcome back to the agent. Empty state surfaces a starter grid (one card per typed tool) and a recent-prompts row backed by localStorage.
- **Evidence & Attachments step** — after drafting, add typed notes or uploaded files, link each item to the letter sections it supports, then reference, quote, or list those items in the letter before review/export.
- **Collaborators + invites** — invite people by email + role (editor / reviewer / viewer). Local persistence today; the popover combines the form + roster + share link + a `mailto:` fallback that opens the user's mail client with a prefilled invitation. Avatar stack in the editor topbar opens the same popover.
- **Compliance + template quality inspector** — live per-clause pattern matches plus section-by-section template requirements, including hard "MUST" checks and guardrails. Tied to the counsel-review status pill in the topbar.
- **Letterhead + signature image uploads** — base64-stored on the profile (so every employer draft auto-picks them up), rendered in Preview, embedded in the PDF + DOCX exports.
- **Export** — PDF (hardened server Puppeteer with client `html2canvas` + `jspdf` fallback), DOCX (in-repo OOXML writer), and a ZIP export pack bundling the letter, evidence, manifest, audit JSON, timeline, and review checklist. High-risk letter types gate behind a counsel-review attestation dialog.
- **Security posture** — production fails closed without Clerk auth unless `VITE_ALLOW_PUBLIC_APP=true` is explicitly set; API routes enforce JSON/size/origin/rate-limit guards; rendered HTML is sanitized; embedded images are restricted to base64 PNG/JPEG/WEBP/GIF.
- **Cmd+K search** — indexes drafts, letter catalog, section content (with snippets), comments, and route shortcuts.

## Tech

| Layer | What |
|---|---|
| Build | Vite 6, React 19, TypeScript |
| Styling | Tailwind v4, Radix UI Themes (`gray` / `slate`), Source Serif 4 for marquee, Geist for sans |
| State | Zustand stores (`useDraftStore`, `useProfileStore`, `useThemeStore`) persisted to localStorage |
| Editor | Tiptap section editor plus paged.js edit-on-page; native toolbar commands, undo/redo, cursor restore across reflow, custom CommentMark |
| AI | AI SDK v6 (`ai@^6`, `@ai-sdk/react@^3`) + Anthropic Claude via `@ai-sdk/anthropic@^3` — Sonnet 4.6 default, Opus 4.7 / Haiku 4.5 selectable in Settings |
| Motion | Framer Motion 12 — bottom-sheet drag/snap on mobile, route cross-fade transitions |
| Toasts | Sonner (theme-aware, swipe-dismiss, Undo affordance on accept/reject pending changes) |
| Auth/DB | Clerk-gated production by default; localStorage persistence today; Neon Postgres planned |
| Export | Hardened Puppeteer PDF route; client PDF fallback via html2canvas + jsPDF; in-repo DOCX writer; ZIP export packs |

## Running locally

```bash
# Install
npm install

# LLM key — copy and fill in ANTHROPIC_API_KEY
cp .env.example .env.local

# Dev server (Vite on port 5273 by default)
npm run dev
```

Open <http://localhost:5273>.

### Environment

```env
# Required
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Optional
LLM_MODEL=claude-sonnet-4-6  # allow-listed: claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
VITE_ALLOW_PUBLIC_APP=false
```

A user can also pick the model at runtime via Settings → "Generation model". The choice is sent in the request body, validated by the server allow-list, and takes precedence over the env default. `ANTHROPIC_API_KEY` is required server-side for AI generation; do not commit provider keys or expose them through `VITE_*` variables.

Local dev can run without Clerk. Production fails closed if `VITE_CLERK_PUBLISHABLE_KEY` is missing; set `VITE_ALLOW_PUBLIC_APP=true` only for an intentional public demo.

### Security Notes

- Rotate any provider key that was ever committed or shared in git history.
- Production API routes use JSON-only request parsing, size limits, same-origin checks, no-store/nosniff responses, and lightweight per-IP rate limits.
- Server-side PDF export disables JavaScript, blocks external network requests during render, injects a restrictive CSP, and sanitizes output filenames.
- User-controlled HTML is sanitized before preview/export; accepted AI proposals are sanitized before they become canonical section HTML.
- Image embeds are limited to base64 PNG/JPEG/WEBP/GIF. SVG and remote images are rejected or ignored across upload, preview, and export paths.

## Project layout

```
api/                          # Vercel functions
  draft.ts                    # /api/draft — section-streaming SSE
  agent.ts                    # /api/agent — AI SDK UIMessage stream for the right-rail chat
  _utils/                     # JSON guards, same-origin checks, rate limits
server/
  proxy.ts                    # Vite dev handlers for /api/draft and /api/agent
  llm-model.ts                # shared model allow-listing + Anthropic key requirement
  agent-tools.ts              # server-side AI SDK tool schemas
dev/qwen-proxy-plugin.ts      # Vite middleware that mounts /api/* in dev
src/
  components/
    ds/                       # design-system primitives (BrandMark, Avatar, PageHeader,
                              # DataTable, StatusDot, ImageUploader, EmptyState, Wordmark)
    editor/                   # section editor, AIPanel (full-rail), FloatingCommentPanel,
                              # CommentsPanel, TimelinePanel, MobileBottomSheet,
                              # refine popover, edit-details sheet, RightRail wrapper
    ui/                       # shadcn primitives (kept where useful)
  lib/
    letters/
      catalog/                # 35 letter-type definitions, employer + employee
      templates/              # 70 (letterType × UK|US) gold-standard scaffolds
      questions/              # wizard schemas
    llm/
      client.ts               # browser → /api/draft helper (SSE)
      draft.ts                # generate / regenerate orchestration
      agent.ts                # agent system prompt
      tools.ts                # client-side clause template metadata
    prompts/                  # buildSystemPrompt / buildSectionPrompt
    evidence.ts               # evidence filtering + prompt rendering
    template-quality.ts       # section requirement and compliance quality report
    timeline.ts               # derived + stored draft activity feed
    store.ts                  # drafts (Zustand persist, sanitizes accepted AI HTML)
    profile.ts                # user profile (Zustand persist, safe image defaults)
    safe-data-url.ts          # shared base64 image data URL validation
    tiptap/comment-mark.ts    # custom Tiptap mark for inline comments
  routes/                     # Home, BrowseLetters, Wizard, Editor, Settings, Calendar, etc.
public/
  design-system.html          # canonical design tokens + page templates (static)
  regenerate-options.html     # UX proposal for refine + AI chat patterns (static)
```

## Architecture pointers

- **Letter generation = template + LLM.** `buildSectionPrompt` prefers a curated template (statutory anchors, structural scaffold, MUST / MUST NOT constraints, worked example) when available, falling back to a generic instruction. The template addendum is appended to the master system prompt. This is what makes the output consistent across sessions and legally fenced.
- **AI agent uses SDK-native tool-calling.** Server-side tool schemas live in `server/agent-tools.ts`. The right-rail agent can propose `regenerateSection`, `addClause`, `tightenSection`, and `summariseForCounsel`. Mutating tools are *human-in-the-loop*: no server-side `execute`, so the model's call streams to the client as a `tool-*` part. The user reviews and clicks Apply; the client runs the change and calls `addToolResult` so the model sees the outcome and can continue.
- **Evidence is scoped before prompting.** Evidence items live on the draft, can be linked to specific section ids, and are filtered into the system, section, and agent prompts so the model sees the right supporting facts without dumping unrelated attachments into every section.
- **Model selection is centralised.** `server/llm-model.ts` owns the allow-list, env default, and `createAnthropic` construction. Browser settings still send a preferred model, but the server validates it against the allow-list. `ANTHROPIC_API_KEY` is required server-side and missing keys fail closed.
- **Persistence is local.** Drafts, comments, collaborators, AI chat history all live in `localStorage` via Zustand `persist`. Production route access is Clerk-gated by default, but multi-device / shared collaboration still needs the planned server persistence layer.
- **Rendering boundaries are defensive.** Paged preview/edit, PDF export, DOCX export, Markdown rendering, and pending AI proposals all pass through sanitization or safe data-URL checks before content becomes visible or canonical.

## Disclaimer

This tool drafts HR correspondence with an LLM. The generated content is not legal advice and should be reviewed by qualified HR or employment-law counsel before issuance — especially for high-risk letters (termination, redundancy, settlement, immigration). Tribunal-bound letters carry the additional risk that anything in the draft may later be disclosed in proceedings.

See [`CHANGELOG.md`](CHANGELOG.md) for the release history.
