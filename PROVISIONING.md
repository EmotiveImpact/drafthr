# Provisioning checklist — what you need to set up before going to production

The codebase ships with feature flags that activate each external service when its env var is set. This doc walks you through provisioning each one.

> Local dev works without any of these. The platform falls back to localStorage, no auth, no Sentry. Production needs all of them.

---

## 1. Vercel (hosting + serverless)

The repo includes `vercel.json` and serverless functions under `api/`. Once linked, deployments are automatic on push.

```bash
npm i -g vercel@latest
vercel login
vercel link               # link this directory to a Vercel project
vercel env pull .env.local --yes
```

**Project settings to confirm in the Vercel dashboard:**
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Node.js version: **22.x**
- Function region: pick one near your users (e.g. `lhr1` for UK, `iad1` for US East)

**Function configuration is in [vercel.json](vercel.json):**
- `/api/draft` — 60s timeout (LLM streaming)
- `/api/export/pdf` — 60s, 1024 MB (Chromium needs RAM)
- `/api/me/data` — 30s (DSAR responses can be large)
- `/api/cron/retention-purge` — daily at 03:00 UTC

---

## 2. Clerk (auth)

The cheapest production-ready auth provider for a Vite SPA. Free tier covers ~10k MAU.

1. Create an application at <https://dashboard.clerk.com/>.
2. Copy the **Publishable key** (`pk_…`) and **Secret key** (`sk_…`).
3. Set env vars on Vercel for **all environments** (production, preview, development):
   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_live_…
   CLERK_SECRET_KEY=sk_test_or_live_…
   ```
4. In Clerk → User & Authentication → Email, Phone, Username — pick the methods you want.
5. In Clerk → Sessions → set the session-cookie domain to your production domain.

**When the key is unset**, the platform runs in "open mode" (no auth required). When set, every route except `/privacy` is gated behind sign-in.

**Server-side validation TODO** — `api/me/data.ts` currently reads `x-clerk-user-id` from headers. Before going live, install `@clerk/backend` and replace that with `clerkClient.verifyToken(req)` on the bearer cookie. (Listed in [Phase B follow-up](#phase-b-follow-up-not-yet-done).)

---

## 3. Neon Postgres (server-side persistence)

Vercel Marketplace has a one-click Neon integration that auto-provisions `DATABASE_URL`.

**Via Vercel Marketplace (recommended):**
1. Vercel project → **Storage** → **Create Database** → **Neon (Serverless Postgres)**.
2. Pick a region close to your function region.
3. The integration auto-injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED` into all environments.

**Or directly:**
1. Sign up at <https://console.neon.tech/>.
2. Create a project, copy the pooled connection string.
3. Set `DATABASE_URL` in Vercel env.

**Run migrations:**
```bash
# install once
npm install -D drizzle-kit
# generate the SQL
npx drizzle-kit generate
# apply to the linked database
npx drizzle-kit push
```

When `DATABASE_URL` is unset, the app uses Zustand + localStorage (current behaviour). Drafts are not shared across devices and are lost on cookie clear.

---

## 4. Sentry (error tracking)

1. Sign up at <https://sentry.io/>.
2. Create a project: platform = **React**, framework = **Vite**.
3. Copy the **DSN** from Settings → Client Keys.
4. Set on Vercel:
   ```
   VITE_SENTRY_DSN=https://…@o…ingest.sentry.io/…
   VITE_SENTRY_ENV=production
   VITE_SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA
   ```
5. (Optional) Install the `@sentry/vite-plugin` for source-map upload at build time. Not yet wired — add when ready.

PII scrubbing is already enabled in `src/lib/observability/sentry.ts:beforeSend`. We never send draft contents, answers, or HTML.

---

## 5. DashScope / Qwen (LLM provider — current default)

Set on Vercel:
```
LLM_PROVIDER=qwen
QWEN_API_KEY=sk-…
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

**Important:** the free-tier-only mode in the DashScope console blocks `qwen3-max`. Disable it (or top up) to use the highest-quality model. `qwen-plus` works on free tier and produces solid output.

---

## 6. Anthropic / Claude (LLM provider — switch later)

When ready to swap to Claude:
```bash
npm install @ai-sdk/anthropic
```

Update `server/proxy.ts` and `api/draft.ts` to add the Claude branch (the abstraction is already in place — just unhide the import). Then on Vercel:
```
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-…
CLAUDE_MODEL=claude-sonnet-4-5
```

System prompts may need a light trim — Claude needs less anti-bullet-list nudging than Qwen. ~30 minutes of prompt review.

---

## 7. Sparticuz Chromium (server-side PDF rendering)

The PDF function uses `@sparticuz/chromium-min` which downloads the Chromium binary at runtime from a tarball you point to. The default URL in `.env.example` points to v148 — confirm it matches the version in `package.json`.

```
CHROMIUM_PACK_URL=https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar
```

For maximum control, mirror the tarball to your own CDN/Blob.

When this isn't configured, the client-side `html2pdf.js` fallback is used automatically. Lower fidelity but always works.

---

## 8. Cron secret (retention purge)

Vercel Cron jobs hit your function with `Authorization: Bearer <CRON_SECRET>`. Set it:
```
CRON_SECRET=<long-random-string>
```

The retention-purge function rejects unauthenticated requests if this is set. Vercel auto-injects it into Cron invocations.

---

## 9. Domain + email + DPA

- Buy a domain, point it at Vercel (`Settings → Domains`).
- Set up an email forwarder for `dpo@yourdomain` and `support@yourdomain`. Add to the Privacy page (replace `[dpo@example.com]`).
- Sign Data Processing Addenda (DPAs) with each sub-processor:
  - **Vercel** — <https://vercel.com/legal/dpa>
  - **Clerk** — <https://clerk.com/legal/dpa>
  - **Neon** — <https://neon.tech/dpa>
  - **Sentry** — <https://sentry.io/legal/dpa/>
  - **Alibaba Cloud (DashScope)** — request via account manager
  - **Anthropic** — <https://www.anthropic.com/legal/dpa> (when you switch)

---

## 10. Legal review (item 4)

This is the only thing on the list that I genuinely cannot do for you.

**Before you charge a customer for a high-risk letter (termination, redundancy, settlement, immigration), an employment lawyer should review:**
- The compliance rules in [src/lib/letters/compliance.ts](src/lib/letters/compliance.ts)
- The legal-fence text in [src/lib/prompts/sections.ts](src/lib/prompts/sections.ts)
- The disclaimer tiers in [src/lib/letters/disclaimers.ts](src/lib/letters/disclaimers.ts)
- The Terms of Service (not yet drafted — common starting point: <https://commonpaper.com/>)

UK: any mid-tier employment law boutique (e.g. Stephens Scown, Lewis Silkin, Bird & Bird's employment team). Budget £3–£10k for a focused content review.

US: any employment-law boutique (e.g. Littler Mendelson, Jackson Lewis, Ogletree Deakins). Budget $5–$15k for a 50-state review of the at-will / final-pay / WARN content. State-by-state coverage is genuinely the hard part.

---

## 11. ICO registration (UK only)

If you're processing personal data of UK residents as a business, you must register with the ICO and pay the data protection fee.
- Register here: <https://ico.org.uk/registration/>
- Fee: £40, £60, or £2,900 depending on org size.

Add the ICO registration number to your privacy policy (it's a normal expectation in B2B procurement reviews).

---

## Phase B follow-up (not yet done in the session)

These are scaffolded but not fully wired:

- [ ] Replace `x-clerk-user-id` header parsing with `@clerk/backend` token verification in `api/me/data.ts`.
- [ ] Replace `useDraftStore`'s localStorage persistence with a `repo` interface that talks to Postgres when authenticated, falls back to localStorage when not.
- [ ] Wire `@sentry/vite-plugin` to upload source maps at build time.
- [ ] Add `axe-core` test pass in CI to enforce WCAG 2.1 AA.
- [ ] Run `drizzle-kit generate` and commit the first migration.
- [ ] Draft Terms of Service.

---

## What's still listed as "ready" in the README

The README intentionally describes only the local dev setup so you can hand the repo to an engineer for a 1-day onboarding. The PROVISIONING checklist is for the operator going to production.
