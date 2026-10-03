# Production activation runbook

This is a historical activation checklist, not a production-readiness sign-off.
The statuses below describe the July 2026 implementation and have not all been
revalidated against the current deployment.

## Current cutover gate — 2026-09-27

**Do not execute the historical dual-write activation or rollback commands below
as the launch procedure for this checkout.** The current implementation uses the
coordinated database-first workspace, not the older optional browser mirror.
The current evidence and open requirements are in
[WORKSPACE-COMPLETION-PLAN.md](WORKSPACE-COMPLETION-PLAN.md),
[DATABASE-FIRST-MIGRATION.md](DATABASE-FIRST-MIGRATION.md), and
[PRIVATE-FILES.md](PRIVATE-FILES.md).

- Workspace records, settings, private files/assets and explicit recovery are
  implemented locally. Hosted cutover has not been verified. Migrations through
  0024 were applied to the isolated local database only; inspect the intended
  hosted database's migration history before planning any deployment.
- Do not simply enable `DRAFTHR_DUAL_WRITE` or disable the database flags to
  roll back. Once Postgres owns the records, the old browser store is not a
  complete fallback. A rollback must preserve the authoritative database and
  private objects, retain unsaved recovery, and use a verified compatible
  application version. Do not remove migrated data or repopulate it from a stale
  browser copy.
- Before customer cutover, verify independent-session workflows, imports and
  recovery; real hosted WorkOS sessions; tenant-isolated private storage; actual
  PDF/Word/ZIP outputs; email and billing; and a backup restore. Owner decisions
  on deployment targets, retention and UK/US operating requirements remain gates.
- Local acceptance was interrupted by disk exhaustion. At 10:11 BST
  on 2026-09-27, Postgres logged ENOSPC, an autovacuum panic, and failed WAL
  recovery. With 15 GiB free, the existing cluster restarted at 14:33 BST;
  normal WAL recovery completed, `pg_amcheck` passed all 450 relations, and
  all 19 ready local private files/assets matched their stored sizes and hashes.
  The signed-in workspace and local acceptance tests work again. See the
  workspace plan for recovery evidence and the browser-found navigation fix.
  This incident was local; these checks do not certify a hosted deployment.

## Launch gate review — 2026-09-23

The linked Vercel project has a ready production deployment, but its latest
deployment is about 80 days old. The current checkout has uncommitted changes.
Before inviting customers to enter real employment records, close and verify
these gaps:

1. **Central records:** the employee directory is local-only; matters are
   pushed but not pulled; draft evidence, exports, and some version history
   remain local-only. The existing draft dual-write flags do not make the
   complete workspace available on another device. Implement server-owned
   records, deletion reconciliation, and a migration path for browser data.
2. **Private files:** the production environment variable list does not include
   `BLOB_READ_WRITE_TOKEN`. Image upload/read now targets a private Blob store
   through tenant-authenticated routes, but without a provisioned private store
   production uploads fail visibly (local development retains data URLs).
   Provision and end-to-end test private storage before uploading signatures or
   letterheads. Evidence blobs still need a durable private-storage path.
3. **Customer communications:** `RESEND_API_KEY` is absent from the production
   variable list. Verify invitation and review-notification delivery before
   promising collaboration by email.
4. **Payments:** `DRAFTHR_ENFORCE_PAYWALL` is absent from the production variable
   list. The presence of Stripe keys does not establish that they are live
   keys or that live checkout and webhooks have been tested. Complete the
   test-to-live checklist below with the business owner.
5. **Runtime and operating checks:** test signed-out and wrong-tenant access on
   the actual deployment; restore a database backup; check incident response,
   retention/deletion, supplier agreements, and UK/US launch scope.

The local application can be run for testing. A passing build and unit tests
do not close the launch gates above.

Status legend: ✅ live · 🟡 built, owner-activation required · 🔭 needs your
external provisioning before it can be built.

---

## ✅ Live now (no action needed)

- **3-role auth** — sign-in/up, email verification (incl. the sign-in-while-
  unverified flow), server-sourced workspace roles, and a coherent
  employer⇄employee⇄consultant switcher.
- **Marketplace, bookings, workspace members/invites, audit chain, AI drafting,
  PDF/DOCX export, document signing** — all wired to real backends.
- **No fake/demo data** anywhere user-facing.

---

## 🟡 Cross-device draft sync — built, tested, owner-activation required

The pull/merge read-path + dual-write are complete and adversarially reviewed
(non-destructive merge, 11 unit tests). They run **only** when the dual-write
flags are `true`. The Postgres tables (`drafts`, `sections`, `matters`) already
exist in production, so no migration is needed for this step.

**Enable:**
```bash
cd ~/HRLETTER
# set BOTH (runtime + the Vite build-time flag), then redeploy
printf 'true\n' | vercel env add DRAFTHR_DUAL_WRITE production
printf 'true\n' | vercel env add VITE_DRAFTHR_DUAL_WRITE production
vercel --prod
```
If a var already exists: `vercel env rm <NAME> production -y` first.

**Verify after deploy:** open a draft on device A, edit a section, then load the
same workspace on device B — the edit should appear. Server-side, a row appears
in `drafts` for that tenant.

**Roll back:** set both flags back to `false` (or `rm`) and redeploy. The app is
local-first, so disabling sync never loses local data.

---

## 🟡 Collaboration-data sync (comments / timeline / approvals) — BUILT, owner-activation required

Now code-complete and tested (decoupled `draft_extras` table, best-effort write,
non-destructive union-by-id merge — see `src/lib/remote-pull.ts` +
`api/store/_handlers/draft-extras.ts`). It runs behind the **same** dual-write
flag as base sync, and needs migration **0011** applied so the `draft_extras`
table exists.

**Enable (after, or together with, the draft-sync flags above):**
```bash
cd ~/HRLETTER
npm run db:migrate     # applies 0011_secret_groot.sql (draft_extras) to your Neon DB
# the dual-write flags from the section above also gate this; no extra flag.
```
It's fully decoupled: if you enable the sync flags but DON'T run the migration,
base draft sync still works — the extras write/read just no-op (best-effort).

> Evidence file blobs are intentionally NOT synced here — they're base64 and
> belong in object storage (Vercel Blob), which is a separate piece.

---

## 🟡 Marketplace payments (Stripe Connect) — BUILT, needs your Stripe account to activate

Implemented locally: consultant payout onboarding (Connect Express), HR Checkout
at booking time (destination charge to the consultant + optional platform fee),
and a signature-verified webhook. Decoupled tables (`stripe_connect_accounts`,
`booking_payments`, migrations 0012 and 0027) keep payment state separate,
and it's **off when keys are unset** (endpoints return 503; the booking flow
stays request-based). Code: `api/_utils/stripe.ts`,
`api/marketplace/_handlers/stripe-{connect,checkout,webhook}.ts`.

**Activate (after creating/rotating your Stripe keys):**
1. Set env (server-only secret; never commit): `STRIPE_SECRET_KEY`,
   `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, optional
   `STRIPE_PLATFORM_FEE_BPS` (basis points, default 0), `APP_BASE_URL`.
2. Review and apply the migration history, including 0012 (payment tables) and
   0027 (durable Checkout requests), before deploying the new payment code.
3. In Stripe → Developers → Webhooks, add an endpoint
   `https://<your-domain>/api/marketplace/stripe-webhook` for events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
   `checkout.session.async_payment_failed` on the platform endpoint; save its
   signing secret in `STRIPE_WEBHOOK_SECRET`. Configure `account.updated` on the
   Connect endpoint and save that secret in `STRIPE_WEBHOOK_SECRET_CONNECT`.
4. `vercel --prod`, then test in **Stripe test mode**: a consultant connects
   payouts (Profile → Connect Stripe), an HR user pays an accepted booking
   (My bookings → Pay for review).

⚠️ Test it in Stripe test mode before going live — this is real payment code I
could not exercise without your keys.

See [Marketplace payment retries](MARKETPLACE-PAYMENTS.md) for saved checkout
attempts, callback recovery and the unresolved-payment reconciliation procedure.

---

## 🟡 Direct billing + hard paywall — BUILT & LIVE (test mode), go-live needs your Stripe live activation

The whole monetisation layer is built and running on prod **in Stripe test
mode** (v0.21.1): the `/pricing` storefront, subscriptions (Starter/Pro/Business
+ Employee Plus), one-off letters, case packs (metered per-letter), AI credit
packs, the **AI critique** feature (spends 1 credit, Claude Opus 4.8, refunded on
failure), and the **per-cycle credit drip**. Idempotent webhooks mirror Stripe →
`subscriptions` / `entitlement_purchases` / `credit_ledger`. Migrations 0013,
0016, 0017 are **already applied** to prod, so **no new migration is needed to go
live**. The hard paywall (server gate `assertCanCreateLetter` + client
`<PaywallGate>`) is complete but **env-gated OFF** via `DRAFTHR_ENFORCE_PAYWALL`.

Direct-charge billing is separate from the marketplace's Connect flow above; it
has its **own** webhook endpoint + signing secret. Code:
`api/marketplace/_handlers/billing-{checkout,status,webhook}.ts`,
`api/_utils/entitlements.ts`, `src/lib/billing/*`.

**Go-live sequence (test → live) — do in order:**
1. **Activate live payments in Stripe** (business details + bank) — your external
   step; gets you a live secret key `sk_live_…`.
2. **Set the live secret** on Vercel prod: `STRIPE_SECRET_KEY` = the `sk_live_`
   key. (`VITE_STRIPE_PUBLISHABLE_KEY` is unused — checkout is Stripe-hosted.)
3. **Re-seed the catalog against the live key** — `scripts/stripe/seed-catalog.ts`
   creates the 18 products/prices and prints the `STRIPE_PRICE_*` ids; set **all
   18** on Vercel prod (live price ids differ from test).
4. **Re-create the billing webhook in LIVE mode** — Stripe → Developers →
   Webhooks, endpoint `https://<domain>/api/marketplace/billing-webhook`, events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy its signing secret into
   `STRIPE_BILLING_WEBHOOK_SECRET`.
5. **Re-do the marketplace Connect webhook in live mode** too (see the section
   above — `STRIPE_WEBHOOK_SECRET` + `STRIPE_WEBHOOK_SECRET_CONNECT`).
6. **Flip enforcement:** set `DRAFTHR_ENFORCE_PAYWALL=1` on Vercel prod.
7. `vercel --prod`.

**Before flipping enforcement (step 6), sanity-check the whole gate** — it's the
first time it's load-bearing. In test mode, confirm each path lets a real letter
through and blocks when it shouldn't: an active subscription, a single one-off
letter (consumed once), a case pack (counts down to its allowance then blocks),
and AI credits (spent by a critique, refunded on failure). Then repeat once in
live mode with a real card.

**Roll back:** unset `DRAFTHR_ENFORCE_PAYWALL` (or set it to anything but `1`) and
redeploy → the app returns to open access instantly. It's local-first, so
toggling enforcement never touches or loses user data.

**Locked-but-revisable decisions baked in** (full rationale in `ROADMAP.md`
§2 — each notes where it's configured in code):
- **Hard paywall, no free anything, no trials** — payment precedes drafting.
- **AI critique = 1 credit/run, model Claude Opus 4.8**, refunded on failure
  (`CREDIT_COST`/`CRITIQUE_MODEL` in `api/store/_handlers/critique.ts`; client
  mirror `CRITIQUE_CREDIT_COST` in `src/lib/critique.ts`).
- **Case pack allowances: Grievance 4 · Settlement 6 · Tribunal 8** letters
  (`includedLetters` in `src/lib/billing/catalog.ts`).
- **3-day grace** on failed renewal; **Starter 5 letters/cycle**; **annual = 1
  month free**; **plan credits drip monthly, no rollover**; **purchased packs
  never expire**.

⚠️ This is real money code exercised only in test mode so far — do the live
end-to-end pass in step-before-6 before you turn enforcement on.

---

## One-time: let the agent do the env flip for you (optional)

The env changes above were intentionally left to you. If you'd rather the agent
run them, add a permission rule for `vercel env` in your Claude Code settings,
then tell it to enable sync — it will run the commands and verify the live
write→read path end-to-end.
