/**
 * Settings, Security: the "Audit log copy" card. Admin only.
 *
 * DraftHR keeps its own tamper-evident audit log and can also send a copy of
 * every entry to the company's own security monitoring tools (through the
 * WorkOS Audit Logs mirror). The card says this in plain words:
 *   - a "Copy on" pill when the mirror is enabled and configured
 *   - "Not set up" otherwise
 *   - whether the copy is connected, and when the last copy went
 *   - "Open setup portal" (POST /api/workos/portal-link with
 *     intent: "audit_logs"), the same wording as Directory sync
 *   - "Send a test entry" (POST /api/workos/audit-logs-test), which emits a
 *     synthetic event so the admin can confirm their tools receive it
 *     without performing a real draft action.
 *
 * Non-admin members never see this card (gated by activeTenant.role).
 */
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ScrollText, Send } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { FadeIn, Spinner } from "@/components/wizard/kit";
import { DefRow, SettingsCard } from "@/routes/settings/parts";
import { useAuth } from "@/lib/auth";

const ADMIN_ROLES = new Set(["owner", "admin"]);

type Status = {
  enabled: boolean;
  configured: boolean;
  workosOrgId: string | null;
  lastSentAt: string | null;
};

export function AuditLogsCard() {
  const { activeTenant } = useAuth();
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  // False until the first status answer (or failure) comes back: until then
  // the card shows grey placeholders, not "Not paired" or "Never".
  const [loaded, setLoaded] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/workos/audit-logs-status", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const json = (await res.json()) as Status;
      setStatus(json);
    } catch (err) {
      console.warn("[audit-logs] status fetch failed", err);
      setStatus(null);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onOpenPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/workos/portal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ intent: "audit_logs", returnUrl: "/settings" }),
      });
      const json = (await res.json()) as { link?: string; error?: string };
      if (!res.ok || !json.link) {
        toast.error(plainError(res.status, "Couldn't open the setup portal. Try again in a minute."));
        return;
      }
      window.open(json.link, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("[audit-logs] portal-link failed", err);
      toast.error("Couldn't reach DraftHR to open the setup portal. Check your connection and try again.");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const onSendTest = useCallback(async () => {
    setTestLoading(true);
    try {
      const res = await fetch("/api/workos/audit-logs-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(plainError(res.status, "Couldn't send the test entry. Try again in a minute."));
        return;
      }
      toast.success("Test entry sent", {
        // The server message names the vendor and its event codes; the
        // admin only needs to know where to look.
        description: "Check your security tools for the DraftHR test entry.",
      });
      void refresh();
    } catch (err) {
      console.warn("[audit-logs] test event failed", err);
      toast.error("Couldn't reach DraftHR to send the test entry. Check your connection and try again.");
    } finally {
      setTestLoading(false);
    }
  }, [refresh]);

  if (!isAdmin) return null;

  const streaming = Boolean(status?.enabled && status?.configured);

  return (
    <SettingsCard
      icon={<ScrollText />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Audit log copy
          {!loaded ? (
            <Placeholder className="h-[22px] w-[72px] rounded-full" label="Loading audit log status" />
          ) : streaming ? (
            <Pill tone="green">Copy on</Pill>
          ) : status?.configured ? (
            <Pill tone="amber">Set up, copy paused</Pill>
          ) : (
            <Pill tone="grey">Not set up</Pill>
          )}
        </span>
      }
      description="DraftHR records every action on your letters in an audit log that cannot be changed. A copy of each entry can also go to your company's own security tools. The log in DraftHR stays the original."
    >
      {!loaded ? (
        <dl className="m-0 divide-y divide-[var(--ds-line-2)] border-y border-[var(--ds-line-2)]">
          <DefRow label="Connection">
            <Placeholder className="h-3 w-[120px] rounded-full" />
          </DefRow>
          <DefRow label="Last copy sent">
            <Placeholder className="h-3 w-[96px] rounded-full" />
          </DefRow>
        </dl>
      ) : (
        <FadeIn>
          <dl className="m-0 divide-y divide-[var(--ds-line-2)] border-y border-[var(--ds-line-2)]">
            <DefRow label="Connection">
              {status?.workosOrgId ? "Connected" : "Not connected yet, contact support"}
            </DefRow>
            <DefRow label="Last copy sent">{formatLastSent(status?.lastSentAt ?? null)}</DefRow>
          </dl>
        </FadeIn>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading || !status?.configured || portalLoading} onClick={onOpenPortal}>
          {portalLoading ? <Spinner /> : <ExternalLink className="size-4" />}
          {portalLoading ? "Opening…" : "Open setup portal"}
        </Button>
        <Button variant="outline" disabled={loading || !streaming || testLoading} onClick={onSendTest}>
          {testLoading ? <Spinner /> : <Send className="size-4" />}
          {testLoading ? "Sending…" : "Send a test entry"}
        </Button>
      </div>
    </SettingsCard>
  );
}

/**
 * A plain message for a failed audit log call. The server's own error text
 * names the vendor and its settings, so it is not shown as is.
 */
export function plainError(status: number, fallback: string): string {
  if (status === 403) return "Only workspace owners and admins can change this.";
  if (status === 409) return "This workspace isn't connected yet. Contact support to turn on the audit log copy.";
  if (status === 503) return "The audit log copy is switched off for DraftHR right now. Contact support to turn it on.";
  return fallback;
}

/** "13 Oct 2026, 01:17" (en-GB), or "Never". */
export function formatLastSent(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Soft grey placeholder block (kit 09 "Loading"). */
function Placeholder({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block animate-pulse bg-[var(--ds-surface-2)] align-middle motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}
