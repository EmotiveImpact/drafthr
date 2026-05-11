# Changelog

All notable changes to DRAFTHR. Newest first. Dates are commit dates.

## [Unreleased]

Big rocks still to land — listed for reference, not yet shipped:

- Persistence layer (Clerk auth + Neon/Postgres) — currently localStorage only.
- Real transactional email for invites and comment notifications (mailto fallback shipped).
- Real-time presence / cursors on shared drafts.
- Onboarding walkthrough on first-run.
- Test coverage for the new design-system primitives, AIPanel, RefinePopover, InvitePopover, EditDetailsSheet.

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
- Added resolver tests covering allow-listed requests, `LLM_PROVIDER=claude`, env fallback, and missing-provider-key fallback (`server/llm-model.test.ts`).
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
