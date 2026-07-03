/**
 * Seed the DraftHR billing catalog into Stripe (idempotent).
 *
 * Creates one Product + one Price per catalog SKU, keyed by the price's
 * `lookup_key` (= our PriceKey) so re-running never duplicates. Prints the
 * resulting `STRIPE_PRICE_*` env lines to stdout to paste into `.env.local`
 * (and later into Vercel for prod, with LIVE keys).
 *
 * Run:  node_modules/.bin/dotenv -e .env.local -- node_modules/.bin/tsx scripts/stripe/seed-catalog.ts
 * (Uses whatever STRIPE_SECRET_KEY is loaded — TEST key for test-mode catalog.)
 */
import Stripe from "stripe";
import { CATALOG, type PriceKey, type CatalogEntry } from "../../src/lib/billing/catalog.js";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("STRIPE_SECRET_KEY is required (load .env.local via dotenv -e).");
  process.exit(1);
}
const stripe = new Stripe(secret);

function interval(key: PriceKey): "year" | "month" {
  return key.endsWith("annual") ? "year" : "month";
}

async function ensurePrice(key: PriceKey, entry: CatalogEntry): Promise<string> {
  const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  if (found.data[0]) return found.data[0].id;

  const product = await stripe.products.create({
    name: `DraftHR — ${entry.label}`,
    metadata: { key, kind: entry.kind },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: entry.amountMinor,
    lookup_key: key,
    metadata: { key },
    ...(entry.mode === "subscription" ? { recurring: { interval: interval(key) } } : {}),
  });
  return price.id;
}

async function main(): Promise<void> {
  const lines: string[] = [];
  for (const [key, entry] of Object.entries(CATALOG) as [PriceKey, CatalogEntry][]) {
    const id = await ensurePrice(key, entry);
    lines.push(`${entry.stripePriceIdEnv}=${id}`);
    console.error(`✓ ${key.padEnd(24)} → ${id}`);
  }
  console.log("\n# --- Stripe price ids — paste into .env.local ---");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error("seed-catalog failed:", err);
  process.exit(1);
});
