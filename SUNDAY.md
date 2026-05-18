# Sunday — DraftHR open inventory

> **What this file is.** A single canonical list of every decision, parked
> feature, locked principle, and migration trigger we've accumulated across
> the build. Tick things off as they're done. When this file gets stale,
> fold the still-open items into `ROADMAP.md` Section 12 and reset.
>
> **Last refreshed:** 2026-05-17 (commit TBD)
> **Companion files:** `ROADMAP.md` (long-form strategy) · `CHANGELOG.md`
> (what shipped) · `public/mockups/` (HTML mockups for parked decisions)

---

## A · Decisions still open (need your call before we build)

These have mockups or designs but no choice made yet. Marketing direction
is the biggest one — it gates a lot of other work.

- [ ] **Marketing page approach** — pick one of three:
  - in-app card (`public/mockups/marketing-1-single-card.html`)
  - `/welcome/{hr,employee}` tabs (`public/mockups/marketing-2-welcome-pages.html`)
  - full standalone `drafthr.io` site (`public/mockups/marketing-3-marketing-site.html`)

  *When to decide:* before public launch / first paid ad.

- [ ] **Employee checkout softeners** — pick zero, one, or both:
  - 30-sec product preview before pay (`public/mockups/employee-onboarding-preview.html`)
  - 24h money-back guarantee (`public/mockups/employee-onboarding-refund.html`)

  *When to decide:* when wiring the Employee Stripe checkout flow.

- [ ] **Custom WorkOS auth UI vs AuthKit hosted** — keep hosted for now.
  *Trigger to revisit:* first Enterprise customer complains about the
  `*.authkit.app` redirect.

- [ ] **Marketplace consultant identity tier** — same WorkOS Project
  (Option B, current) vs separate Project (Option A).
  *Trigger to revisit:* the day the first marketplace consultant signs up.

- [ ] **Bun runtime vs Node** on Vercel functions.
  *Trigger to revisit:* if we hit a cold-start issue Node can't solve.

- [ ] **Vercel Pro upgrade** (£16/mo per seat).
  *Trigger to revisit:* when the 12-function Hobby cap bites again OR the
  first paying customer (whichever first).

---

## B · Locked principles (decided, no re-debate)

These are reference-grade — don't relitigate without strong evidence to
the contrary. Copy them into every relevant agent prompt so they stay
honoured.

- **Pay from the jump.** No free trials. HR captures card during plan-pick;
  Employees pay before drafting. Money in week 1.
- **Role locked at signup.** Different role = different account. No flip
  in Settings without admin reset + warning. Keeps Stripe + RBAC + audit
  consistent.
- **Seat counts** — Pro = 1 · Business = 5 · Enterprise = unlimited.
  Matches `ROADMAP.md` Section 2 pricing.
- **AuthKit hosted + custom domain `auth.drafthr.io`.** Don't rebuild auth
  UI from scratch until concrete pressure exists.
- **Light theme only.** Dark mode had contrast bugs in editor + AI rail;
  needs a proper token pass before resurfacing.
- **`app.drafthr.io` is the app, `drafthr.io` is marketing.** No marketing
  card on app subdomain — auto-redirect logged-out users to sign-in.
- **All AI = Anthropic direct + native prompt caching.** NOT Vercel AI
  Gateway yet (lower TCO at our scale, simpler ops).
- **Vercel Blob for letterhead/sig images.** NOT S3 KMS yet (migrate when
  SOC 2 audit starts).
- **Resend for transactional email.** NOT SES yet (migrate at >500k/mo
  per roadmap).

---

## C · Features parked (need building, no design questions outstanding)

### Revenue-generating (highest priority once payment design unparks)

- [ ] **Stripe checkout for plans** (PAYG / Pro / Business / Enterprise) —
  currently zero revenue. Blocks on onboarding-funnel design (Section A).
- [ ] **Stripe Connect Express for marketplace** — 20% take on consultant
  bookings. Needs 2-week Adyen comparison FIRST per roadmap.
- [ ] **AI critique credits** in-app purchase — 97% gross margin per
  roadmap. Needs Stripe wired.
- [x] **Branded export footer** ("Drafted with DraftHR · drafthr.io").
  ~1 hour build. Independent of payment. Calendly-mechanism.
  *(Shipped 2026-05-18, commit `3438298` — 3-layer toggle (env / plan /
  user); free tenants see it by default; paid plans auto-suppress when
  billing ships; one-helper-many-surfaces pattern; 12 new tests.)*

  **Layered toggle — future wiring (helper already accepts these fields):**
  - [ ] **Per-tenant paid-plan suppression** — when Stripe + `tenants.plan`
        column land, fetch the tenant's plan in `letterBodyHtml()` /
        `buildDocxBodyHtml()` and pass `tenantPlan` to
        `brandedExportFooterHtml({ tenantPlan })`. Anything other than
        `'free'` auto-suppresses. **Blocked on:** Stripe checkout + plan
        column. ~30 min wire-up once those exist.
  - [ ] **Per-user Settings opt-out** — add `profile.exportFooter: boolean`
        (default `true`) to `useProfileStore` + a toggle in `/settings` +
        pass `userOptOut: !profile.exportFooter` to the footer helper.
        **Intentionally NOT built for free tier** — defeats the Calendly
        virality. **Recommended gating:** only show the toggle to users on
        a paid plan (Pro/Business/Enterprise). **Blocked on:** plan
        column existing. ~30 min wire-up after that.

  Both wirings share the same plan-column prerequisite, so a single
  Stripe + plan wave unblocks them together.
- [ ] **Employee Plus subscription £99/mo** — multi-month tribunal LTV.
  Needs Stripe subscriptions.
- [ ] **Case Packs** (Grievance £69 / Settlement £119 / Tribunal Prep £249)
  — bundled SKUs, higher conversion.

### Product completeness

- [ ] **Suggestion-mark consumer surfaces #2-#4** — consultant track-changes
  view, richer threaded comments, future co-edit cursors. Primitive shipped
  in 0.9.0; only the AI inline-diff surface (#1) cashes it in so far.
- [ ] **Mobile read-only view** (`/m/<draftId>`) — Persona D requirement.
- [ ] **HRIS integrations** — BambooHR first, then Workday / Personio.
  Persona D table-stakes.
- [ ] **Tribunal calendar with email/SMS reminders** — Employee
  differentiator.
- [ ] **Real-time presence / cursors** — Y2, Liveblocks/Yjs.
- [ ] **Onboarding tour** — Joyride-style first-run. Activation lift.
- [ ] **/reports v2** — drill-down + per-employee analytics. Current v1 is
  workspace-level only.

### Compliance / legal moat

- [ ] **DPA + RoPA + sub-processor list + DPIA** — counsel-led, ~£15-25k
  one-off. Required to sell to UK/EU.
- [ ] **Drata SOC 2 monitoring** — ~£5-10k/yr. First Enterprise prospect
  will ask.
- [ ] **Fractional DPO retainer** — ~£1.5-3k/mo. Required at UK GDPR scale.
- [ ] **KMS-backed Ed25519 signing of `manifest.sig`** — full PAdES-B-T
  (TSR embedded in PDF as signed attribute, not side-channeled in headers).
- [ ] **WorkOS Audit Logs integration** — complementary to our hash chain;
  Enterprise asks for both.
- [ ] **WorkOS Directory Sync / SCIM** — Persona D requirement
  (Okta / Entra ID auto-provision).
- [ ] **Custom WorkOS domain `auth.drafthr.io`** — 5-min config; cheap
  brand polish; locked-in per Section B.

### Growth

- [ ] **35 SEO landing pages** (one per letter type) — "non-negotiable Q3
  build" per roadmap. Free organic. Compounds for 5 years.
- [ ] **drafthr.io marketing site** — doesn't exist. Where the SEO pages
  would live. Gates on Section A marketing-approach decision.
- [ ] **CIPD partnership** — founder outreach. Defer to Y2 unless inbound.

### Persistence — next waves after current dual-write

- [ ] **Dual-write rollout waves 2-6** — matters, employees,
  custom_templates, comments, evidence, approvals. Dual-write
  infrastructure is on; only drafts + sections currently cloud-syncing.
- [ ] **Read-from-Postgres** — after dual-write soaks for a week+.
  Unlocks multi-device sync.
- [ ] **localStorage → Postgres backfill utility** — for existing users
  when dual-write spreads beyond drafts.

### Small / one-session items (good for any spare slot)

- [ ] **Set up Resend API key in Vercel env** — workspace invites stop
  being copy-link-only.
- [ ] **Set up Vercel Blob `BLOB_READ_WRITE_TOKEN`** — letterhead/sig
  images stop falling back to base64-in-localStorage in production.
- [ ] **Suggestion-mark archive cleanup** — delete
  `archived/paged-editor-selection-fixes/` if disk hygiene matters
  (32 KB; all 4 bugs already fixed in main per Codex audit).

---

## D · Migration triggers — when to switch infrastructure

These come from `ROADMAP.md` Section 10. Don't migrate proactively — wait
for the trigger to fire.

| Current | Migrate to | Trigger |
|---|---|---|
| Anthropic direct | Anthropic via Vercel AI Gateway | When we want failover to OpenAI / cross-provider analytics |
| Vercel Blob | S3 + KMS (eu-west-2 + us-east-1) | SOC 2 Type II audit needs BYO encryption keys OR Vercel Blob bill > £50/mo |
| Resend | SES | > 500k transactional emails/mo |
| Neon Pro | Aurora Postgres multi-region | First Enterprise SAML deal OR 50k MAU OR connection-pool exhaustion |
| Single-region | Multi-region | First EU customer with residency clause in DPA |
| Vercel Functions | AWS Lambda direct (Puppeteer escape hatch only) | PDF export p95 cold start > 30s at >100 exports/day |
| pgvector on Neon | Turbopuffer | 10M vectors stored OR 100 QPS sustained |
| Vercel Hobby plan | Vercel Pro ($20/mo) | When 12-function limit bites OR first paying customer |
| Clerk (planned) | WorkOS ✅ | ~~Already migrated.~~ |

---

## E · Today's wins (Sunday session, 2026-05-17)

Tick what we ship today.

### Shipped already today

- [x] Codex adversarial security review (6 HIGH + 2 MEDIUM findings, all fixed)
- [x] Workspace UI polish — real sign-out + light-mode lock + auto-redirect
- [x] Stepper paged-editor patch archived (Codex audit confirmed all 4 bugs already fixed)

### Aiming to ship today (pick from C, small/one-session column)

- [x] **Branded export footer** shipped (commit `3438298`) — virality
  channel turned on; toggle-aware so paid plans auto-suppress later.
- [x] **Paged-editor selection / undo / cursor / toolbar fixes** shipped
  (commit `2d165da`) — 4 HIGH bugs that were live in production until
  today. Same scope as the archived stepper patch; the patch's
  "historical only" verdict turned out to be wrong (Codex audit
  hallucinated line citations). Archive README updated to reflect
  reality.
- [x] **Dual-write UUID bridge** shipped (commit `8581d71`) — every
  existing local draft has a readable id like `draft_abc_123`, but
  Postgres wants UUIDs. New `toServerUuid()` deterministically hashes
  legacy ids to stable UUIDs so dual-write actually works for users
  with legacy data, not just newly-created drafts.

---

## How to use this file going forward

1. **At the start of a session:** open `SUNDAY.md`, scan Sections A + C,
   pick what to work on, add it to Section E.
2. **When a parked item gets a decision:** move it from A to B (now locked)
   or strike it from A (decided not to build).
3. **When something ships:** check the box in C and add a one-liner to E.
4. **When the file gets noisy:** fold still-open items into `ROADMAP.md`
   Section 12 and start a fresh `SUNDAY.md` for the next session-day.
