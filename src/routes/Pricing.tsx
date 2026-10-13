import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Check, Info } from "lucide-react";
import { Pill } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Band, SlidingTabs } from "@/components/wizard/Band";
import { Callout, Spinner } from "@/components/wizard/kit";
import { tintStyle, type Tint } from "@/components/templates/tints";
import { catalogFor, type PriceKey } from "@/lib/billing/catalog";
import { LETTER_CATALOG } from "@/lib/letters/catalog";
import { startBillingCheckout, getBillingStatus, openBillingPortal, type BillingStatus } from "@/lib/billing/api";
import { cn } from "@/lib/utils";

function gbp(minor: number): string {
  return minor % 100 === 0 ? `£${(minor / 100).toLocaleString("en-GB")}` : `£${(minor / 100).toFixed(2)}`;
}

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  employee_plus: "Employee Plus",
};

const TEMPLATE_COUNT = LETTER_CATALOG.length;

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
    features: ["5 letters per month", `All ${TEMPLATE_COUNT} templates`, "Full export", "Marketplace access"],
  },
  {
    name: "Pro",
    monthly: "sub_pro_monthly",
    annual: "sub_pro_annual",
    plan: "pro",
    highlight: true,
    features: ["Unlimited letters", "20 AI critique credits per month", "Evidence-pack signing", "Marketplace access"],
  },
  {
    name: "Business",
    monthly: "sub_business_monthly",
    annual: "sub_business_annual",
    plan: "business",
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
  { key: "sub_employee_plus", blurb: "Unlimited letters for one matter, 10 credits and £30 marketplace credit per month" },
];

const SKU_TINTS: Tint[] = ["mint", "sky", "peach", "rose", "butter", "lavender"];

const CREDIT_PACKS: PriceKey[] = ["credits_single", "credits_small", "credits_medium", "credits_best"];

type Outcome = "success" | "cancelled" | null;

/** Product names in sentence case ("Grievance pack"); the catalogue keeps
 * Stripe's Title Case labels. "Employee Plus" is a plan name and stays. */
function productName(entry: { label: string; kind: string }): string {
  if (entry.kind !== "pack") return entry.label;
  const [first = "", ...rest] = entry.label.split(" ");
  return [first, ...rest.map((w) => w.toLowerCase())].join(" ");
}

export function Pricing() {
  const location = useLocation();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<PriceKey | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  // True when the user was redirected here by the paywall gate (?gate=1).
  const [gated] = useState(() => new URLSearchParams(window.location.search).get("gate") === "1");
  const [outcome] = useState<Outcome>(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    return s === "success" || s === "cancelled" ? s : null;
  });

  // React StrictMode runs effects twice in development; announce the
  // checkout outcome once per visit (the toast ids also stop sonner from
  // stacking a duplicate).
  const announced = useRef(false);
  useEffect(() => {
    let cancelled = false;
    // Post-checkout return: Stripe redirects back with ?status=success|cancelled.
    const params = new URLSearchParams(window.location.search);
    if (!announced.current) {
      announced.current = true;
      if (outcome === "success") {
        toast.success("Payment complete", {
          id: "checkout-outcome",
          description: "Thank you. Your plan is being activated and shows here in a moment.",
        });
      } else if (outcome === "cancelled") {
        toast("Checkout cancelled", {
          id: "checkout-outcome",
          description: "No charge was made. Pick a plan whenever you're ready.",
        });
      }
      if (params.get("gate") === "1") {
        toast("Choose a plan to continue", {
          id: "checkout-gate",
          description: "Creating letters needs a plan or credits on this workspace.",
        });
      }
    }
    if (outcome || params.get("gate")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
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
  }, [outcome]);

  // "Buy credits" on Settings, Billing links to /pricing#credits.
  useEffect(() => {
    if (location.hash !== "#credits") return;
    const t = window.setTimeout(() => {
      document.getElementById("credits-section")?.scrollIntoView({ block: "start" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [location.hash]);

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

  const planLabel = status?.plan ? PLAN_NAMES[status.plan] ?? status.plan : null;

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        crumbs={[{ label: "Settings", href: "/settings?tab=billing" }, { label: "Plans and pricing" }]}
        title="Plans and pricing"
        lede="Pay for what you need: subscribe for volume, or buy a single letter."
        actions={
          status?.plan ? (
            <Button variant="outline" onClick={() => void manage()} disabled={opening}>
              {opening && <Spinner />}
              {opening ? "Opening…" : "Manage billing"}
            </Button>
          ) : undefined
        }
        bottom={
          <SlidingTabs
            label="Billing interval"
            tabs={[
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual, 1 month free" },
            ]}
            active={interval}
            onChange={(id) => setInterval(id as "monthly" | "annual")}
          />
        }
      />

      {(status?.active && planLabel) || (gated && !status?.active) || outcome ? (
        <div className="mb-8 flex max-w-[860px] flex-col items-start gap-2.5">
          {status?.active && planLabel && (
            <Pill tone="green">
              You're on {planLabel}
              {typeof status.credits === "number" ? `, ${status.credits} credits` : ""}
            </Pill>
          )}
          {outcome === "success" && (
            <Callout tone="success" role="status" className="w-full">
              Payment complete. Thank you, your plan is being activated.
            </Callout>
          )}
          {outcome === "cancelled" && (
            <Callout tone="info" role="status" className="w-full">
              Checkout cancelled. No charge was made.
            </Callout>
          )}
          {gated && !status?.active && (
            <Callout tone="warning" icon={Info} role="status" className="w-full">
              You'll need a plan (or a single letter) to start drafting.
            </Callout>
          )}
        </div>
      ) : null}

      {/* HR plans */}
      <section aria-labelledby="hr-plans">
        <SectionHead id="hr-plans" title="For HR teams" hint="Subscriptions for HR and management teams." />
        <div className="grid gap-3.5 md:grid-cols-3">
          {HR_PLANS.map((p) => {
            const key = interval === "monthly" ? p.monthly : p.annual;
            const entry = catalogFor(key);
            const isCurrent = status?.plan === p.plan && status.active;
            return (
              <div
                key={p.name}
                style={tintStyle("lavender")}
                className={cn(
                  "flex min-w-0 flex-col overflow-hidden rounded-[16px] border bg-[var(--ds-surface)]",
                  p.highlight ? "border-[var(--ds-lilac-bd)] shadow-[var(--ds-shadow-m)]" : "border-[var(--ds-line)]"
                )}
              >
                <div
                  className={cn(
                    "mx-1.5 mt-1.5 rounded-[12px] px-5 pb-5 pt-4",
                    p.highlight ? "bg-[var(--tint)] text-[var(--tint-ink)]" : "bg-[var(--ds-surface-2)] text-[var(--ds-ink)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-[15.5px] font-medium">{p.name}</h3>
                    {p.highlight && (
                      <span className="rounded-full bg-[var(--ds-surface)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--ds-lilac-fg)]">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-3 flex items-baseline gap-1.5">
                    <span className="ds-title text-[40px] leading-none tracking-[-0.02em]">{gbp(entry.amountMinor)}</span>
                    <span className="text-[13px] text-[var(--ds-muted)]">{interval === "monthly" ? "per month" : "per year"}</span>
                  </p>
                </div>
                <ul className="m-0 flex flex-1 list-none flex-col gap-2 px-5 pt-4 text-[13.5px] text-[var(--ds-body)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="p-5">
                  <Button
                    variant={p.highlight ? "default" : "outline"}
                    onClick={() => void (hasHrPlan ? manage() : buy(key))}
                    disabled={busy !== null || opening || isCurrent}
                    className="w-full"
                  >
                    {busy === key && <Spinner />}
                    {isCurrent ? "Current plan" : busy === key ? "Starting…" : hasHrPlan ? "Switch plan" : "Subscribe"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-4 text-[13px] text-[var(--ds-muted)]">
          Need SSO, SCIM or 1,000+ employees?{" "}
          <a href="mailto:sales@drafthr.io" className="font-medium text-[var(--ds-ink)] underline underline-offset-2">
            Contact sales for Enterprise
          </a>
          .
        </p>
      </section>

      {/* Employee one-offs */}
      <section aria-labelledby="employee-skus" className="mt-12">
        <SectionHead
          id="employee-skus"
          title="For employees: pay per letter"
          hint="One-off letters and packs, no subscription needed."
        />
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {EMPLOYEE_SKUS.map(({ key, blurb }, i) => {
            const entry = catalogFor(key);
            // Employee Plus is a subscription: show "Current" (disabled) when the
            // user already holds it, instead of a Subscribe that 409s server-side.
            const isCurrent = entry.plan === "employee_plus" && status?.plan === "employee_plus" && status.active;
            return (
              <div
                key={key}
                style={tintStyle(SKU_TINTS[i % SKU_TINTS.length]!)}
                className="flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]"
              >
                <div className="mx-1.5 mt-1.5 flex items-baseline justify-between gap-2 rounded-[12px] bg-[var(--tint)] px-4 py-3 text-[var(--tint-ink)]">
                  <span className="ds-title text-[26px] leading-none">{gbp(entry.amountMinor)}</span>
                  {entry.mode === "subscription" ? <span className="text-[12px] text-[var(--ds-muted)]">per month</span> : null}
                </div>
                <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
                  <p className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">{productName(entry)}</p>
                  <p className="m-0 mt-0.5 flex-1 text-[12.5px] leading-snug text-[var(--ds-muted)]">{blurb}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void buy(key)}
                    disabled={busy !== null || isCurrent}
                    className="mt-3 w-full"
                  >
                    {busy === key && <Spinner className="size-3.5" />}
                    {isCurrent ? "Current" : busy === key ? "Starting…" : entry.mode === "subscription" ? "Subscribe" : "Buy"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI credit packs */}
      <section aria-labelledby="credits-title" id="credits-section" className="mt-12 scroll-mt-6">
        <span id="credits" aria-hidden className="block" />
        <SectionHead id="credits-title" title="AI critique credits" hint="Each AI critique uses one credit." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CREDIT_PACKS.map((key) => {
            const entry = catalogFor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => void buy(key)}
                disabled={busy !== null}
                aria-label={`Buy ${entry.includedCredits === 1 ? "1 credit" : `${entry.includedCredits} credits`} for ${gbp(entry.amountMinor)}`}
                className="flex min-w-0 flex-col items-start rounded-[14px] bg-[var(--ds-surface-2)] px-4 py-3.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] disabled:opacity-60"
              >
                <span className="flex w-full items-center justify-between gap-2 text-[12.5px] text-[var(--ds-muted)]">
                  {entry.includedCredits === 1 ? "1 credit" : `${entry.includedCredits} credits`}
                  {busy === key && <Spinner className="size-3.5" />}
                </span>
                <span className="ds-title mt-1.5 text-[28px] leading-none text-[var(--ds-ink)]">{gbp(entry.amountMinor)}</span>
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-6 text-[12.5px] text-[var(--ds-muted)]">
          Prices in GBP. Secure checkout by Stripe. Purchased credits never expire; plan credits refresh every month, on
          annual plans too.
        </p>
      </section>
    </div>
  );
}

function SectionHead({ id, title, hint }: { id: string; title: ReactNode; hint: string }) {
  return (
    <div className="mb-3.5">
      <h2 id={id} className="m-0 text-[15.5px] font-medium text-[var(--ds-ink)]">
        {title}
      </h2>
      <p className="m-0 mt-[3px] text-[13.5px] text-[var(--ds-muted)]">{hint}</p>
    </div>
  );
}
