# DRAFTHR

AI-assisted HR letter drafting for the UK and US. Wizard-driven, legally aware, with a full-height right-rail AI agent that proposes section-level edits and inline floating comment threads anchored to the document text. Built on Vite + React 19 + TypeScript, AI SDK v6, and Anthropic Claude (`claude-sonnet-4-6` by default).

Two modes, two product surfaces:
- **Employee mode** — single-letter wizard for an individual handling their own grievance / resignation / flexible-working / tribunal claim.
- **HR/Management mode** — portfolio workbench: Employees directory, Matters with risk register, bulk CSV operations, workspace-saved Custom Templates, today/risk/compliance dashboard.

**Current version:** `0.13.0`

→ **Live design system:** [`/public/design-system.html`](public/design-system.html)
→ **Regenerate UX options:** [`/public/regenerate-options.html`](public/regenerate-options.html)
→ **Onboarding funnel mockups (parked, decision pending):** [`/public/mockups/onboarding-index.html`](public/mockups/onboarding-index.html)

---

## What it does

- **Portfolio dashboard (HR mode)** — Today / Risk / Compliance triptych: open tasks + matter next-actions due in 7d, risk register with £ exposure across active matters + a low/moderate/high/critical heatmap (auto-derived from health-check signals across each matter's drafts when no manual tagging exists), rolled-up compliance health. Recent-activity feed across the whole workspace.
- **Employees directory** — `/employees`, sortable + searchable, with status filter (active / notice / on-leave / left), one-click import from existing drafts (derives unique people by normalised legal name), per-employee profile with Active matters / Letter history / Notes tabs.
- **Matters as case files** — Matters carry type (investigation / grievance / disciplinary / performance / absence / redundancy / restructure / settlement / tribunal / onboarding / offboarding), risk band, participants (subject / manager / accused / complainant / witness / representative), tasks, calendar events, owner, next-action banner, and £ exposure. Auto-derived risk band falls back from health checks when not manually set.
- **Bulk operations** — `/bulk`, 4-step CSV → batch drafts flow with **mail-merge economics**: one AI call drafts a template with `{{placeholder}}` tokens for every CSV column, then client-side substitution produces N personalised drafts. 50-row batch ≈ £0.20 instead of ≈£10.
- **Custom templates** — `BrowseLetters` (`/hr/new`, `/me/new`) has a tab strip: **DraftHR** (the built-in 35 letter types) and **My Templates** (workspace-saved house phrasings). File → Save as template… in the editor captures per-section HTML + answers; starting a draft from a custom template spawns the base letter type's sections pre-filled.
- **Wizard → draft** — 35 letter types (14 HR-side, 21 employee-side), each with a UK and US template authored as a structured scaffold (statutory anchors, hard constraints, gold-standard examples). The model fills the scaffold using the user's wizard answers; output is HTML.
- **Per-section editor** — every letter is broken into sections (recipient, subject, opening, body, terms, closing, signature…). Each section regenerates independently, has version history, and can be refined with a freeform instruction ("more conciliatory; cite s.95(1)(c) ERA explicitly").
- **Two editing surfaces** — section-by-section editing for structured drafting, plus edit-on-page mode that renders real paged.js A4 cards and lets the user type directly on the paginated letter. Preview and edit-on-page share the same A4 print geometry and responsive mobile page scaling.
- **Top File / Tools / View menubar** on desktop — File (project), Tools (AI actions: regen / refine / comments / timeline), View (mode + display toggles). Mobile keeps the previous icon toolbar + ⋯ overflow.
- **Inline floating comments** — selection-triggered "+ Comment" (Tiptap BubbleMenu in the editor, floating button in the preview) opens a `FloatingCommentPanel` portalled to `<body>` and anchored to the highlighted text mark. Self-positions below the anchor, repositions on scroll, dismisses on Esc / outside-click. An *All Comments* dialog (Tools menu) lists every unresolved thread for sweep-before-export. Comments are persisted via a custom `CommentMark` Tiptap extension.
- **Right-rail AI agent** — full-rail-height, no tabs. Typed AI SDK v6 tool-calling: the agent can propose section rewrites, add named clauses, tighten a section to a word-count target, or produce a counsel-grade summary. Mutating calls stay human-in-the-loop: the user reviews each proposal with an Apply button before it commits, and successful applies push the outcome back to the agent. Empty state surfaces a starter grid (one card per typed tool) and a recent-prompts row backed by localStorage.
- **Evidence & Attachments step** — after drafting, add typed notes or uploaded files, link each item to the letter sections it supports, then reference, quote, or list those items in the letter before review/export.
- **Workspace collaborators + invites** — invite people by email + role, redeem invite links through WorkOS sign-in, and land directly in the accepted workspace. Workspace member management supports owner/admin/drafter/reviewer/viewer roles with owner-only controls for owner privileges.
- **Compliance + template quality inspector** — live per-clause pattern matches plus section-by-section template requirements, including hard "MUST" checks and guardrails. Tied to the counsel-review status pill in the topbar.
- **Letterhead + signature image uploads** — Vercel Blob-backed when configured, with data-URL fallback for local development. Uploads are same-origin/rate-limited, production-session guarded, and restricted to PNG/JPEG/WEBP/GIF byte signatures.
- **Export** — PDF (hardened server Puppeteer with client `html2canvas` + `jspdf` fallback), DOCX (in-repo OOXML writer), and a ZIP export pack bundling the letter, evidence, manifest, audit JSON, timeline, and review checklist. High-risk letter types gate behind a counsel-review attestation dialog.
- **Security posture** — production fails closed without WorkOS auth unless `VITE_ALLOW_PUBLIC_APP=true` is explicitly set; API routes enforce JSON/size/origin/rate-limit/session guards; rendered HTML is sanitized; embedded images are restricted to PNG/JPEG/WEBP/GIF.
- **Cmd+K search** — indexes drafts, letter catalog, section content (with snippets), comments, and route shortcuts.

## Tech

| Layer | What |
|---|---|
| Build | Vite 6, React 19, TypeScript |
| Styling | Tailwind v4, Radix UI Themes (`gray` / `slate`), Source Serif 4 for marquee, Geist for sans |
| State | Zustand stores (`useDraftStore`, `useProfileStore`, `useThemeStore`) persisted to localStorage |
| Editor | Tiptap section editor plus paged.js edit-on-page; native toolbar commands, undo/redo, cursor restore across reflow, Word-paste cleanup, oversized-block normalization, responsive A4 scaling, custom CommentMark |
| AI | AI SDK v6 (`ai@^6`, `@ai-sdk/react@^3`) + Anthropic Claude via `@ai-sdk/anthropic@^3` — Sonnet 4.6 default, Opus 4.7 / Haiku 4.5 selectable in Settings. Anthropic native prompt caching (`cacheControl: { type: "ephemeral" }`) on `/api/draft` + `/api/agent` stable system prefixes — ~90% input-token discount on repeat calls inside the 5-min TTL |
| Motion | Framer Motion 12 — bottom-sheet drag/snap on mobile, route cross-fade transitions |
| Toasts | Sonner (theme-aware, swipe-dismiss, Undo affordance on accept/reject pending changes) |
| Auth/DB | WorkOS-gated production by default; localStorage primary persistence with optional Neon/Postgres dual-write and workspace APIs |
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
VITE_WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_REDIRECT_URI=http://localhost:5273/auth/callback
WORKOS_COOKIE_PASSWORD=<32+ chars>
VITE_ALLOW_PUBLIC_APP=false
BLOB_READ_WRITE_TOKEN=
DRAFTHR_DUAL_WRITE=false
DATABASE_URL=
```

A user can also pick the model at runtime via Settings → "Generation model". The choice is sent in the request body, validated by the server allow-list, and takes precedence over the env default. `ANTHROPIC_API_KEY` is required server-side for AI generation; do not commit provider keys or expose them through `VITE_*` variables.

Local dev can run without WorkOS. Production fails closed if WorkOS is not configured; set `VITE_ALLOW_PUBLIC_APP=true` only for an intentional public demo.

### Security Notes

- Rotate any provider key that was ever committed or shared in git history.
- Production API routes use JSON-only request parsing, size limits, same-origin checks, no-store/nosniff responses, lightweight per-IP rate limits, and session/workspace guards for tenant-scoped mutations, AI generation, PDF export, and configured image uploads.
- Server-side PDF export disables JavaScript, blocks external network requests during render, injects a restrictive CSP, and sanitizes output filenames.
- User-controlled HTML is sanitized before preview/export; accepted AI proposals are sanitized before they become canonical section HTML.
- Image embeds are limited to PNG/JPEG/WEBP/GIF. SVG is rejected; configured uploads validate image byte signatures before storage.

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
    matter/                   # MatterRiskBadge, NextActionBanner, MatterParticipants,
                              # MatterTasks, MatterCalendar
    employees/                # EmployeeForm modal, ImportSuggestions panel
    templates/                # CustomTemplateCard, MyTemplatesGrid,
                              # SaveAsTemplateModal, RenameCustomTemplateModal
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
    bulk/
      mailmerge.ts            # {{placeholder}} substitution + ONE-AI-call orchestration
    matters/
      risk.ts                 # auto-derive RiskBand from health-check signals
    finalize/
      healthChecks.ts         # static + AI-ready letter health checks per draft
    prompts/                  # buildSystemPrompt / buildSectionPrompt
    evidence.ts               # evidence filtering + prompt rendering
    employees.ts              # deriveEmployeesFromDrafts + matchEmployeeForDraft
    template-quality.ts       # section requirement and compliance quality report
    timeline.ts               # derived + stored draft activity feed
    store.ts                  # drafts + matters + employees + tasks + events +
                              # customTemplates (Zustand persist, sanitizes AI HTML)
    profile.ts                # user profile (Zustand persist, safe image defaults)
    safe-data-url.ts          # shared base64 image data URL validation
    auth/                     # WorkOS-backed SPA auth provider + route guards
    tiptap/comment-mark.ts    # custom Tiptap mark for inline comments
  routes/                     # Home (HR triptych + Employee single-letter), BrowseLetters,
                              # Wizard, Editor, EmployeesIndex, EmployeeDetail,
                              # MattersIndex, MatterDetail, BulkOperations, Settings,
                              # Calendar, Finalize, ReviewStep, EvidenceStep, etc.
public/
  design-system.html          # canonical design tokens + page templates (static)
  regenerate-options.html     # UX proposal for refine + AI chat patterns (static)
```

## Architecture pointers

- **Letter generation = template + LLM.** `buildSectionPrompt` prefers a curated template (statutory anchors, structural scaffold, MUST / MUST NOT constraints, worked example) when available, falling back to a generic instruction. The template addendum is appended to the master system prompt. This is what makes the output consistent across sessions and legally fenced.
- **AI agent uses SDK-native tool-calling.** Server-side tool schemas live in `server/agent-tools.ts`. The right-rail agent can propose `regenerateSection`, `addClause`, `tightenSection`, and `summariseForCounsel`. Mutating tools are *human-in-the-loop*: no server-side `execute`, so the model's call streams to the client as a `tool-*` part. The user reviews and clicks Apply; the client runs the change and calls `addToolResult` so the model sees the outcome and can continue.
- **Evidence is scoped before prompting.** Evidence items live on the draft, can be linked to specific section ids, and are filtered into the system, section, and agent prompts so the model sees the right supporting facts without dumping unrelated attachments into every section.
- **Model selection is centralised.** `server/llm-model.ts` owns the allow-list, env default, and `createAnthropic` construction. Browser settings still send a preferred model, but the server validates it against the allow-list. `ANTHROPIC_API_KEY` is required server-side and missing keys fail closed.
- **Persistence is local-first.** Drafts, comments, collaborators, AI chat history all live in `localStorage` via Zustand `persist`; server dual-write can sync drafts into Postgres when enabled. Production route access is WorkOS-gated by default, but true multi-device collaborative editing is still future work.
- **Rendering boundaries are defensive.** Paged preview/edit, PDF export, DOCX export, Markdown rendering, and pending AI proposals all pass through sanitization or safe data-URL checks before content becomes visible or canonical.
- **Dual audit chains.** Every mutation appends a row to `audit_events` (hash-chained, per-tenant, tamper-evident — see `src/db/audit.ts`). When a tenant has `workos_org_id` set and `WORKOS_AUDIT_LOGS_ENABLED=true`, the same row is mirrored fire-and-forget to WorkOS Audit Logs so the tenant's SOC team can subscribe a SIEM. The local chain is the source of truth; the WorkOS mirror is a downstream sink. See `docs/audit-logs.md`.

## Audit Logs

DraftHR keeps **two** audit trails for every state change:

1. **Local hash-chained `audit_events`** (`src/db/audit.ts`). Per-tenant chain, per-row SHA-256 over `prev_hash || canonicalJson(payload) || kind || subject_id || created_at_epoch_ms`. Any retroactive edit breaks the chain at the edit point and every row after it — see `src/db/audit-verify.ts` for the walker.

2. **WorkOS Audit Logs mirror** (`src/lib/audit/workos-sink.ts`). Fired fire-and-forget after the local row commits. Off by default; flip on per environment with `WORKOS_AUDIT_LOGS_ENABLED=true`. Per-tenant gate: only tenants with `workos_org_id` set are mirrored. Cross-tenant safety: the writer resolves the org from the audit row's tenant id — clients never pass an org id.

### Field mapping

| DraftHR `audit_events` | WorkOS Audit Logs |
| --- | --- |
| `kind` (e.g. `draft.exported`) | `event.action` (e.g. `letters.draft.exported`) — see `mapKindToWorkOSAction` |
| `actor_user_id` + joined `users.email` / `legal_name` | `event.actor` (`type: "user"`, `id`, `name`, `metadata.email`); falls back to a `system` actor when null |
| `subject_type` / `subject_id` | `event.targets[0]` (`type`, `id`) |
| `created_at` | `event.occurred_at` |
| `payload_json` | `event.metadata` (clamped: 50 keys, 40-char keys, 500-char values) |
| `id` | `Idempotency-Key` header (24h dedupe window) |

Request IP / UA are passed through when the caller has them; absent IPs default to `0.0.0.0` because the WorkOS schema requires `context.location`.

### Toggling the mirror

```bash
# Per-deployment (all tenants):
vercel env add WORKOS_AUDIT_LOGS_ENABLED  # set to "true"
# Per-tenant (only mirror enterprise tenants):
update tenants set workos_org_id = 'org_xxx' where id = '...';
```

When both gates are off, the local chain still writes; nothing is sent to WorkOS.

### Backfilling historical events

After enabling the mirror, replay older rows with the CLI:

```bash
tsx scripts/backfill-workos-audit-logs.ts --since 2026-01-01
```

Safe to re-run — the `Idempotency-Key` is the local row id, so retries within 24h dedupe server-side. The script streams per-tenant for every tenant with `workos_org_id` set and logs progress every 25 rows.

### Verification

Settings → Audit Logs (admin-only) renders a status pill, the last successful mirror timestamp, an "Open WorkOS Admin Portal" link (`intent: audit_logs`), and a "Send test event" button that emits `audit.test_event` through `appendAuditEvent` end-to-end.

## Directory Sync (SCIM / Google Workspace)

Enterprise tenants can auto-provision DraftHR seats from Okta, Entra ID, Google Workspace, or any SCIM 2.0 directory. Webhook events from WorkOS land at `POST /api/workos/directory-webhook` (signature-verified via `WORKOS_WEBHOOK_SECRET`); each event upserts `users` + `tenant_members` and writes a `directory.user.*` row to the hash-chained audit log. Soft-delete on deprovisioning preserves audit history.

Admins see status + a one-shot "Open WorkOS Admin Portal" link at Settings → Directory Sync. Full operations guide in [`docs/directory-sync.md`](docs/directory-sync.md).

## Disclaimer

This tool drafts HR correspondence with an LLM. The generated content is not legal advice and should be reviewed by qualified HR or employment-law counsel before issuance — especially for high-risk letters (termination, redundancy, settlement, immigration). Tribunal-bound letters carry the additional risk that anything in the draft may later be disclosed in proceedings.

See [`CHANGELOG.md`](CHANGELOG.md) for the release history.
