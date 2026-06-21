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
   `account.updated` and `checkout.session.completed`; copy its signing secret
   into `STRIPE_WEBHOOK_SECRET`.
4. `vercel --prod`, then test in **Stripe test mode**: a consultant connects
   payouts (Profile → Connect Stripe), an HR user pays an accepted booking
   (My bookings → Pay for review).

⚠️ Test it in Stripe test mode before going live — this is real payment code I
could not exercise without your keys.

---

## One-time: let the agent do the env flip for you (optional)

The env changes above were intentionally left to you. If you'd rather the agent
run them, add a permission rule for `vercel env` in your Claude Code settings,
then tell it to enable sync — it will run the commands and verify the live
write→read path end-to-end.
