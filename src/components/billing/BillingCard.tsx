/**
 * Settings → Billing card.
 *
 * Shows the caller's current plan and credit balance, and opens the Stripe
 * Billing Portal ("Manage billing") where they can change plan, update the
 * card, download invoices or cancel. Plan changes made there reach the app
 * through the billing webhook. Workspace plans can only be managed by owners
 * and admins; the server enforces that and its message is shown as a toast.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getBillingStatus, openBillingPortal, type BillingStatus } from "@/lib/billing/api";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  employee_plus: "Employee Plus",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function BillingCard() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBillingStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.configured) return null;

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

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <CreditCard className="size-4 text-[var(--ds-muted)]" aria-hidden />
          <Heading as="h3" size="3" weight="medium">
            Billing
          </Heading>
        </Flex>

        {planName ? (
          <Text size="2" color="gray" as="p" style={{ maxWidth: 560 }}>
            {status.active ? "You're on " : "Your plan: "}
            <strong>{planName}</strong>
            {!status.active && status.status ? ` (${status.status.replace("_", " ")})` : ""}
            {status.currentPeriodEnd
              ? status.cancelAtPeriodEnd
                ? `. Ends on ${formatDate(status.currentPeriodEnd)}.`
                : `. Renews on ${formatDate(status.currentPeriodEnd)}.`
              : "."}{" "}
            {status.credits} AI {status.credits === 1 ? "credit" : "credits"} available.
          </Text>
        ) : (
          <Text size="2" color="gray" as="p" style={{ maxWidth: 560 }}>
            You don't have a plan yet. {status.credits > 0 ? `${status.credits} AI credits available.` : ""}
          </Text>
        )}

        <Flex gap="2" wrap="wrap">
          {planName ? (
            <Button onClick={onManage} disabled={opening}>
              {opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
              {opening ? "Opening…" : "Manage billing"}
            </Button>
          ) : null}
          <Button variant="soft" asChild>
            <Link to="/pricing">{planName ? "Compare plans" : "See plans"}</Link>
          </Button>
        </Flex>

        {planName ? (
          <Text size="1" color="gray" as="p">
            Change plan, update your card, download invoices or cancel. Workspace plans can be
            managed by workspace owners and admins.
          </Text>
        ) : null}
      </Flex>
    </Card>
  );
}
