# Changelog

All notable changes to DRAFTHR. Newest first. Dates are commit dates.

## 0.8.0 — 2026-05-15

The defensibility release. Three structural moves: a Business-tier approval
workflow with workspace roles, an editor wave that wires the Employees
directory and Custom Templates directly into draft authoring, and the audit
moat — a hash-chained append-only event log running live against Neon
Postgres. The third one is the structural moat for tribunal defensibility:
any retroactive edit to an audit row breaks the chain at that row and every
row after it, detectable in milliseconds.

### Approval queue + workspace RBAC (Business-tier)

- State machine on every draft: `draft` → `in_review` → `approved` |
  `changes_requested`. Each transition appends an `ApprovalEntry` to
  `draft.approvals[]` plus a corresponding timeline event for the
  Activity feed.
- `WorkspaceRole` on profile (`owner` / `admin` / `drafter` / `reviewer`
  / `viewer`). `src/lib/permissions.ts` centralises the role checks
  (`canApprove`, `canSubmitForReview`, `canEditDraft`) — no inline role
  conditions scattered through UI.
- Editor topbar gains a colored status pill (muted / amber / green /
  red) and a File-menu surface for the four review actions: Submit for
  approval, Withdraw, Approve, Request changes.
- During `in_review` AND when the current role can approve, the editor
  canvas locks read-only with an explanatory banner. Approved drafts
  also lock — they're shippable artefacts.
- `changes_requested` unlocks the editor for the author and surfaces a
  feedback panel showing the reviewer's verbatim note + a one-click
  Re-submit CTA.
- New `/approvals` page lists in-review drafts with mode/search/sort
  filters; HR sidebar gets an "Approvals" nav item with a count badge.
- Home Today panel surfaces in-review drafts to reviewer-capable roles
  so they're seen alongside calendar work.
- Settings → Workspace card with a role picker for the local
  single-user case (lets you simulate the reviewer side for screencasts
  and demos).

### Editor wave (employee prefill + templates from scratch)

- **`Draft.isTemplateSource` + `Draft.templateSourceId`** — additive,
  no store-version bump.
- HR-mode wizard gains a "Pick from your employees" affordance on the
  employee-details step. Selecting populates legalName, jobTitle,
  department, email, startDate, and stamps `answers.linkedEmployeeId`.
- Editor topbar renders a **Matter breadcrumb** (with status colour
  dot, linking to `/matters/<id>`) and an **Employee chip** with a
  popover that links to the employee profile. Both desktop-only.
- **"New template" button** on the My Templates tab + empty-state
  callout. Opens `NewTemplateModal` (name, description, base letter
  type, jurisdiction), then spawns a template-source draft and lands
  the user in the editor.
- Editor in template mode: swaps the Review CTA for **"Save template"**,
  shows a "Editing template: …" banner with Discard, and hides the
  redundant File → "Save as template…" item.
- "Save template" creates or updates the linked `CustomTemplate` in
  place. Re-saves stay on the same row — no duplicates on every save.
- Template-source drafts filtered out of every regular draft surface:
  Home, MattersIndex, MatterDetail, EmployeesIndex, EmployeeDetail,
  AppSidebar, SearchPalette, NotificationsBell, Notifications,
  Activity, Exported, Calendar, Approvals, ModePicker.

### Persistence — Drizzle + Neon Postgres + audit hash chain ★

- Full Drizzle schema landed live in Neon (eu-central-1, Frankfurt):
  `tenants`, `users`, `employees`, `matters`, `matter_participants`,
  `drafts`, `sections`, `section_versions`, `comments`, `evidence`,
  `custom_templates`, `approvals`, `audit_events` — 13 tables, FKs,
  indexes.
- `@neondatabase/serverless` driver — best cold-start behaviour on
  Vercel functions.
- `audit_events` table is the moat. Each row carries `prev_hash` +
  `row_hash` where `row_hash = sha256(prev_hash || ':' ||
  canonical_json(payload) || ':' || kind || ':' || subject_id ||
  ':' || created_at_epoch_ms)`. Hash chain is per-tenant; genesis
  prev_hash is 64 zeros. UNIQUE constraint on `(tenant_id, row_hash)`,
  INDEX on `(tenant_id, created_at DESC)`, CHECK that row_hash is 64
  hex chars.
- `src/db/audit.ts` — `appendAuditEvent()` runs SELECT-previous-then-
  INSERT inside a Drizzle transaction so concurrent appends can't race.
- `src/db/audit-verify.ts` — `verifyAuditChain(tenantId)` walks every
  row in order, recomputes each hash, returns the first mismatch.
  Tribunal demo: prove the chain holds, or pinpoint exactly where it
  was tampered.
- `scripts/db-verify.ts` — live test harness: lists tables, inserts a
  test tenant, appends 3 events, verifies clean, tampers with a row,
  verifies it now breaks, cleans up. Run via `npx dotenv -e .env.local
  -- npx tsx scripts/db-verify.ts`.
- First end-to-end caller: `api/export/pdf.ts` appends a
  `draft.exported` audit event with the rendered PDF's SHA-256 + the
  reviewer's attestation. Wrapped in try/catch — **PDF export does NOT
  fail if Postgres is down**. Defensive degradation.
- `DRAFTHR_DUAL_WRITE` feature flag (default `false`) gates future
  table-by-table dual-write rollout. Drafts → Postgres, then matters,
  then employees, etc. — one wave per table family, easy to roll back.
- `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` for migrations
  (DDL + advisory locks need the direct connection — pooler can't
  expose them). Runtime queries from API routes use the pooled
  `DATABASE_URL`.

### Config + tooling

- `.env.example` documents `DATABASE_URL` (pooled, runtime),
  `DATABASE_URL_UNPOOLED` (direct, migrations), `DRAFTHR_DUAL_WRITE`,
  and `DRAFTHR_DEFAULT_TENANT_ID` (single-tenant local dev tenant).
- `tsconfig.{app,node}.json` updated to include `src/db/` and
  `scripts/`.
- Migrations committed under `drizzle/migrations/` for replayability.

Operational note: dual-write stays off; localStorage remains the source
of truth until you flip the flag. The PDF-export audit event is the
only path that touches Postgres in default config — and it degrades
gracefully if the DB is unreachable.

## 0.7.0 — 2026-05-15

HR/Management portfolio release. DraftHR's HR mode flips from "single-letter
authoring app with a thin Matter wrapper" to a portfolio workbench: a real
Employees directory, expanded Matters with type / risk band / participants /
tasks / events, a Today + Risk + Compliance triptych dashboard, CSV-driven
bulk operations with mail-merge economics, and workspace-saved custom
templates. Plus Anthropic native prompt caching on the AI routes for a ~90%
input-token discount on repeat calls.

### Portfolio dashboard (HR mode)

- New HR-mode Home: Today (open tasks + matter next-actions due in 7d),
  Risk register (heatmap across active matters + £ exposure), Compliance
  Health (rolled-up health-check scores). Replaces the prior `Home` for
  employer mode; employee mode keeps the existing single-letter UX.
- Recent activity feed flattens every draft's timeline across the workspace,
  sorted by recency.
- Employee backfill banner — when HR has drafts but the normalised employee
  directory is empty, a banner offers one-click migration: scans every
  draft, groups by normalised legal name, and creates one Employee record
  per unique person. Dismissable; remembered locally.
- Risk panel now shows the heatmap whenever there are active matters, not
  only when exposure is tagged. Reads true out of the box.

### Employees directory

- `/employees` — sortable directory with search, status filter
  (active / notice / on-leave / left), and a multi-select import flow that
  derives Employee suggestions from existing HR-mode drafts. New
  `src/lib/employees.ts` helpers: `deriveEmployeesFromDrafts` (normalises
  legal name to dedupe across drafts) + `matchEmployeeForDraft`.
- `/employees/:employeeId` — profile with Active matters / Letter history /
  Notes tabs, EmployeeForm modal for create/edit, archive flips status to
  "left" without breaking historical draft links.
- New sidebar entries in HR mode: Employees, Bulk operations.

### Matters — case-management expansion

- `Matter` type extended (backwards-compatible — every new field optional):
  `type` (investigation / grievance / disciplinary / performance / absence /
  redundancy / restructure / settlement / tribunal / onboarding /
  offboarding / other), `riskBand` (low / moderate / high / critical),
  `participants[]` (subject / manager / accused / complainant / witness /
  representative / other), `ownerUserId`, `nextAction`, `exposureGBP`.
- New `Task` + `MatterEvent` types with store slices and CRUD actions —
  meetings, hearings, deadlines, sub-tasks on a matter calendar.
- MatterDetail surfaces: MatterRiskBadge, NextActionBanner, MatterParticipants,
  MatterTasks (inline add form), MatterCalendar.
- **Auto-derive risk band** (new `src/lib/matters/risk.ts`): pure derivation
  from health-check signals across the matter's drafts. Compliance + PII
  fails dominate; matter type nudges the floor up (tribunal/settlement
  start at "high"). Manual `matter.riskBand` still wins — derivation is
  the fallback. Used by the dashboard Risk panel and the MatterDetail
  badge so the heatmap is meaningful even with zero manual tagging.

### Bulk operations (Business-tier feature)

- `/bulk` — 4-step CSV → batch drafts flow: pick operation → pick template
  → upload CSV → preview rows → generate → results.
- **Mail-merge economics**: ONE AI call drafts a template with
  `{{placeholder}}` tokens for every CSV column, then client-side
  substitution produces N personalised drafts per row. 50-row batch =
  ~£0.20 instead of ~£10 (a 50× call-N-times approach).
- New `src/lib/bulk/mailmerge.ts`: case-insensitive whitespace-tolerant
  `{{placeholder}}` substitution, `findUnresolvedPlaceholders` to surface
  amber-dot rows that need attention, `placeholderKeysFor` to derive
  expected placeholders from letter type × CSV headers,
  `buildMergeInstruction` to augment the system prompt, abort-signal
  support for cancel.
- 25 unit tests cover the substitution + placeholder-detection edge cases.

### Custom templates (workspace-saved house phrasings)

- New `CustomTemplate` type + `customTemplates` store slice with four CRUD
  actions: `createCustomTemplate`, `updateCustomTemplate`,
  `deleteCustomTemplate`, `createDraftFromCustomTemplate`.
- `BrowseLetters` (`/hr/new`, `/me/new`) gains a tab strip: **DraftHR**
  (the existing 35 built-in letter types, unchanged) and **My Templates**
  (workspace-saved). Mode-scoped end-to-end.
- Editor File menu → **Save as template…** captures the current draft's
  per-section HTML (keyed by canonical `SectionId`) plus its answers.
- Starting a draft from a custom template spawns the base letter type's
  sections pre-filled with the saved HTML (status `"edited"`), saved
  jurisdiction default applied.
- Persisted via the existing Zustand `persist` middleware — no version
  bump on `scribehr-store-v1` (field-additive).

### LLM cost levers

- **Anthropic native prompt caching** on `/api/draft` + `/api/agent`.
  Stable system prefixes tagged via `providerOptions.anthropic.cacheControl
  = { type: "ephemeral" }`. ~90% input-token discount on repeat calls
  within the 5-minute TTL — the single biggest cost lever in the roadmap.
  Default behaviour byte-identical when no system prompt is present.
- `/api/draft` already accepts an optional `extraSystemHint` (used by the
  bulk mail-merge flow to instruct the model to emit `{{placeholder}}`
  tokens) — now also tagged for caching across a batch.

### Router + navigation

- New routes: `/employees`, `/employees/:employeeId`, `/bulk`,
  `/matters`, `/matters/:matterId`.
- `AppSidebar` HR-mode nav extended with Employees + Bulk operations
  entries.

## 0.6.0 — 2026-05-13

Security and export hardening release. This pass removes committed-secret
fallbacks, tightens every HTML/rendering boundary that handles HR/legal draft
content, and makes production deployments fail closed when authentication is
not configured.

### Security hardening

- Removed the hardcoded Anthropic API-key fallback from `api/draft.ts`,
  `api/agent.ts`, and `server/llm-model.ts`. `ANTHROPIC_API_KEY` is now
  required server-side and missing/empty values fail closed.
- Added shared API request guards under `api/_utils/`: JSON content-type
  enforcement, request-size limits, no-store/nosniff JSON errors,
  production same-origin checks, and lightweight per-IP rate limits for
  `/api/draft`, `/api/agent`, and `/api/export/pdf`.
- Production auth now fails closed if `VITE_CLERK_PUBLISHABLE_KEY` is absent.
  Public deployments require an explicit `VITE_ALLOW_PUBLIC_APP=true` opt-in.
- Added production security headers in `vercel.json`: CSP, no-sniff,
  frame denial, strict referrer policy, and a restrictive permissions policy.
- Limited the devtools feature-flag helper (`window.__drafthr`) to Vite dev
  builds only.
- Removed comment-author impersonation from the comments UI so new comments
  always use the current profile identity.
- Hardened Sentry event handling with defensive redaction of draft, section,
  prompt, message, evidence, profile, HTML, and comment-like context keys.
- Updated docs and changelog language so no committed text describes a
  server-side hardcoded key fallback.

### HTML, images, and paste safety

- Tightened `sanitizeLetterHtml`: script/event attributes are stripped,
  `target="_blank"` links get `rel="noopener noreferrer"`, unsafe link schemes
  are removed, and embedded images are restricted to base64 PNG/JPEG/WEBP/GIF.
- AI-generated proposed section HTML is sanitized before display and again
  when accepted into canonical draft state, including previously persisted
  pending changes.
- Added `safe-data-url` helpers and applied them across image upload, profile
  defaults, paged preview/edit rendering, evidence display, PDF export, DOCX
  export, and ZIP pack rendering. SVG/unsupported image data URLs are ignored
  even if they already exist in localStorage.
- Added file-size limits for profile JSON import and evidence uploads before
  reading files into memory/localStorage.
- Encoded `mailto:` invite recipients before building the fallback invite URL.

### Export hardening

- Replaced vulnerable export dependencies: removed `html-to-docx` and
  `html2pdf.js`; PDF fallback now uses `html2canvas` + `jspdf`, and DOCX
  generation uses the in-repo OOXML writer.
- Hardened the server-side Puppeteer PDF renderer: JavaScript disabled,
  external network requests blocked, CSP injected into the render document,
  body/HTML/filename limits enforced, render timeouts set, and response
  headers set to no-store/nosniff.
- Export pack generation now embeds sanitized PDF and DOCX outputs alongside
  evidence, manifest, audit JSON, and the human-readable pack summary.
- Added focused tests for DOCX image/list/table generation and store-level
  sanitization of accepted AI proposals.

### Dependency and runtime posture

- Added an npm override for the vulnerable transitive `esbuild` copy pulled
  through `drizzle-kit`; `npm audit --audit-level=moderate` is clean.
- Vite dev server now binds to `127.0.0.1` by default. Set
  `DRAFTHR_DEV_HOST=0.0.0.0` only when intentionally testing from another
  device on the same network.
- Removed Google Fonts loading from `index.html`; the app shell now uses the
  bundled `@fontsource-variable` assets.

Operational note: rotate/revoke any Anthropic key that was ever committed or
shared in history. The current tree no longer contains provider secrets, but
history exposure should still be treated as compromised.

## 0.5.0 — 2026-05-13

Pixel-perfect Edit-on-page. The previous V1 Edit-on-page was a single
continuous scrolling card with no real page boundaries — clean to type
in, but the user couldn't tell where their content would split when
printed. V2 keeps the same continuous editor but runs paged.js's
Chunker against a hidden off-screen render of the letter on every
debounced keystroke (350 ms) and overlays subtle "Page N · Page N+1"
strips at the exact y-positions where the printed letter would break.

Why the off-screen approach rather than rendering paged.js inline as
the editor: paged.js mutates its source DOM during pagination, which is
incompatible with a live TipTap editor that owns the same DOM. Two
trees solve the problem cleanly — TipTap is the typeable source of
truth, the off-screen Chunker is the break detector, the strips are
projection.

- Shared `paged-edit/printCss.ts` — A4 geometry + the @page CSS string
  + `wrapInPrintHtml()` used by both the read-only Preview and the new
  off-screen paginator.
- `paged-edit/offscreenPaginator.ts` — `paginate(html)` → `{pageCount,
  breaks[]}`. Mounts a hidden `visibility:hidden` host (NOT off-screen
  at -99999px, which confuses paged.js's column measurement and
  produces phantom pages — verified empirically), runs `Previewer`
  with the polisher so the embedded @page CSS is applied, scans each
  rendered page's clones for the last `data-paged-ref` to produce the
  page-end source ref.
- `paged-edit/usePageBreakPositions.ts` — debounced hook that stamps
  refs by index, calls `paginate()`, locates the live block in the
  editor and reads `bottom - editorRoot.top` to get the strip y-offset.
- `paged-edit/PageBreakOverlay.tsx` — slate strip + dashed borders +
  uppercase "Page N · Page N+1" label, `pointer-events: none` so the
  user types straight through.
- `paged-edit/PaginatedEditableLetterV2.tsx` — same TipTap editor +
  toolbar as V1 (factored into `editorShared.tsx`), wraps in a
  relative shell so the overlay layers correctly.
- `lib/flags.ts` — three-tier flag resolver (localStorage > VITE env
  > per-flag default). `pixelPerfectEdit` defaults to on; flip back
  with `window.__drafthr.setFlag("pixelPerfectEdit", false)` if a
  regression surfaces.

## [Unreleased]

Big rocks still to land — listed for reference, not yet shipped:

- Persistence layer (Clerk auth + Neon/Postgres) — currently localStorage only.
- Real transactional email for invites and comment notifications (mailto fallback shipped).
- Real-time presence / cursors on shared drafts.
- Onboarding walkthrough on first-run.
- Keyboard shortcuts for the most-used menubar actions (Regenerate, Tone, Refine) to compensate for the extra tap-depth introduced in 0.4.0.
- Test coverage for the new design-system primitives, AIPanel, RefinePopover, InvitePopover, EditDetailsSheet, FloatingCommentPanel, MobileBottomSheet.

---

## 0.4.0 — 2026-05-12

Editor restructure release. Two architectural moves — AI takes the full right rail, a top File/Tools/View menubar replaces the desktop icon toolbar — plus a full mobile polish pass and a sweep of feedback / empty-state / animation work. Provider also rotated end-to-end and settled on Anthropic Claude.

### Editor — Change A: right rail is AI-only

- Right rail collapsed to `AIPanel` at full rail height. No tab strip, no Comments / Timeline / Compliance competing for space. AI is the rail.
- New `FloatingCommentPanel` (portalled to `<body>`) anchors comment threads inline to the highlighted text mark — selection rect for new threads, `mark[data-comment-id]` for existing ones. Self-positions below the anchor, flips above when it would overflow, viewport-clamped, repositions on scroll/resize, dismisses on Esc / outside-click / X.
- "All comments" overview — a Radix Dialog launched from the Tools menu, lists every unresolved thread (and resolved separately). Click any row to scroll the canvas + open the floating panel anchored there.
- Timeline relocated to a Radix Dialog launched from the Tools menu.
- Compliance / Rights stays as the bottom of the LEFT rail's secondary tab.

### Editor — Change C: top File / Tools / View menubar

- Three labelled DropdownMenu triggers at the top-left of the topbar, just after the D brand mark. Conventional desktop menubar position. `md:+` only — mobile keeps the existing icon toolbar + ⋯ overflow.
- File → Edit details · Export… · Settings · Privacy & data.
- Tools → Regenerate all (or Stop) · Refine current section · Comments (count) · Timeline.
- View → Edit / Preview (✓) · Edit-on-page · Focus mode · (mobile-only: Sections rail · AI rail toggles).
- Retired from the desktop topbar: Tone icon, Regenerate icon, Edit-on-page icon, Focus icon, ⋯ overflow, ← Letters button. All available via the menus.
- D brand mark is now the single back/home anchor (links to `/hr` or `/me` based on `draft.mode`).
- Net: roughly half as many interactive elements in the desktop topbar, organised by intent.

### Mobile editor polish

- A4 paper in Preview now fits a 390px viewport via `zoom: 0.48` (CSS reflows naturally; iOS pinch-zoom still works for detail reads).
- Right rail replaced with a Framer Motion bottom sheet with three snap points (closed / half / full), drag-to-dismiss, momentum-aware release (flick-down closes, flick-up expands to full), and a tap-the-handle cycle (full → half → closed). Spring physics (stiffness 320, damping 38, mass 0.8) so the snap feels weighted.
- Floating "Ask AI" pill in the bottom-right corner — bottom-sheet trigger that's visible whenever the sheet is closed. Fades + scales away when the sheet opens.
- Selection bubble menu now passes `popperOptions` with `preventOverflow` boundary `'viewport'` + flip fallback placements so the "+ Comment" pill stays inside the viewport at any selection position.
- Comment coverage loop fixed — tapping an inline comment anchor now scrolls the mark to the top of the viewport (with ring flash), then opens the panel 120ms later so the user sees both contexts.
- SectionEditor card chrome stripped on mobile (`md:` and below) — drops the rounded border + header divider, shrinks padding from `px-7 py-5` to `px-3 py-3`. Sections separated by a single top hairline. Gains ~64px of horizontal writing surface.
- Modal/popover viewport caps — `InvitePopover` and `RefineDialog` clamp via `max-w-[calc(100vw-1.5rem)]`.

### Animations + transitions

- Sheet open/close transitions to/from `translate-y` via Framer Motion with a `cubic-bezier(0.32, 0.72, 0, 1)` iOS easing.
- Page-level cross-fade between routes — `AnimatePresence` wraps `<Routes>`, 180ms opacity + 6px Y slide on every route change. Editor routes exempted to avoid double-animation against their internal transitions.
- Bottom-sheet scrim cross-fades to 30% black opacity in parallel with the sheet slide.
- Floating Ask AI pill scales-down 90% + fades when the sheet opens so it doesn't peek through under the rounded sheet corner.

### Toasts + feedback

- New Sonner toast surface mounted once at the app root (top-right, theme-aware, richColors, swipe-dismiss + close button).
- Accept-all / reject-all of pending AI changes now emits a toast with **Undo** — snapshots the prior state (sections' html + pendingChange) and restores it via existing store actions.

### Empty-state polish

- New reusable `EmptyState` component in `components/ds/` — icon in a slate-200 circular backdrop, 15px medium heading, muted body (52ch max), optional primary + secondary CTAs.
- Swept five surfaces: Home (drafts + deadlines), Comments panel, Exported, Activity, Calendar. Each now points the user back to productive work — "Browse letters", "Start a letter", etc.

### AI panel polish

- Discoverable starter grid in the empty state — four cards, one per typed tool (regenerate / tighten / addClause / summariseForCounsel) with icon + bold label + one-line hint. Click hydrates the composer with the underlying prompt.
- New `Recent` row below the starter grid showing the last 5 submitted prompts (deduped, newest first, 5-cap). Persisted to `localStorage` via the new `recent-prompts.ts` helper.

### LLM provider

- Provider rotated through Qwen → Gemini → NVIDIA NIM → OpenRouter and settled on **Anthropic Claude only**. Default model is `claude-sonnet-4-6`; `claude-opus-4-7` and `claude-haiku-4-5` selectable from Settings.
- Removed dependencies: `@ai-sdk/google`, `@ai-sdk/openai-compatible`. Removed env vars: `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- `api/draft.ts` / `api/agent.ts` / `server/llm-model.ts` simplified to a single `createAnthropic` path with explicit `baseURL: 'https://api.anthropic.com/v1'` (the v3.0.76 SDK was calling `/messages` without the `/v1/` prefix and returning 404).
- `ANTHROPIC_API_KEY` is required server-side; empty or missing env vars now fail closed instead of falling back.
- `MODEL_OPTIONS` reduced to three Claude tiers with cost hints. Stale localStorage selections (Qwen / Gemini / NVIDIA / OpenRouter) auto-reset to the new default on next load.

### Streaming + output quality

- Throttled `editor.commands.setContent` to 60ms during streaming so the section editor doesn't reparse on every token — fixes the "5 words per line jitter" effect at 50+ tokens/sec.
- Post-stream sanitisation now strips any leftover `{{placeholder}}` tokens from the model output and replaces them with `[TBD]`. Triple defence (system-prompt rule + better model + sanitiser) against template variables leaking into the final letter.

### UI polish

- Wordmark letter-spacing increased from `0.01em` to `0.06em` for breathing room.
- BrandMark sized up on every surface (editor topbar 26 → 32, mobile topbar 28 → 34, sidebar already 40).
- Mobile sidebar sheet narrowed from `18rem` to `11.5rem`.
- Edit/Preview pill: only the active tab shows its label; the inactive collapses to icon-only.
- Wizard step → next-step button switched from "Next: Evidence/Review" to just "Evidence" / "Review" (the arrow already implies "next"). Icon-only on mobile.

### Fixes

- Vercel CI builds were failing every commit since the Home redesign — TypeScript errors in unused `ChevronDown` import, removed `QWEN_API_KEY` references in `server/llm-model.test.ts`, unused `warn` helper. All fixed; production deploy unblocked.

---

## 0.3.0 — 2026-05-11

Evidence and export-pack release. This adds the first real support for tribunal-style source material around a draft, with checks and exports that are useful before a letter is sent.

### Evidence & Attachments

- Added a dedicated post-drafting Evidence & Attachments screen for employee drafts.
- Evidence items can be typed or uploaded, labelled as email / calendar / document / screenshot / note, and linked to one or more letter sections.
- The editor now routes through `Next: Evidence` before review/export, keeping the right rail focused on AI, comments, checks, and timeline.
- Evidence items can be referenced in a section, quoted into a section, or inserted as an attachment list.
- Section headers show linked-evidence counts and a compact evidence strip, with a one-click path to the evidence step for that exact section.
- Linked evidence now flows into section generation, whole-letter system prompts, and the right-rail AI agent prompt.
- Evidence updates are recorded in the draft timeline for auditability.

### Template Quality Inspector

- Added section-by-section template requirement checks that surface hard `MUST` constraints, missing required content, manual-review items, and guardrails.
- The inspector is visible in the compliance rail and the employee rights/register rail.
- Compliance rules and template requirements now share one quality report that export packs can reuse.

### Export Pack

- Added an HTML export pack containing the final letter, evidence list, timeline, template quality report, and review checklist.
- Export packs are logged alongside PDF and DOCX exports.
- High-risk letters still require counsel-review attestation before any export format, including the pack.

### Versioning

- Bumped package version from `0.2.0` to `0.3.0`.

---

## 0.2.0 — 2026-05-11

Senior-dev cleanup release. No major UX redesign, but the AI/server internals are now smaller, clearer, and easier to maintain.

### AI/server architecture cleanup

- Centralised model allow-listing, provider fallback, and provider client construction in `server/llm-model.ts`.
- Added resolver tests covering allow-listed requests, env model fallback, and missing-provider-key failures (`server/llm-model.test.ts`).
- Moved server-side AI tool schemas into `server/agent-tools.ts`, shared by the Vercel `/api/agent` function and the Vite dev proxy.
- Slimmed `api/draft.ts`, `api/agent.ts`, and `server/proxy.ts` so they focus on request parsing and streaming instead of duplicating model/tool setup.

### Client bundle cleanup

- Reduced `src/lib/llm/tools.ts` to client-only clause template metadata and `ClauseType` definitions.
- Removed AI SDK server tool/schema imports from the browser path.
- Production build output now shows a smaller `ai-sdk` chunk after the split.

### Versioning

- Bumped package version from `0.1.0` to `0.2.0`.

---

## 2026-05-10

A single day of intense iteration after the v0.1 scaffold. The app went from a generic wizard with section-by-section generation to a full design-system-driven editor with inline comments, a typed AI agent, letterhead/signature exports, and the AI SDK v6 stack.

### Editor layout — sticky composer + sections (`227a65f`)

- Locked the editor route to viewport height (`h-screen h-dvh` + `overflow-hidden` on the editor wrapper in `Layout.tsx`). Previously `min-h-screen` allowed the outer page to grow with content, pushing the AI composer + sections list off-screen.
- `SectionsList` ScrollArea switched from `h-full` to `flex-1 min-h-0` so it derives a finite height from its flex parent.
- Effect: AI input is anchored at the bottom of the rail at any letter length. Sections list scrolls inside its column independent of the canvas.

### AI chat composer redesign (`8a88184`)

Modern unified-box style matching ChatGPT / Claude / v0 / Cursor:

- Single rounded container holds the textarea + bottom toolbar + send button. Focus ring on the container, not the textarea.
- Scope chips moved above the box as a small "Scope: …" row — they're context, not a control.
- Quick-prompt chips moved inside the box's bottom row (horizontal scroll if many).
- Send button moved inside the box (bottom-right, 28px). Stop button takes the same slot during streaming.
- Right rail width 420px → 380px.

### AI chat polish (`ed8b82d`)

- **Markdown rendering** — new `Markdown.tsx` (marked + DOMPurify with chat-bubble-scoped typography). Assistant replies now render bold, italic, lists, code, links, blockquotes correctly.
- **Bigger input** — rows=1 / 36px → rows=3 / 72px, max 200px. Hotkey switched to ⌘/Ctrl+Enter (Enter alone inserts a newline).
- **Wider rail** — 320px → 420px on lg+.
- **Sticky sections list (initial fix)** — aside now `flex flex-col overflow-hidden`.
- **`AI_MissingToolResultsError` fix** — pending tool-call parts are stripped from message history in `prepareSendMessagesRequest` before send. Orphan proposals no longer crash `convertToModelMessages`.
- **Regenerate-all + Stop** surfaced as a visible outline button in the topbar (was buried in the More menu).

### SDK-native v6 tool-calling (`b3ecd4e`)

Replaced the `<<APPLY>>` text-sentinel hack with a typed AI SDK v6 tool:

- New `src/lib/llm/tools.ts` with `regenerateSectionTool` — Zod input schema (`section_id`, `instruction`), no server-side `execute` so it's human-in-the-loop.
- Server registers the tool on `streamText({ tools: agentTools })`.
- Client receives `tool-regenerateSection` parts and renders a state machine (input-streaming → input-available → output-available) with Apply / Applied / Failed states.
- On Apply: client runs `regenerateSection()` then `addToolResult()` so the agent sees the outcome and can continue ("OK, want me to do the closing next?").
- Removed `parseAgentReply` and the `<<APPLY>>` sentinel parser entirely.

### Search + Letterhead + AI SDK v6 migration (`d9802af`)

- **Search palette** indexes section content (with snippets) and comment bodies in addition to drafts / catalog / pages. Hits navigate to `/editor/:id` and scroll to the matching section / comment.
- **Letterhead + signature image uploads** — new `ImageUploader` DS primitive with banner/signature aspect presets, 1 MB cap, base64 data-URL persistence. Settings → Your company exposes both. Letterhead saved on the profile auto-prefills into every employer draft, renders inline in `LetterPreview`, embeds in PDF + DOCX exports.
- **AI SDK v4 → v6 migration**:
  - `ai@^4.1.46` → `ai@^6`, `@ai-sdk/react@^3`, `@ai-sdk/openai-compatible@^2`
  - `CoreMessage` → `ModelMessage` everywhere
  - `maxTokens` → `maxOutputTokens`
  - `toDataStreamResponse()` → `toUIMessageStreamResponse()`
  - `pipeDataStreamToResponse()` → `pipeUIMessageStreamToResponse()`
  - `useChat` from `@ai-sdk/react`, using `DefaultChatTransport` with a `prepareSendMessagesRequest` that flattens v6 UIMessage parts back into role/content for the OpenAI-compatible endpoint
  - `convertToModelMessages` on the server so tool-call history rides along correctly

### Edit-details, counsel-review pill, compliance refresh, invite mailto, mobile pass (`d454ecb`)

- **Edit-details slide-over** — More menu → "Edit details" opens a right-side sheet for jurisdiction, region/state, worker class, tone band, dates, recipient + employer details. New `patchDraft` store action commits at Save.
- **Counsel-review status pill** in the topbar — green ✓ "Reviewed" once attested, amber ⚠ "Needs review" otherwise. Tooltip carries who/when. Icon-only on mobile.
- **Compliance panel refresh** — score header (N/M satisfied) tinted by pass rate, rules grouped by severity (required vs recommended), DS tokens throughout.
- **Invite mailto fallback** — "Email" button alongside "Add" in InvitePopover. Adds the collaborator AND opens the user's mail client with a prefilled invitation.
- **Mobile pass at 375px** — avatar stack visible, Invite collapses to icon-only, counsel pill collapses to icon-only with tooltip retained, topbar grid gap tightens.

### Edit / Preview parity (`573670a`)

Three real oversights closed:

- AI chat scope `selection` now actually captures `window.getSelection()` at submit and tags the message with the live quote + containing section id.
- Clicking inside a section in Preview sets `activeSectionId`, so AI scope `section` targets the section the user is looking at.
- Per-section hover overlay in Preview surfaces the same actions that exist on the SectionEditor header — ✨ Refine, ↻ History, 💬 Comment. New `RefineDialog` modal (Preview has no header to anchor a popover off).

### Invite popover; AI on useChat; right rail to 3 tabs (`c3fa3f3`)

- **Invite + avatar stack** both open the same `InvitePopover` anchored from the topbar. Combines invite form + role select + share link + roster.
- **Right rail dropped from 4 tabs to 3**: Compliance · AI · Comments. People moved to the popover.
- **AIPanel rewritten on `useChat`** from `ai/react` against new `/api/agent` endpoint returning the AI SDK data-stream protocol.

### Option A + Option B AI features (`dfeda9f`)

- **Option A — per-section Refine popover.** Regenerate button now opens a popover with textarea + 6 chip presets + "Plain regenerate" escape. `refineInstruction` plumbed through `regenerateSection()` → `buildSectionPrompt` as `USER REFINEMENT`, placed AFTER hard constraints. Previous draft passed as context.
- **Option B — right-rail AI chat tab.** New AI tab, scope chips (letter / section / selection), 4 quick-prompt presets, streaming via `/api/agent`, `<<APPLY>>` sentinel parsing into proposed actions (replaced in `b3ecd4e`).
- **Topbar layout restore** — Invite button back; secondary toolbar (Tone + WP) moved inside the main column so the right rail tabs sit flush with the topbar.

### Inline highlight cleanup + pastel avatars (`5011566`)

- `deleteComment` + `resolveComment` now strip the matching `<mark data-comment-id={id}>` from the section HTML so the inline highlight disappears with the thread.
- Pastel avatar palette (warm sand, soft blue, sage, lavender, rose, mist, peach, blush). New `--ds-av-fg` near-black ink so letters remain legible on the lighter tints.

### Inline commenting on the Preview canvas (`a110f84`)

- `LetterPreview` listens for text selection and surfaces a floating "+ Comment" button anchored above the selection.
- Comments anchor by string-finding the quoted text in the section's saved HTML and wrapping the first occurrence with `<mark data-comment-id="X">`. The Tiptap section editor picks up the highlight on its next `setContent`.
- Clicking a `<mark>` in the preview → right rail focuses the matching thread.

### Design system rollout (`754160c`)

New primitives in `src/components/ds/`:

- `BrandMark` (32px ink chip with serif "D" — replaces every ScrollText icon)
- `Avatar` + `AvatarStack` (single palette, deterministic seed, overflow chip)
- `PageHeader` (breadcrumb + close-X + serif title + lede + actions slot)
- `StatusDot` (status colour only on the dot, label stays neutral)
- `DataTable` (sticky header, ghost row hover, hideOn breakpoints, action column)

Tokens: new `--ds-*` namespace (canvas / surface / line / ink / body / muted / subtle / status / avatar). Mirrored from `/public/design-system.html`.

Adopted across: Editor (single header), AppSidebar, Layout MobileTopbar, Home / BrowseLetters / Settings / Calendar / Activity / Notifications / Exported (PageHeader); Home drafts + Exported list (DataTable + StatusDot); CollaboratorsPanel + CommentsPanel (DS Avatar); SectionsList (DS tokens).

### Comments + collaborators + static design system (`0ef59b4`)

- **Threaded comments** anchored to sections, with optional inline text-range anchor via the custom Tiptap `CommentMark`. Selection in the editor triggers a BubbleMenu "+ Comment" button.
- **Collaborators** — invite by email + role (editor / reviewer / viewer), copyable share link.
- **Right-rail tabbed**: Compliance | Comments | People. Tabs replace the stacked panels.
- **Theme** — monochrome (Radix `accentColor="gray"`, `grayColor="slate"`), Source Serif 4 for marquee headlines.
- Static design-system reference at `/public/design-system.html`.

### DRAFTHR rename + 70 templates + qwen3-max + split preview (`d02f83a`)

- **Brand**: ScribeHR.io → DRAFTHR across user-visible strings. localStorage keys preserved.
- **70 letter templates**: 28 employer (14 letters × UK+US) + 42 employee (21 letters × UK+US), authored as gold-standard scaffolds with statutory anchors, hard MUST/MUST NOT constraints, worked examples. Tribunal-bound letters defensively drafted (Western Excavating affirmation guards, Cavendish Munro information-vs-allegation, Chesterton public-interest).
- **Prompt pipeline**: `buildSectionPrompt` prefers template scaffold + constraints + example, falls back to generic. `buildSystemPrompt` injects the template's `letterSystemAddendum`.
- **Default model `qwen-plus` → `qwen3-max`** (DashScope flagship). New "Generation model" selector in Settings wired Settings → profile store → API client → server with an allow-list.
- **LetterPreview** — paper-styled continuous render of the assembled letter, updates live as the model streams. Tri-state toggle (Edit / Split / Preview) in the editor action row.
- **Direct-to-template entry** — "Skip — use template" button on flagship cards when a template exists for the user's jurisdiction.
- **Mobile pass** — hamburger sidebar drawer, 44px touch targets, responsive padding across all routes.
- **Radix Themes** migration completed for all primary surfaces (routes + editor chrome).

---

## 2026-05-09

### Initial scaffold (`d0d3236`)

- Vite + React 19 + TypeScript skeleton
- 14 letter types (employer-mode) with wizard schemas
- Section-by-section Tiptap editor + per-section regenerate
- `/api/draft` SSE endpoint streaming from Qwen via DashScope
- Sentry + observability hooks
- shadcn/ui + Tailwind v4 + Radix Themes baseline

---

For commit-level detail run `git log --oneline`.
