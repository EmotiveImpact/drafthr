#!/usr/bin/env bash
#
# One-command production activation for the cross-device sync features
# (cross-device draft sync + collaboration-data sync). YOU run this — it makes
# production-data changes that an automated agent isn't allowed to make.
#
# It does NOT touch Stripe: payment keys are secrets you must set yourself
# (Vercel dashboard or `vercel env add STRIPE_SECRET_KEY production`), and the
# secret you pasted in chat should be rotated first. See
# docs/PRODUCTION-ACTIVATION.md for the Stripe steps.
#
# Usage:
#   bash scripts/activate-sync.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Enabling dual-write flags in production…"
for VAR in DRAFTHR_DUAL_WRITE VITE_DRAFTHR_DUAL_WRITE; do
  vercel env rm "$VAR" production -y >/dev/null 2>&1 || true
  printf 'true\n' | vercel env add "$VAR" production
done

echo "▸ Applying database migrations (0011 draft_extras, 0012 stripe tables)…"
npm run db:migrate

echo "▸ Rebuilding production with the flags baked in…"
vercel --prod

cat <<'DONE'

✅ Cross-device sync + collaboration-data sync are now LIVE.

Verify: edit a draft on one device, open the same workspace on a second device
(or another browser profile) — the edit, and any comments, should appear.

Stripe payments are a separate step (your keys + webhook) — see
docs/PRODUCTION-ACTIVATION.md.
DONE
