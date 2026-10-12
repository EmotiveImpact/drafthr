import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Info, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ds";
import {
  OUTLINE_BTN,
  PRIMARY_BTN,
  PageShell,
  SectionLabel,
  StatusPill,
} from "@/components/reports/parts";
import { catalogFor, type PriceKey } from "@/lib/billing/catalog";
import { startBillingCheckout, getBillingStatus, openBillingPortal, type BillingStatus } from "@/lib/billing/api";

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
  tint: string;
  ink: string;
}[] = [
  {
    name: "Starter",
    monthly: "sub_starter_monthly",
    annual: "sub_starter_annual",
    plan: "starter",
    tint: "var(--ds-surface-2)",
    ink: "var(--ds-ink)",
    features: ["5 letters / month", "All 35 templates", "Full export", "Marketplace access"],
  },
  {
    name: "Pro",
    monthly: "sub_pro_monthly",
    annual: "sub_pro_annual",
    plan: "pro",
    highlight: true,
    tint: "var(--ds-tint-lavender)",
    ink: "var(--ds-tint-lavender-ink)",
    features: ["Unlimited letters", "20 AI critique credits / mo", "Evidence-pack signing", "Marketplace access"],
  },
  {
    name: "Business",
    monthly: "sub_business_monthly",
    annual: "sub_business_annual",
    plan: "business",
    tint: "var(--ds-surface-2)",
    ink: "var(--ds-ink)",
    features: ["Everything in Pro", "5 seats and team review", "Audit-trail dashboard", "Bulk-draft from CSV", "Approval queue"],
  },
];

const EMPLOYEE_SKUS: { key: PriceKey; blurb: string }[] = [
  { key: "letter_routine", blurb: "Resignation, flexible-working, holiday" },
  { key: "letter_standard", blurb: "Grievance, sickness appeal and evidence pack" },
  { key: "letter_high", blurb: "Settlement counter, discrimination grievance (+1 credit)" },
  { key: "letter_tribunal", blurb: "ET1 prep, constructive dismissal (+2 credits)" },
  { key: "pack_grievance", blurb: "4 letters · grievance arc" },
  { key: "pack_settlement", blurb: "6 letters · settlement negotiation" },
  { key: "pack_tribunal", blurb: "8 documents · full ET1 lodgement support" },
  { key: "sub_employee_plus", blurb: "Unlimited letters for one matter, 10 credits and £30 marketplace credit a month" },
];

const SKU_TINTS: [string, string][] = [
  ["var(--ds-tint-mint)", "var(--ds-tint-mint-ink)"],
  ["var(--ds-tint-sky)", "var(--ds-tint-sky-ink)"],
  ["var(--ds-tint-peach)", "var(--ds-tint-peach-ink)"],
  ["var(--ds-tint-rose)", "var(--ds-tint-rose-ink)"],
  ["var(--ds-tint-butter)", "var(--ds-tint-butter-ink)"],
  ["var(--ds-tint-lavender)", "var(--ds-tint-lavender-ink)"],
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
      toast.success("Payment complete. Thank you, your plan is being activated.");
    } else if (outcome === "cancelled") {
      toast("Checkout cancelled. No charge was made.");
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

  const [opening, setOpening] = useState(false);
  const manage = async () => {
    if (opening) return;
    setOpening(true);
    const r = await openBillingPortal("/pricing");
    if (r.ok) {
      window.location.assign(r.url);
      return; // navigating away
    }
    toast.error(r.error);
    setOpening(false);
  };
  // An existing workspace subscriber changes plan in the billing portal; a
  // second checkout would start a second subscription (the server refuses it).
  const hasHrPlan = Boolean(status?.active && status.plan && ["starter", "pro", "business"].includes(status.plan));

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
    <PageShell>
      <PageHeader
        crumbs={[{ label: "Settings", href: "/settings" }, { label: "Plans and pricing" }]}
        title="Plans and pricing"
        lede="Pay for what you need: subscribe for volume, or buy a single letter."
        actions={
          status?.plan ? (
            <button type="button" onClick={manage} disabled={opening} className={OUTLINE_BTN}>
              {opening && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {opening ? "Opening…" : "Manage billing"}
            </button>
          ) : undefined
        }
        tabs={[
          { id: "monthly", label: "Monthly" },
          { id: "annual", label: "Annual, 1 month free" },
        ]}
        activeTab={interval}
        onTabChange={(id) => setInterval(id as "monthly" | "annual")}
      />

      {(status?.active && status.plan) || (gated && !status?.active) ? (
        <div className="-mt-3 mb-8 flex flex-wrap items-center gap-2">
          {status?.active && status.plan && (
            <StatusPill tone="ok">
              You're on {status.plan.charAt(0).toUpperCase() + status.plan.slice(1).replace("_", " ")}
              {typeof status.credits === "number" ? `, ${status.credits} credits` : ""}
            </StatusPill>
          )}
          {gated && !status?.active && (
            <p className="m-0 flex items-center gap-2 rounded-[var(--ds-r-m)] bg-[var(--ds-amber-bg)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--ds-amber-fg)]">
              <Info className="size-4 shrink-0" aria-hidden />
              You'll need a plan (or a single letter) to start drafting.
            </p>
          )}
        </div>
      ) : null}

      {/* HR plans */}
      <section aria-labelledby="hr-plans">
        <SectionLabel hint="Subscriptions for HR and management teams.">
          <span id="hr-plans">For HR teams</span>
        </SectionLabel>

        <div className="grid gap-4 md:grid-cols-3">
          {HR_PLANS.map((p) => {
            const key = interval === "monthly" ? p.monthly : p.annual;
            const entry = catalogFor(key);
            const isCurrent = status?.plan === p.plan && status.active;
            return (
              <div
                key={p.name}
                className={
                  "flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border bg-[var(--ds-surface)] " +
                  (p.highlight ? "border-[var(--ds-violet-bd)] shadow-[var(--ds-shadow-m)]" : "border-[var(--ds-line)]")
                }
              >
                <div
                  className="mx-1.5 mt-1.5 rounded-[calc(var(--ds-r-l)-5px)] px-5 pb-5 pt-4"
                  style={{ background: p.tint, color: p.ink }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-[15px] font-semibold">{p.name}</h3>
                    {p.highlight && (
                      <span className="rounded-full bg-[var(--ds-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-violet-fg)]">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-3 flex items-baseline gap-1">
                    <span className="ds-title text-[40px] leading-none">{gbp(entry.amountMinor)}</span>
                    <span className="text-[12.5px] text-[var(--ds-muted)]">/{interval === "monthly" ? "mo" : "yr"}</span>
                  </p>
                </div>
                <ul className="m-0 flex flex-1 list-none flex-col gap-2 px-5 pt-4 text-[13px] text-[var(--ds-body)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="p-5 pt-5">
                  <button
                    type="button"
                    onClick={() => (hasHrPlan ? manage() : buy(key))}
                    disabled={busy !== null || opening || isCurrent}
                    className={(p.highlight ? PRIMARY_BTN : OUTLINE_BTN) + " h-10 w-full"}
                  >
                    {busy === key && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {isCurrent ? "Current plan" : busy === key ? "Starting…" : hasHrPlan ? "Switch plan" : "Subscribe"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-4 text-[12.5px] text-[var(--ds-muted)]">
          Need SSO, SCIM or 1,000+ employees?{" "}
          <a href="mailto:sales@drafthr.io" className="font-medium text-[var(--ds-ink)] underline underline-offset-2">
            Contact sales for Enterprise
          </a>
          .
        </p>
      </section>

      {/* Employee one-offs */}
      <section aria-labelledby="employee-skus" className="mt-12">
        <SectionLabel hint="One-off letters and packs, no subscription needed.">
          <span id="employee-skus">For employees: pay per letter</span>
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EMPLOYEE_SKUS.map(({ key, blurb }, i) => {
            const entry = catalogFor(key);
            // Employee Plus is a subscription — show "Current" (disabled) when the
            // user already holds it, instead of a Subscribe that 409s server-side.
            const isCurrent =
              entry.plan === "employee_plus" && status?.plan === "employee_plus" && status.active;
            const tint = SKU_TINTS[i % SKU_TINTS.length];
            return (
              <div
                key={key}
                className="flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)]"
              >
                <div
                  className="mx-1.5 mt-1.5 flex items-baseline justify-between gap-2 rounded-[calc(var(--ds-r-l)-5px)] px-4 py-3"
                  style={{ background: tint[0], color: tint[1] }}
                >
                  <span className="ds-title text-[26px] leading-none">{gbp(entry.amountMinor)}</span>
                  {entry.mode === "subscription" ? <span className="text-[11.5px] text-[var(--ds-muted)]">/mo</span> : null}
                </div>
                <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
                  <p className="m-0 text-[13.5px] font-semibold text-[var(--ds-ink)]">{entry.label}</p>
                  <p className="m-0 mt-0.5 flex-1 text-[12px] leading-snug text-[var(--ds-muted)]">{blurb}</p>
                  <button
                    type="button"
                    onClick={() => buy(key)}
                    disabled={busy !== null || isCurrent}
                    className={OUTLINE_BTN + " mt-3 h-8 w-full text-[12.5px]"}
                  >
                    {busy === key && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {isCurrent ? "Current" : entry.mode === "subscription" ? "Subscribe" : "Buy"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI credit packs */}
      <section aria-labelledby="credits" className="mt-12">
        <SectionLabel hint="Each AI critique uses one credit.">
          <span id="credits">AI critique credits</span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CREDIT_PACKS.map((key) => {
            const entry = catalogFor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => buy(key)}
                disabled={busy !== null}
                className="flex flex-col items-start rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-4 py-3.5 text-left transition hover:bg-[var(--ds-surface-3)] disabled:opacity-60"
              >
                <span className="text-[12.5px] text-[var(--ds-muted)]">
                  {entry.includedCredits === 1 ? "1 credit" : `${entry.includedCredits} credits`}
                </span>
                <span className="ds-title mt-1.5 text-[28px] leading-none">{gbp(entry.amountMinor)}</span>
                {busy === key && <Loader2 className="mt-1 size-3.5 animate-spin" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-6 text-[12px] text-[var(--ds-muted)]">
          Prices in GBP. Secure checkout by Stripe. Purchased credits never expire; plan credits refresh every month, on annual plans too.
        </p>
      </section>
    </PageShell>
  );
}
