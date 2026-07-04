import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { catalogFor, type PriceKey } from "@/lib/billing/catalog";
import { startBillingCheckout, getBillingStatus, type BillingStatus } from "@/lib/billing/api";

function gbp(minor: number): string {
  return minor % 100 === 0 ? `£${minor / 100}` : `£${(minor / 100).toFixed(2)}`;
}

const HR_PLANS: {
  name: string;
  monthly: PriceKey;
  annual: PriceKey;
  plan: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    name: "Starter",
    monthly: "sub_starter_monthly",
    annual: "sub_starter_annual",
    plan: "starter",
    features: ["5 letters / month", "All 35 templates", "Full export", "Marketplace access"],
  },
  {
    name: "Pro",
    monthly: "sub_pro_monthly",
    annual: "sub_pro_annual",
    plan: "pro",
    highlight: true,
    features: ["Unlimited letters", "20 AI critique credits / mo", "Evidence-pack signing", "Marketplace access"],
  },
  {
    name: "Business",
    monthly: "sub_business_monthly",
    annual: "sub_business_annual",
    plan: "business",
    features: ["Everything in Pro", "5 seats + team review", "Audit-trail dashboard", "Bulk-draft from CSV", "Approval queue"],
  },
];

const EMPLOYEE_SKUS: { key: PriceKey; blurb: string }[] = [
  { key: "letter_routine", blurb: "Resignation, flexible-working, holiday" },
  { key: "letter_standard", blurb: "Grievance, sickness appeal + evidence pack" },
  { key: "letter_high", blurb: "Settlement counter, discrimination grievance (+1 credit)" },
  { key: "letter_tribunal", blurb: "ET1 prep, constructive dismissal (+2 credits)" },
  { key: "pack_grievance", blurb: "4-letter grievance arc" },
  { key: "pack_settlement", blurb: "4–6 letter settlement negotiation" },
  { key: "pack_tribunal", blurb: "Full ET1 lodgement support (6–8 docs)" },
  { key: "sub_employee_plus", blurb: "Unlimited letters for one matter · 10 credits + £30 marketplace credit / mo" },
];

const CREDIT_PACKS: PriceKey[] = ["credits_single", "credits_small", "credits_medium", "credits_best"];

export function Pricing() {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<PriceKey | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  // True when the user was redirected here by the paywall gate (?gate=1).
  const [gated] = useState(
    () => new URLSearchParams(window.location.search).get("gate") === "1",
  );

  useEffect(() => {
    let cancelled = false;
    // Post-checkout return: Stripe redirects back with ?status=success|cancelled.
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("status");
    if (outcome === "success") {
      toast.success("Payment complete — thank you! Your plan is being activated.");
    } else if (outcome === "cancelled") {
      toast("Checkout cancelled — no charge was made.");
    }
    if (params.get("gate") === "1") {
      toast("Choose a plan to start creating letters.");
    }
    if (outcome || params.get("gate")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // The subscription mirror lands via webhook shortly after redirect, so
    // re-poll a couple of times on a success return to reflect the new plan.
    const load = (retriesLeft: number) => {
      void getBillingStatus().then((s) => {
        if (cancelled) return;
        setStatus(s);
        if (outcome === "success" && !s?.active && retriesLeft > 0) {
          window.setTimeout(() => load(retriesLeft - 1), 1500);
        }
      });
    };
    load(outcome === "success" ? 4 : 0);
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = async (priceKey: PriceKey) => {
    if (busy) return;
    setBusy(priceKey);
    const r = await startBillingCheckout(priceKey);
    if (r.ok) {
      window.location.assign(r.url);
      return; // navigating away
    }
    toast.error(r.error);
    setBusy(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          Plans &amp; pricing
        </h1>
        <p className="mt-2 text-[14.5px] text-[var(--ds-body)]">
          Pay for what you need — subscribe for volume, or buy a single letter.
        </p>
        {status?.active && status.plan && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-green-bg)] px-3 py-1 text-[12px] font-semibold text-[var(--ds-green-fg)]">
            <Check className="size-3.5" aria-hidden />
            You're on {status.plan}
            {typeof status.credits === "number" ? ` · ${status.credits} credits` : ""}
          </p>
        )}
        {gated && !status?.active && (
          <p className="mt-3 text-[13px] font-semibold text-[var(--ds-amber-fg)]">
            You'll need a plan (or a single letter) to start drafting.
          </p>
        )}
      </header>

      {/* HR plans */}
      <section aria-labelledby="hr-plans">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="hr-plans" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ds-muted)]">
            For HR teams
          </h2>
          <div className="inline-flex rounded-full border border-[var(--ds-line)] p-0.5 text-[12px] font-semibold">
            {(["monthly", "annual"] as const).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                className={
                  "rounded-full px-3 py-1 transition " +
                  (interval === iv
                    ? "bg-[var(--ds-ink)] text-white"
                    : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]")
                }
              >
                {iv === "monthly" ? "Monthly" : "Annual · 1 month free"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {HR_PLANS.map((p) => {
            const key = interval === "monthly" ? p.monthly : p.annual;
            const entry = catalogFor(key);
            const isCurrent = status?.plan === p.plan && status.active;
            return (
              <div
                key={p.name}
                className={
                  "flex flex-col rounded-[14px] border p-5 " +
                  (p.highlight
                    ? "border-[var(--ds-ink)] shadow-sm"
                    : "border-[var(--ds-line)]")
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[var(--ds-ink)]">{p.name}</h3>
                  {p.highlight && (
                    <span className="rounded-full bg-[var(--ds-ink)] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-2">
                  <span className="text-[26px] font-semibold text-[var(--ds-ink)]">{gbp(entry.amountMinor)}</span>
                  <span className="text-[12px] text-[var(--ds-muted)]">/{interval === "monthly" ? "mo" : "yr"}</span>
                </p>
                <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-[12.5px] text-[var(--ds-body)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => buy(key)}
                  disabled={busy !== null || isCurrent}
                  className={
                    "mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-[8px] px-4 text-[13px] font-semibold transition disabled:opacity-60 " +
                    (p.highlight
                      ? "bg-[var(--ds-ink)] text-white hover:-translate-y-px hover:shadow-md"
                      : "border border-[var(--ds-line)] text-[var(--ds-ink)] hover:border-[var(--ds-ink)]")
                  }
                >
                  {busy === key && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {isCurrent ? "Current plan" : busy === key ? "Starting…" : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[12px] text-[var(--ds-muted)]">
          Need SSO, SCIM, or 1,000+ employees?{" "}
          <a href="mailto:sales@drafthr.io" className="font-semibold text-[var(--ds-ink)] underline">
            Contact sales for Enterprise
          </a>
          .
        </p>
      </section>

      {/* Employee one-offs */}
      <section aria-labelledby="employee-skus" className="mt-12">
        <h2 id="employee-skus" className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-[var(--ds-muted)]">
          For employees — pay per letter
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EMPLOYEE_SKUS.map(({ key, blurb }) => {
            const entry = catalogFor(key);
            // Employee Plus is a subscription — show "Current" (disabled) when the
            // user already holds it, instead of a Subscribe that 409s server-side.
            const isCurrent =
              entry.plan === "employee_plus" && status?.plan === "employee_plus" && status.active;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[var(--ds-ink)]">
                    {entry.label} · {gbp(entry.amountMinor)}
                    {entry.mode === "subscription" ? <span className="text-[11px] text-[var(--ds-muted)]">/mo</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--ds-muted)]">{blurb}</p>
                </div>
                <button
                  type="button"
                  onClick={() => buy(key)}
                  disabled={busy !== null || isCurrent}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--ds-ink)] px-3 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {busy === key && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {isCurrent ? "Current" : entry.mode === "subscription" ? "Subscribe" : "Buy"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI credit packs */}
      <section aria-labelledby="credits" className="mt-12">
        <h2 id="credits" className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-[var(--ds-muted)]">
          AI critique credits
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {CREDIT_PACKS.map((key) => {
            const entry = catalogFor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => buy(key)}
                disabled={busy !== null}
                className="flex flex-col items-center rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 text-center transition hover:border-[var(--ds-ink)] disabled:opacity-60"
              >
                <span className="text-[16px] font-semibold text-[var(--ds-ink)]">
                  {entry.includedCredits} {entry.includedCredits === 1 ? "credit" : "credits"}
                </span>
                <span className="mt-1 text-[12px] text-[var(--ds-muted)]">{gbp(entry.amountMinor)}</span>
                {busy === key && <Loader2 className="mt-1 size-3.5 animate-spin" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[11.5px] text-[var(--ds-muted)]">
          Prices in GBP. Secure checkout by Stripe. Purchased credits never expire; plan credits refresh each cycle.
        </p>
      </section>
    </div>
  );
}
