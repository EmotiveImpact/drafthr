/**
 * Settings, Billing pane (design/hifi/screens/settings.mjs).
 *
 * Shows the caller's current plan, credit balance, letters this month and
 * seats in use, and opens the Stripe Billing Portal ("Manage billing") where
 * they can change plan, update the card, download invoices or cancel. Plan
 * changes made there reach the app through the billing webhook. Workspace
 * plans can only be managed by owners and admins; the server enforces that
 * and its message is shown as a toast.
 *
 * The app holds no card details and no invoice list, so the payment card
 * and the invoices block say where those live (the Stripe portal) instead
 * of inventing them.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CreditCard, History, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { enGB } from "date-fns/locale";
import { Pill, type PillTone } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { LoadingRows, Spinner } from "@/components/wizard/kit";
import { getBillingStatus, openBillingPortal, type BillingStatus } from "@/lib/billing/api";
import { CATALOG, creditsPerCycleForPlan, type PriceKey } from "@/lib/billing/catalog";
import { useDraftStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { PaneHeader, PaneLink, SettingsCard } from "@/routes/settings/parts";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  employee_plus: "Employee Plus",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  canceled: "Cancelled",
  paused: "Paused",
};

const DAY = 864e5;

function longDate(ms: number): string {
  return format(ms, "d MMMM yyyy", { locale: enGB });
}

function formatGbp(minor: number): string {
  const pounds = minor / 100;
  return `£${Number.isInteger(pounds) ? pounds.toLocaleString("en-GB") : pounds.toFixed(2)}`;
}

/** Monthly or annual, from the billing period's length. */
export function billingIntervalFromPeriod(start: number | null, end: number | null): "monthly" | "annual" | null {
  if (!start || !end || end <= start) return null;
  return end - start > 200 * DAY ? "annual" : "monthly";
}

/** "£79 per month, billed monthly", or null when the price can't be known. */
export function planPriceLine(plan: string | null, interval: "monthly" | "annual" | null): { price: string; rest: string } | null {
  if (!plan) return null;
  if (plan === "employee_plus") {
    return { price: formatGbp(CATALOG.sub_employee_plus.amountMinor), rest: "per month, billed monthly" };
  }
  if (!interval) return null;
  const key = `sub_${plan}_${interval}` as PriceKey;
  const entry = CATALOG[key];
  if (!entry) return null;
  return interval === "annual"
    ? { price: formatGbp(entry.amountMinor), rest: "per year, billed annually" }
    : { price: formatGbp(entry.amountMinor), rest: "per month, billed monthly" };
}

/** Lets a long email wrap after the "@" rather than mid-word. */
function breakAtSign(email: string): ReactNode {
  const at = email.indexOf("@");
  if (at < 0) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

/** Start of the current allowance window, or the first of this month. */
function windowStart(status: BillingStatus | null): number {
  if (status?.allowanceStart) return status.allowanceStart;
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function BillingCard({
  fallback = null,
  onManageTeam,
}: {
  fallback?: ReactNode;
  /** Opens Team and roles (the "Manage team" link on the seats tile). */
  onManageTeam?: () => void;
} = {}) {
  const [status, setStatus] = useState<BillingStatus | null | undefined>(undefined);
  const [opening, setOpening] = useState<string | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const drafts = useDraftStore((s) => s.drafts);
  const { user, activeTenant } = useAuth();
  const profileEmail = useProfileStore((s) => s.profile.personal.email);
  const companyName = useProfileStore((s) => s.profile.employer.legalName);

  useEffect(() => {
    let cancelled = false;
    void getBillingStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTenant) return;
    let cancelled = false;
    fetch("/api/workspace/members", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members?: unknown[] } | null) => {
        if (!cancelled && data && Array.isArray(data.members)) setSeats(data.members.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTenant]);

  const letters = useMemo(() => {
    const from = windowStart(status ?? null);
    const prevFrom = subMonths(from, 1).getTime();
    const real = Object.values(drafts).filter((d) => !d.isTemplateSource);
    return {
      now: real.filter((d) => d.createdAt >= from).length,
      before: real.filter((d) => d.createdAt >= prevFrom && d.createdAt < from).length,
      prevMonth: format(prevFrom, "MMMM", { locale: enGB }),
    };
  }, [drafts, status]);

  if (status === undefined) {
    return (
      <>
        <PaneHeader title="Billing" line="Only owners and admins can change the plan or payment details." />
        <SettingsCard>
          <LoadingRows rows={3} label="Loading billing" />
        </SettingsCard>
      </>
    );
  }
  if (!status?.configured) return <>{fallback}</>;

  const portal = async (what: string, returnTo: "/settings" | "/pricing" = "/settings") => {
    if (opening) return;
    setOpening(what);
    const r = await openBillingPortal(returnTo);
    if (r.ok) {
      window.location.assign(r.url);
      return; // navigating away
    }
    toast.error(r.error);
    setOpening(null);
  };

  const planName = status.plan ? PLAN_NAMES[status.plan] ?? status.plan : null;
  const interval = billingIntervalFromPeriod(status.currentPeriodStart, status.currentPeriodEnd);
  const price = planPriceLine(status.plan, interval);
  const billingEmail = user?.email ?? profileEmail ?? null;
  const billedTo = activeTenant?.name ?? companyName ?? null;

  const statusKey = status.status ?? (status.active ? "active" : "");
  const statusPill: { tone: PillTone; label: string } | null = !planName
    ? null
    : status.cancelAtPeriodEnd && status.currentPeriodEnd
      ? { tone: "amber", label: `Ends on ${format(status.currentPeriodEnd, "d MMM yyyy", { locale: enGB })}` }
      : status.active && (statusKey === "active" || statusKey === "trialing")
        ? { tone: "green", label: STATUS_LABELS[statusKey] ?? "Active" }
        : { tone: "amber", label: STATUS_LABELS[statusKey] ?? statusKey.replace(/_/g, " ") ?? "Inactive" };

  const renewLine = planName
    ? status.currentPeriodEnd
      ? status.cancelAtPeriodEnd
        ? `Ends on ${longDate(status.currentPeriodEnd)}`
        : `Renews on ${longDate(status.currentPeriodEnd)}`
      : null
    : "Pick a plan to start drafting, or buy a single letter.";

  const included = status.plan ? creditsPerCycleForPlan(status.plan) : 0;
  const allowanceEnd = status.allowanceEnd ?? status.currentPeriodEnd;
  const diff = letters.now - letters.before;

  return (
    <>
      <PaneHeader
        title="Billing"
        line="Only owners and admins can change the plan or payment details."
        right={
          planName ? (
            <PaneLink onClick={() => void portal("history")} disabled={!!opening}>
              {opening === "history" ? <Spinner /> : <History />}
              Billing history
            </PaneLink>
          ) : null
        }
      />

      <div className={cn("grid min-w-0 grid-cols-1 gap-3.5", planName && "lg:grid-cols-[minmax(0,1fr)_310px]")}>
        {/* Plan */}
        <section
          aria-label="Current plan"
          className="flex min-w-0 flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-5 sm:px-[22px]"
        >
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--ds-subtle)]">
            Current plan
            {statusPill && <Pill tone={statusPill.tone}>{statusPill.label}</Pill>}
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="ds-title m-0 text-[30px] leading-[1.1] tracking-[-0.02em] text-[var(--ds-ink)]">
              {planName ?? "No plan yet"}
            </h3>
            {price && (
              <div className="text-[15px] text-[var(--ds-ink)]">
                {price.price} <span className="text-[13.5px] text-[var(--ds-muted)]">{price.rest}</span>
              </div>
            )}
          </div>
          {renewLine && <div className="mt-1.5 text-[13.5px] text-[var(--ds-muted)]">{renewLine}</div>}
          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-[18px]">
            {planName ? (
              <>
                <Button onClick={() => void portal("manage")} disabled={!!opening}>
                  {opening === "manage" ? <Spinner /> : <CreditCard className="size-4" />}
                  {opening === "manage" ? "Opening…" : "Manage billing"}
                </Button>
                <Button variant="outline" onClick={() => void portal("change")} disabled={!!opening}>
                  {opening === "change" && <Spinner />}
                  {opening === "change" ? "Opening…" : "Change plan"}
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link to="/pricing">See plans</Link>
              </Button>
            )}
            <Link
              to="/pricing"
              className="ml-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] text-[13.5px] text-[var(--ds-ink)] hover:underline hover:underline-offset-[3px]"
            >
              Compare plans
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          {planName && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-[var(--ds-subtle)]">
              <Lock aria-hidden className="size-3 shrink-0" />
              Manage billing opens the secure Stripe customer portal
            </div>
          )}
        </section>

        {/* Payment method */}
        {planName && (
          <section
            aria-label="Payment method"
            className="min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-[18px]"
          >
            <div className="mb-3.5 flex items-center justify-between gap-3 text-[12.5px] text-[var(--ds-subtle)]">
              Payment method
              <PaneLink onClick={() => void portal("update")} disabled={!!opening} className="text-[13px] [&_svg]:size-3.5">
                {opening === "update" ? <Spinner className="size-3.5" /> : <Pencil />}
                Update
              </PaneLink>
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
              Your card is kept securely by Stripe. Update it in the billing portal.
            </p>
            {(billingEmail || billedTo) && (
              <dl className="m-0 mt-4 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-2 border-t border-[var(--ds-line-2)] pt-3.5 text-[13px]">
                {billingEmail && (
                  <>
                    <dt className="text-[var(--ds-subtle)]">Billing email</dt>
                    <dd className="m-0 text-right text-[var(--ds-ink)] [overflow-wrap:anywhere]">{breakAtSign(billingEmail)}</dd>
                  </>
                )}
                {billedTo && (
                  <>
                    <dt className="text-[var(--ds-subtle)]">Billed to</dt>
                    <dd className="m-0 break-words text-right text-[var(--ds-ink)]">{billedTo}</dd>
                  </>
                )}
              </dl>
            )}
          </section>
        )}
      </div>

      {/* Tiles */}
      <div className="mt-3.5 grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Tile
          label="Credits left this month"
          link={
            <Link to="/pricing#credits" className="text-[var(--ds-ink)] hover:underline hover:underline-offset-[3px]">
              Buy credits
            </Link>
          }
          value={status.credits}
          sub={
            included > 0
              ? `of ${included}${allowanceEnd ? ` · resets ${format(allowanceEnd, "d MMM", { locale: enGB })}` : ""}`
              : status.credits === 1
                ? "AI credit"
                : "AI credits"
          }
          bar={included > 0 ? { value: Math.min(1, status.credits / included), tone: "ink" } : undefined}
        />
        <Tile
          label="Letters this month"
          value={letters.now}
          sub={
            diff > 0
              ? `${diff} more than ${letters.prevMonth}`
              : diff < 0
                ? `${-diff} fewer than ${letters.prevMonth}`
                : `same as ${letters.prevMonth}`
          }
          bar={{ value: letters.now / Math.max(letters.now, letters.before, 1), tone: "slate" }}
        />
        <Tile
          label="Seats in use"
          link={
            onManageTeam ? (
              <button
                type="button"
                onClick={onManageTeam}
                className="text-[var(--ds-ink)] hover:underline hover:underline-offset-[3px]"
              >
                Manage team
              </button>
            ) : null
          }
          value={seats ?? (activeTenant ? "…" : 1)}
          sub={seats === 1 || (!activeTenant && seats === null) ? "person" : "people"}
        />
      </div>

      {/* Invoices */}
      {planName && (
        <section className="mt-[30px] min-w-0" aria-labelledby="invoices-title">
          <div className="mb-2.5 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h3 id="invoices-title" className="m-0 text-[15.5px] font-medium text-[var(--ds-ink)]">
                Invoices
              </h3>
              <p className="m-0 mt-0.5 break-words text-[13px] text-[var(--ds-muted)]">
                {billingEmail ? `Emailed to ${billingEmail} after each payment` : "Emailed after each payment"}
              </p>
            </div>
            <PaneLink onClick={() => void portal("invoices")} disabled={!!opening} className="text-[13.5px]">
              {opening === "invoices" && <Spinner className="size-3.5" />}
              View all in Stripe
            </PaneLink>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 border-y border-[var(--ds-line)] px-3 py-3.5 text-[13.5px] text-[var(--ds-body)]">
            Your invoices and receipts are in the Stripe billing portal.
          </div>
        </section>
      )}
    </>
  );
}

function Tile({
  label,
  link,
  value,
  sub,
  bar,
}: {
  label: string;
  link?: ReactNode;
  value: ReactNode;
  sub?: string;
  bar?: { value: number; tone: "ink" | "slate" };
}) {
  return (
    <div className="min-w-0 rounded-[14px] bg-[var(--ds-surface-2)] px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-[var(--ds-muted)]">
        <span className="min-w-0 truncate">{label}</span>
        {link ? <span className="shrink-0 text-[12.5px]">{link}</span> : null}
      </div>
      <div className="mt-1.5 truncate text-[24px] font-medium tracking-[-0.02em] text-[var(--ds-ink)]">
        {value}
        {sub && <span className="ml-1.5 text-[13px] font-normal tracking-normal text-[var(--ds-muted)]">{sub}</span>}
      </div>
      <div
        className="mt-2.5 h-[5px] overflow-hidden rounded-[5px] bg-[var(--ds-surface-3)]"
        aria-hidden
        style={bar ? undefined : { visibility: "hidden" }}
      >
        {bar && (
          <i
            className={cn(
              "block h-full rounded-[5px] transition-[width] duration-500 ease-[var(--ds-ease)] motion-reduce:transition-none",
              bar.tone === "ink" ? "bg-[var(--ds-ink)]" : "bg-[color-mix(in_srgb,var(--ds-subtle)_72%,var(--ds-blue-fg))]"
            )}
            style={{ width: `${Math.round(Math.max(0, Math.min(1, bar.value)) * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
