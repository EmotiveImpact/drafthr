# Billing & Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-enforced billing to DraftHR — HR subscriptions (Starter/Pro/Business), employee one-off letters, case packs, AI credit packs, and Employee Plus — all via Stripe-hosted Checkout, behind a hard paywall, with plan gating, a credit ledger, and a Starter 5-letters-per-cycle cap.

**Architecture:** Stripe-hosted Checkout (redirect) using **direct charges** (DraftHR is the merchant — distinct from the marketplace's Connect/destination charges, which stay untouched). All new API actions fold into the **existing `api/marketplace/[...path].ts` dispatcher** as single-segment actions, so we stay at 11/12 Vercel functions. Stripe is the source of truth for subscription state; our DB mirrors it via **idempotent, event-id-deduped webhooks**. A single server-side **entitlements resolver** (`api/_utils/entitlements.ts`) is the one place that answers "what may this subject do," enforced at the real gates (draft-create, export, AI-credit spend) and mirrored to the client for paywall UX.

**Tech Stack:** Stripe Node SDK v22 (installed), Drizzle + Neon, existing `requireSessionAndTenant` auth, existing dispatcher pattern.

---

## Locked decisions (from the 2026-07-02 pricing + billing sessions)

- **Hard paywall — no free anything, no trials.** Payment precedes drafting.
- **Checkout:** Stripe-hosted (redirect to Checkout, return to app).
- **Scope:** everything in one build — HR subs + employee one-offs + case packs + credit packs + Employee Plus.
- **Failed renewal:** **3-day grace.** On `invoice.payment_failed` we set `status=past_due` + `grace_until = now + 3 days`; access continues (with a banner) until `grace_until`, then locks. `invoice.paid` clears it. App-enforced regardless of Stripe's retry cadence.
- **Starter cap:** 5 letters per **billing cycle** (resets on the subscription's renewal date). The 6th create is blocked with an "Upgrade to Pro" prompt; already-created letters stay fully accessible.
- **Credits:** plan-included credits **drip monthly, no rollover, never granted upfront on annual**; purchased packs never expire (see pricing in `ROADMAP.md §2`).
- **Prices (GBP):** Starter £29/£319 · Pro £79/£869 · Business £199/£2,189 · Employee Plus £99/mo · Enterprise = sales (no self-serve price). Employee letters £9.99/£29/£59/£99 · Packs £69/£119/£249 · Credit packs £1.99/£4.99/£8.99/£19.99.

## ⚠️ OPEN decisions — confirm before Phase 2 (defaults chosen so build can proceed)

These materially affect the data model and cost. The plan proceeds on the **default** but each is a one-line change if you decide otherwise:

1. **HR subscription scope → DEFAULT: tenant (workspace)-level.** A workspace has one plan; Business grants up to 5 active seats. (Alternative: per-user — simpler gating but no "5 seats" story.)
2. **Plan-included credits → DEFAULT: tenant-pooled** (Pro's 20/mo is a shared workspace pool). (Alternative: per-active-member — richer but multiplies AI cost by seat count.)
3. **Employee Plus + one-off letters + purchased credit packs → user-scoped** (an individual's matter). Not in dispute; recorded for completeness.
4. **Enterprise → not self-serve.** "Contact sales" CTA, provisioned manually. No Stripe price.

---

## File structure

**New:**
- `api/_utils/stripe-billing.ts` — billing-mode Stripe helpers (customer get-or-create; direct-charge Checkout Session builders). Kept separate from `_utils/stripe.ts` (Connect/marketplace) to avoid conflating charge models.
- `api/_utils/entitlements.ts` — the single entitlement resolver + gate helpers (`resolveEntitlements(subject)`, `assertCanCreateLetter(...)`, `spendCredits(...)`).
- `api/marketplace/_handlers/billing-checkout.ts` — POST: create a Checkout Session for a given priceKey (subscription or one-time).
- `api/marketplace/_handlers/billing-portal.ts` — POST: create a Stripe Billing Portal session (manage/cancel card + subscription).
- `api/marketplace/_handlers/billing-status.ts` — GET: the caller's resolved entitlements (plan, status, credit balance, letters-used-this-cycle, active one-offs).
- `api/marketplace/_handlers/billing-webhook.ts` — POST: subscription/invoice/one-time lifecycle → DB mirror. (Separate registered Stripe endpoint from the marketplace one; routed by event type + metadata.)
- `src/lib/billing/catalog.ts` — client + server price catalog (priceKey → { stripePriceId, amount, label, mode, kind }). Single source of truth for the ~19 prices.
- `src/lib/billing/useEntitlements.ts` — client hook wrapping `GET billing-status` (drives paywall UX).
- `src/routes/Pricing.tsx` — the pricing/plan-picker page (HR + employee lanes).
- `src/components/billing/Paywall.tsx` — reusable paywall gate/upsell surface.
- `drizzle/migrations/0013_billing.sql` — new tables + columns (generated then hand-verified per the meta-drift note in BUGS_AND_FIXES.md).

**Modified:**
- `src/db/schema.ts` — add billing tables + `stripeCustomerId` columns.
- `api/marketplace/[...path].ts` — register `billing-checkout`, `billing-portal`, `billing-status` actions (billing-webhook is NOT in this dispatcher — it's its own route; see Task 6).
- `api/store/_handlers/drafts.ts:136` (POST) — enforce `assertCanCreateLetter` (hard paywall + Starter cap) before insert.
- `api/agent.ts` / `api/draft.ts` — where AI-credit-consuming actions run, call `spendCredits` (credit metering).
- `src/lib/store.ts` `createDraft` — surface a paywall block returned by the server instead of optimistically creating.

---

## Data model (Task 1 — `drizzle/migrations/0013_billing.sql` + `schema.ts`)

```ts
// schema.ts — add to tenants and users:
//   stripeCustomerId: text("stripe_customer_id")   (nullable, unique per table)

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(), // 'tenant' | 'user'
    subjectId: uuid("subject_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripePriceId: text("stripe_price_id").notNull(),
    plan: text("plan").notNull(), // 'starter'|'pro'|'business'|'employee_plus'
    status: text("status").notNull(), // 'active'|'trialing'|'past_due'|'canceled'|'incomplete'
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    graceUntil: timestamp("grace_until", { withTimezone: true }), // set on payment_failed
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_subject_idx").on(t.subjectType, t.subjectId)],
);

export const entitlementPurchases = pgTable(
  "entitlement_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'letter_routine'|'letter_standard'|'letter_high'|'letter_tribunal'|'pack_grievance'|'pack_settlement'|'pack_tribunal'
    matterId: uuid("matter_id"), // nullable; packs/plus scope to a matter
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }), // single-letter entitlements
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("entitlement_purchases_user_idx").on(t.userId)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(), // 'tenant' | 'user'
    subjectId: uuid("subject_id").notNull(),
    delta: integer("delta").notNull(), // + grant, - spend
    reason: text("reason").notNull(), // 'pack'|'plan_drip'|'letter_included'|'spend'|'expire'
    expiresAt: timestamp("expires_at", { withTimezone: true }), // drip credits expire at cycle end; packs null
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("credit_ledger_subject_idx").on(t.subjectType, t.subjectId)],
);

export const webhookEventsSeen = pgTable("webhook_events_seen", {
  eventId: text("event_id").primaryKey(), // Stripe evt_… — idempotency guard
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Balance = `SUM(delta) WHERE (expires_at IS NULL OR expires_at > now())`. Starter usage = `COUNT(drafts) WHERE tenant_id = ? AND created_at >= currentPeriodStart` (no new table — drafts are already server-persisted).

---

## The Stripe catalog (Task 2 — created in TEST mode, IDs into `catalog.ts`)

Create via `stripe products create` + `stripe prices create` (script committed under `scripts/stripe/seed-catalog.ts`, idempotent by product `metadata.key`). Products (recurring unless noted):

| priceKey | Product | Amount | Interval |
|---|---|---|---|
| `sub_starter_monthly` / `_annual` | DraftHR Starter | £29 / £319 | month / year |
| `sub_pro_monthly` / `_annual` | DraftHR Pro | £79 / £869 | month / year |
| `sub_business_monthly` / `_annual` | DraftHR Business | £199 / £2,189 | month / year |
| `sub_employee_plus` | Employee Plus | £99 | month |
| `letter_routine`/`_standard`/`_high`/`_tribunal` | Employee letter (by stakes) | £9.99/£29/£59/£99 | one-time |
| `pack_grievance`/`_settlement`/`_tribunal` | Case pack | £69/£119/£249 | one-time |
| `credits_single`/`_small`/`_medium`/`_best` | AI credit pack | £1.99/£4.99/£8.99/£19.99 | one-time |

`catalog.ts` maps `priceKey → { stripePriceId, amountMinor, label, mode: 'subscription'|'payment', kind, includedCredits? }`. Test IDs live in env-independent config seeded from the script's output; live IDs added at go-live.

---

## Phases (build order)

- **Phase 1 — Foundation:** schema + migration, catalog seed script, Stripe customer get-or-create. (Detailed below.)
- **Phase 2 — Checkout:** `billing-checkout` + `billing-portal` + `Pricing.tsx` (redirect flow, no gating yet).
- **Phase 3 — Webhooks + mirror:** `billing-webhook`, event dedup, subscription/invoice → DB, 3-day grace, one-time purchase → entitlement/credit rows.
- **Phase 4 — Entitlements resolver + `billing-status`:** the resolver, credit balance, Starter usage, client hook.
- **Phase 5 — Enforcement (the hard paywall):** gate draft-create (paywall + Starter cap), gate AI credit spend, `Paywall.tsx` UX.
- **Phase 6 — Employee lane:** one-off letter purchase → single-letter entitlement consumed on create; packs/Employee Plus scoped to a matter; mid-case upgrade upsell.

Each phase ends green (`npm run build` + `npx vitest run`) and is committed. Phases 2–6 get expanded to step-level detail at execution time (they depend on Phase 1 types). **Phase 1 is fully detailed here to start immediately.**

---

## Phase 1 — Foundation

### Task 1: Billing schema + migration

**Files:**
- Modify: `src/db/schema.ts` (add the 4 tables above + `stripeCustomerId` on `tenants` and `users`)
- Create: `drizzle/migrations/0013_billing.sql`
- Test: `tests/db/billing-schema.test.ts`

- [ ] **Step 1: Write the failing test** — assert the inferred types exist and columns are present.

```ts
import { describe, it, expect } from "vitest";
import { subscriptions, entitlementPurchases, creditLedger, webhookEventsSeen } from "../../src/db/schema.js";

describe("billing schema", () => {
  it("exposes the billing tables with expected columns", () => {
    expect(Object.keys(subscriptions)).toContain("graceUntil");
    expect(Object.keys(entitlementPurchases)).toContain("consumedAt");
    expect(Object.keys(creditLedger)).toContain("expiresAt");
    expect(Object.keys(webhookEventsSeen)).toContain("eventId");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run tests/db/billing-schema.test.ts` → FAIL (imports undefined).
- [ ] **Step 3: Add the tables + columns to `schema.ts`** (code in the Data model section above) plus inferred types:

```ts
export type Subscription = typeof subscriptions.$inferSelect;
export type EntitlementPurchase = typeof entitlementPurchases.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
```

- [ ] **Step 4: Generate the migration** — `npm run db:generate`. **Then READ `drizzle/migrations/0013_*.sql` by hand** (the meta-snapshot drift noted in BUGS_AND_FIXES.md makes generate emit bogus CREATE TABLEs for existing tables — delete any statement that isn't for the 4 new tables / 2 new columns).
- [ ] **Step 5: Run test, verify pass** — `npx vitest run tests/db/billing-schema.test.ts` → PASS.
- [ ] **Step 6: Apply migration to the dev DB** — `npm run db:migrate` (dotenv `.env.local`). Confirm `\d subscriptions` etc. Do NOT apply to prod until the feature ships.
- [ ] **Step 7: Commit** — `git add src/db/schema.ts drizzle/migrations tests/db/billing-schema.test.ts && git commit -m "feat(billing): schema + 0013 migration for subscriptions/purchases/credits"`

### Task 2: Catalog seed script + `catalog.ts`

**Files:**
- Create: `scripts/stripe/seed-catalog.ts` (idempotent by `product.metadata.key`)
- Create: `src/lib/billing/catalog.ts`
- Test: `tests/lib/billing/catalog.test.ts`

- [ ] **Step 1: Write the failing test** — every priceKey resolves and modes are correct.

```ts
import { describe, it, expect } from "vitest";
import { CATALOG, catalogFor } from "../../../src/lib/billing/catalog.js";

describe("billing catalog", () => {
  it("has all subscription + one-time SKUs with correct modes", () => {
    expect(catalogFor("sub_pro_monthly").mode).toBe("subscription");
    expect(catalogFor("letter_tribunal").mode).toBe("payment");
    expect(catalogFor("letter_tribunal").amountMinor).toBe(9900);
    expect(Object.keys(CATALOG).length).toBeGreaterThanOrEqual(19);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Write `catalog.ts`** — a typed record keyed by priceKey. `stripePriceId` pulled from `process.env` per key (seeded by the script) so test vs live differ by env, not code:

```ts
export type PriceKey = "sub_starter_monthly" | "sub_starter_annual" | /* …all 19… */ "credits_best";
export type CatalogEntry = {
  mode: "subscription" | "payment";
  amountMinor: number;
  label: string;
  kind: string; // 'plan'|'letter'|'pack'|'credits'
  includedCreditsPerCycle?: number;
  stripePriceIdEnv: string; // e.g. "STRIPE_PRICE_SUB_PRO_MONTHLY"
};
export const CATALOG: Record<PriceKey, CatalogEntry> = { /* … */ };
export function catalogFor(k: PriceKey): CatalogEntry { return CATALOG[k]; }
export function stripePriceId(k: PriceKey): string | null {
  return process.env[CATALOG[k].stripePriceIdEnv]?.trim() || null;
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Write the seed script** — `stripe products create`/`prices create` via the Stripe SDK using the test key, idempotent, printing `STRIPE_PRICE_*` lines to paste into `.env.local`. (Run manually; not part of the test run.)
- [ ] **Step 6: Commit** — `git commit -m "feat(billing): price catalog + idempotent Stripe seed script"`

### Task 3: Stripe customer get-or-create

**Files:**
- Create: `api/_utils/stripe-billing.ts`
- Test: `tests/api/billing/stripe-customer.test.ts`

- [ ] **Step 1: Write the failing test** — reuses an existing `stripeCustomerId`, else creates + persists.

```ts
// mock stripe.customers.create + the db; assert:
//  - existing stripeCustomerId → returns it, no create call
//  - missing → creates with metadata {subjectType, subjectId}, persists, returns new id
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement `getOrCreateCustomer(subjectType, subjectId, email)`** in `stripe-billing.ts`:

```ts
export async function getOrCreateCustomer(
  subjectType: "tenant" | "user",
  subjectId: string,
  email: string | null,
): Promise<string> {
  const stripe = getStripe(); // reuse the singleton
  if (!stripe) throw new Error("Payments not configured");
  const existing = await readStripeCustomerId(subjectType, subjectId); // reads tenants/users column
  if (existing) return existing;
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { subjectType, subjectId },
  });
  await persistStripeCustomerId(subjectType, subjectId, customer.id);
  return customer.id;
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(billing): Stripe customer get-or-create keyed on subject"`

**End of Phase 1: `npm run build` + `npx vitest run` green, migration applied to dev DB, catalog seeded in Stripe test mode.**

---

## Webhook routing note (Phase 3, critical)

Billing uses **direct charges**, so `checkout.session.completed` for a subscription/one-time fires on the platform account — the **same account webhook** the marketplace already uses. The handler MUST branch on `session.mode` + `session.metadata.purpose` (`"billing"` vs the marketplace's booking metadata) so the two flows don't cross-process. Subscription lifecycle (`customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`) is billing-only. Register the billing webhook as its own Stripe endpoint at `/api/marketplace/billing-webhook` for those events + `checkout.session.completed`, and dedup every delivery via `webhook_events_seen` (insert eventId; on conflict, ack + skip).

---

## Self-review notes

- **Spec coverage:** subs ✓ (Task 1 subscriptions table, Phase 2 checkout, Phase 3 mirror), one-offs ✓ (entitlement_purchases, Phase 6), packs ✓ (kind enum), credit packs ✓ (credit_ledger), Employee Plus ✓ (subject=user subscription + matter scope), hard paywall ✓ (Phase 5 draft-create gate), Starter cap ✓ (drafts count vs currentPeriodStart), 3-day grace ✓ (graceUntil), Stripe-hosted ✓ (Checkout Sessions).
- **Open items flagged** (subscription scope, credit pooling) — confirm before Phase 2.
- **Function cap:** billing-checkout/portal/status ride the marketplace dispatcher (still 11 functions); billing-webhook is a handler under the same dispatcher too — 0 new top-level functions.
- **No prod DB change** until the feature is verified in dev + Stripe test mode.
