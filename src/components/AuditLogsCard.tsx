/**
 * Settings, Audit logs (WorkOS) card. Admin only.
 *
 * Shows the dual-chain status:
 *   - a "Streaming to WorkOS" pill when enabled and configured
 *   - "Not configured" otherwise
 *   - the last successful event time
 *   - "Open WorkOS Admin Portal" (POST /api/workos/portal-link with
 *     intent: "audit_logs")
 *   - "Send test event" (POST /api/workos/audit-logs-test), which emits a
 *     synthetic event so the admin can confirm the SIEM pipeline end to end
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
        toast.error(json.error ?? "Failed to open WorkOS Admin Portal");
        return;
      }
      window.open(json.link, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("[audit-logs] portal-link failed", err);
      toast.error("Failed to open WorkOS Admin Portal");
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
        toast.error(json.error ?? "Failed to send test event");
        return;
      }
      toast.success("Test event sent", {
        description: json.message ?? "Check your SIEM for the DraftHR test event.",
      });
      void refresh();
    } catch (err) {
      console.warn("[audit-logs] test event failed", err);
      toast.error("Failed to send test event");
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
          Audit logs (WorkOS)
          {!loaded ? (
            <Placeholder className="h-[22px] w-[132px] rounded-full" label="Loading audit log status" />
          ) : streaming ? (
            <Pill tone="green">Streaming to WorkOS</Pill>
          ) : status?.configured ? (
            <Pill tone="amber">Configured, mirror disabled</Pill>
          ) : (
            <Pill tone="grey">Not configured</Pill>
          )}
        </span>
      }
      description="Every audit event written to the local tamper-evident chain is also mirrored to WorkOS Audit Logs, so your SOC team can subscribe a SIEM feed. The local chain remains the source of truth."
    >
      {!loaded ? (
        <dl className="m-0 divide-y divide-[var(--ds-line-2)] border-y border-[var(--ds-line-2)]">
          <DefRow label="WorkOS organisation">
            <Placeholder className="h-3 w-[120px] rounded-full" />
          </DefRow>
          <DefRow label="Last successful mirror">
            <Placeholder className="h-3 w-[96px] rounded-full" />
          </DefRow>
        </dl>
      ) : (
        <FadeIn>
          <dl className="m-0 divide-y divide-[var(--ds-line-2)] border-y border-[var(--ds-line-2)]">
            <DefRow label="WorkOS organisation">
              {status?.workosOrgId ? (
                <code className="ds-mono text-[12.5px]">{status.workosOrgId}</code>
              ) : (
                "Not paired, contact support"
              )}
            </DefRow>
            <DefRow label="Last successful mirror">{formatLastSent(status?.lastSentAt ?? null)}</DefRow>
          </dl>
        </FadeIn>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading || !status?.configured || portalLoading} onClick={onOpenPortal}>
          {portalLoading ? <Spinner /> : <ExternalLink className="size-4" />}
          {portalLoading ? "Opening…" : "Open WorkOS Admin Portal"}
        </Button>
        <Button variant="outline" disabled={loading || !streaming || testLoading} onClick={onSendTest}>
          {testLoading ? <Spinner /> : <Send className="size-4" />}
          {testLoading ? "Sending…" : "Send test event"}
        </Button>
      </div>
    </SettingsCard>
  );
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
