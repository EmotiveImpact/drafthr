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

## 🟡 Collaboration-data sync (comments / evidence / timeline) — next, after the above

These are currently local-only. Making them cross-device is a small, additive
build on top of the draft sync, done the **safe decoupled way** so it can never
break base draft sync:

1. New `draft_extras` table (one JSON blob per draft: comments, evidence,
   timeline, approvals) + a Drizzle migration.
2. A separate, best-effort write (independent of the draft INSERT) + include it
   in `GET /api/store/drafts` + extend `mergeRemoteDrafts` (same non-destructive
   rules).

This needs the migration applied to prod Neon (`drizzle-kit migrate` against
`DATABASE_URL`, or your deploy's migrate step). Say the word and I'll build it in
one pass behind the same flag.

---

## 🔭 Marketplace payments (Stripe Connect) — needs your Stripe account first

Booking + payout state exist in the schema; no charge/payout is wired. This
requires **your** Stripe account and product decisions (price model, payout
split) before it can be built responsibly — shipping untested payment code blind
would be the opposite of production-ready. Provide Stripe keys + the model and
I'll build Connect onboarding for consultants + checkout/escrow on booking.

---

## One-time: let the agent do the env flip for you (optional)

The env changes above were intentionally left to you. If you'd rather the agent
run them, add a permission rule for `vercel env` in your Claude Code settings,
then tell it to enable sync — it will run the commands and verify the live
write→read path end-to-end.
