# Production activation runbook

This app is production-ready and deployed. A few capabilities are **built and
tested but gated off by default** because turning them on writes to your
production database / money rails — deliberate owner decisions that an automated
agent is (correctly) not allowed to take. This is the checklist to switch them
on.

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

Now code-complete: consultant payout onboarding (Connect Express), HR Checkout
at booking time (destination charge to the consultant + optional platform fee),
and a signature-verified webhook. Decoupled tables (`stripe_connect_accounts`,
`booking_payments`, migration 0012) so it never affects the live marketplace,
and it's **off when keys are unset** (endpoints return 503; the booking flow
stays request-based). Code: `api/_utils/stripe.ts`,
`api/marketplace/_handlers/stripe-{connect,checkout,webhook}.ts`.

**Activate (after creating/rotating your Stripe keys):**
1. Set env (server-only secret; never commit): `STRIPE_SECRET_KEY`,
   `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, optional
   `STRIPE_PLATFORM_FEE_BPS` (basis points, default 0), `APP_BASE_URL`.
2. `npm run db:migrate` (applies 0012 — payments tables).
3. In Stripe → Developers → Webhooks, add an endpoint
   `https://<your-domain>/api/marketplace/stripe-webhook` for events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded`,
   `charge.dispute.created` and `charge.dispute.closed`; copy its signing
   secret into `STRIPE_WEBHOOK_SECRET`. Add a second endpoint on the same URL
   listening to events on connected accounts, for `account.updated`, and copy
   its secret into `STRIPE_WEBHOOK_SECRET_CONNECT`. Without the async events a
   Direct Debit payment never leaves "processing"; without the refund and
   dispute events a refunded booking keeps its draft access and the
   consultant keeps the transfer. The consultant's share link to the draft is
   only minted once the booking is paid.
4. `vercel --prod`, then test in **Stripe test mode**: a consultant connects
   payouts (Profile → Connect Stripe), an HR user pays an accepted booking
   (My bookings → Pay for review).

⚠️ Test it in Stripe test mode before going live — this is real payment code I
could not exercise without your keys.

---

## 🟡 Direct billing + hard paywall — BUILT & LIVE (test mode), go-live needs your Stripe live activation

The whole monetisation layer is built and running on prod **in Stripe test
mode** (v0.21.1): the `/pricing` storefront, subscriptions (Starter/Pro/Business
+ Employee Plus), one-off letters, case packs (metered per-letter), AI credit
packs, the **AI critique** feature (spends 1 credit, Claude Opus 4.8, refunded on
failure), and the **per-cycle credit drip**. Idempotent webhooks mirror Stripe →
`subscriptions` / `entitlement_purchases` / `credit_ledger`. Migrations 0013,
0016, 0017 are **already applied** to prod. **Migrations 0018 to 0021 are new and
must be applied before this code is deployed** (`node scripts/run-migrations-direct.mjs`):
the code reads `drafts.revision` / `drafts.deleted_at`,
`entitlement_purchases.refunded_at` and `audit_events.seq`, so deploying first
breaks draft sync, the paywall gate and audit writes. Apply them immediately
before promoting the deploy: once 0021 makes `audit_events.seq` NOT NULL, the
previous release's audit appends fail (logged and skipped) until the new code
is live. The hard paywall (server gate `assertCanCreateLetter` + client
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
   `invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
   `checkout.session.async_payment_succeeded`. Copy its signing secret into
   `STRIPE_BILLING_WEBHOOK_SECRET`. (An existing test-mode endpoint needs the
   last two added too: without `charge.refunded` a refunded letter, pack or
   credit purchase keeps working and keeps its credits; without the async
   event a one-off paid by Direct Debit is never delivered.)
   **Set up the Billing Portal in LIVE mode:** Stripe → Settings → Billing →
   Customer portal: save a configuration that allows cancelling, updating the
   card and switching between the six HR plan prices only (never Employee
   Plus, which is billed to the person, not the workspace). "Manage billing"
   fails until a live default configuration exists. To use a non-default one,
   set its id in `STRIPE_BILLING_PORTAL_CONFIGURATION`.
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
