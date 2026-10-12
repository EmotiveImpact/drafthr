/**
 * Settings → Billing card.
 *
 * Shows the caller's current plan and credit balance, and opens the Stripe
 * Billing Portal ("Manage billing") where they can change plan, update the
 * card, download invoices or cancel. Plan changes made there reach the app
 * through the billing webhook. Workspace plans can only be managed by owners
 * and admins; the server enforces that and its message is shown as a toast.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@radix-ui/themes";
import { CreditCard, ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getBillingStatus, openBillingPortal, type BillingStatus } from "@/lib/billing/api";
import { useDraftStore } from "@/lib/store";
import { SectionCard, StatTile, StatTileGrid, StatusPill } from "@/components/reports/parts";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  employee_plus: "Employee Plus",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Start of the current allowance window, or the first of this month. */
function windowStart(status: BillingStatus | null): number {
  if (status?.allowanceStart) return status.allowanceStart;
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function BillingCard({ fallback = null }: { fallback?: ReactNode } = {}) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const drafts = useDraftStore((s) => s.drafts);

  useEffect(() => {
    let cancelled = false;
    void getBillingStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lettersThisPeriod = useMemo(() => {
    const from = windowStart(status);
    return Object.values(drafts).filter((d) => d.createdAt >= from).length;
  }, [drafts, status]);

  if (!status?.configured) return <>{fallback}</>;

  const onManage = async () => {
    if (opening) return;
    setOpening(true);
    const r = await openBillingPortal("/settings");
    if (r.ok) {
      window.location.assign(r.url);
      return; // navigating away
    }
    toast.error(r.error);
    setOpening(false);
  };

  const planName = status.plan ? PLAN_NAMES[status.plan] ?? status.plan : null;

  const planFoot = planName
    ? status.currentPeriodEnd
      ? status.cancelAtPeriodEnd
        ? `Ends on ${formatDate(status.currentPeriodEnd)}`
        : `Renews on ${formatDate(status.currentPeriodEnd)}`
      : status.active
        ? "Active"
        : (status.status ?? "").replace("_", " ")
    : "You don't have a plan yet";

  return (
    <SectionCard
      icon={CreditCard}
      title="Billing"
      description={
        planName
          ? "Change plan, update your card, download invoices or cancel. Workspace plans can be managed by workspace owners and admins."
          : "Pick a plan to start drafting, or buy a single letter."
      }
      actions={
        <>
          {planName ? (
            <Button onClick={onManage} disabled={opening}>
              {opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
              {opening ? "Opening…" : "Manage billing"}
            </Button>
          ) : null}
          <Button variant="soft" color="gray" asChild>
            <Link to="/pricing">{planName ? "Compare plans" : "See plans"}</Link>
          </Button>
        </>
      }
    >
      <StatTileGrid cols={3} className="lg:grid-cols-3">
        <StatTile
          label="Current plan"
          icon={CreditCard}
          value={planName ?? "None"}
          className="col-span-2 lg:col-span-1"
          foot={
            <>
              {planName && !status.active && status.status ? (
                <StatusPill tone="warn" size="sm">
                  {status.status.replace("_", " ")}
                </StatusPill>
              ) : null}
              <span className="truncate">{planFoot}</span>
            </>
          }
        />
        <StatTile
          label="AI credits left"
          icon={Sparkles}
          value={status.credits}
          foot={status.credits === 1 ? "1 AI credit available" : `${status.credits} AI credits available`}
        />
        <StatTile
          label="Letters this month"
          icon={FileText}
          value={lettersThisPeriod}
          foot="Started on this device"
        />
      </StatTileGrid>
    </SectionCard>
  );
}
