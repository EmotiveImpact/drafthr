/**
 * Settings → Audit Logs (WorkOS) card. Admin-only.
 *
 * Surfaces the dual-chain status:
 *   - "Streaming to WorkOS Audit Logs" pill when enabled + configured
 *   - "Not configured" otherwise
 *   - Last successful event timestamp
 *   - "Open Admin Portal" button (POST /api/workos/portal-link with
 *     intent: "audit_logs")
 *   - "Send test event" button (POST /api/workos/audit-logs-test) — emits
 *     a synthetic event so the admin can confirm the SIEM pipeline works
 *     end-to-end without performing a real draft action.
 *
 * Non-admin members never see this card — gated by activeTenant.role.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@radix-ui/themes";
import { SectionCard, StatusPill } from "@/components/reports/parts";
import { ExternalLink, ScrollText, Send } from "lucide-react";
import { toast } from "sonner";
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
      toast.success(json.message ?? "Test event sent. Check your SIEM.");
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
    <SectionCard
      icon={ScrollText}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Audit logs (WorkOS)
          {loading ? (
            <StatusPill tone="neutral" size="sm">Loading…</StatusPill>
          ) : streaming ? (
            <StatusPill tone="ok" size="sm">Streaming to WorkOS</StatusPill>
          ) : status?.configured ? (
            <StatusPill tone="warn" size="sm">Configured, mirror disabled</StatusPill>
          ) : (
            <StatusPill tone="neutral" size="sm">Not configured</StatusPill>
          )}
        </span>
      }
      description="Every audit event written to the local tamper-evident chain is also mirrored to WorkOS Audit Logs, so your SOC team can subscribe a SIEM feed. The local chain remains the source of truth."
    >
      <dl className="m-0 divide-y divide-[var(--ds-line-2)] border-y border-[var(--ds-line-2)] text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <dt className="text-[var(--ds-muted)]">WorkOS organisation</dt>
          <dd className="m-0 text-[var(--ds-ink)]">
            {status?.workosOrgId ? (
              <code className="ds-mono text-xs">{status.workosOrgId}</code>
            ) : (
              <span>Not paired, contact support</span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <dt className="text-[var(--ds-muted)]">Last successful mirror</dt>
          <dd className="m-0 text-[var(--ds-ink)]">{formatLastSent(status?.lastSentAt ?? null)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="soft"
          color="gray"
          disabled={!status?.configured || portalLoading}
          onClick={onOpenPortal}
        >
          <ExternalLink className="size-4" />
          {portalLoading ? "Opening…" : "Open WorkOS Admin Portal"}
        </Button>
        <Button
          variant="soft"
          disabled={!streaming || testLoading}
          onClick={onSendTest}
        >
          <Send className="size-4" />
          {testLoading ? "Sending…" : "Send test event"}
        </Button>
      </div>
    </SectionCard>
  );
}

function formatLastSent(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}
