/**
 * Settings → Audit Logs (WorkOS) card. Admin-only.
 *
 * Surfaces delivery configuration and confirmed queue state:
 *   - Pending and failed deliveries are visible instead of assumed successful
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Box, Button, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const ADMIN_ROLES = new Set(["owner", "admin"]);

type Status = {
  enabled: boolean;
  configured: boolean;
  workosOrgId: string | null;
  lastSentAt: string | null;
  deliveries: { pending: number; delivering: number; delivered: number; failed: number };
};

export function AuditLogsCard() {
  const { activeTenant, user } = useAuth();
  const tenantId = activeTenant?.id;
  const accountId = user?.id;
  const scopeKey = `${accountId ?? ""}:${tenantId ?? ""}`;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const refreshGeneration = useRef(0);
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");
  const [snapshot, setSnapshot] = useState<(Status & { scopeKey: string }) | null>(null);
  const status = snapshot?.scopeKey === scopeKey ? snapshot : null;
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin || !tenantId) return;
    const generation = ++refreshGeneration.current;
    const isCurrent = () => currentScope.current === scopeKey && refreshGeneration.current === generation;
    setLoading(true);
    try {
      const res = await fetch("/api/workos/audit-logs-status", {
        credentials: "same-origin",
        headers: { "X-Workspace-ID": tenantId, ...(accountId ? { "X-Account-ID": accountId } : {}) },
      });
      if (!res.ok) {
        if (isCurrent()) setSnapshot(null);
        return;
      }
      const json = (await res.json()) as Status;
      if (isCurrent()) setSnapshot({ ...json, scopeKey });
    } catch {
      if (isCurrent()) setSnapshot(null);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isAdmin, tenantId, accountId, scopeKey]);

  useEffect(() => {
    setPortalLoading(false);
    setTestLoading(false);
    void refresh();
    return () => { refreshGeneration.current++; };
  }, [refresh]);

  const onOpenPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/workos/portal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Workspace-ID": tenantId ?? "", ...(accountId ? { "X-Account-ID": accountId } : {}) },
        credentials: "same-origin",
        body: JSON.stringify({ intent: "audit_logs", returnUrl: "/settings" }),
      });
      const json = (await res.json()) as { link?: string; error?: string };
      if (currentScope.current !== scopeKey) return;
      if (!res.ok || !json.link) {
        toast.error(json.error ?? "Failed to open WorkOS Admin Portal");
        return;
      }
      window.open(json.link, "_blank", "noopener,noreferrer");
    } catch {
      if (currentScope.current === scopeKey) toast.error("Failed to open WorkOS Admin Portal");
    } finally {
      if (currentScope.current === scopeKey) setPortalLoading(false);
    }
  }, [tenantId, accountId, scopeKey]);

  const onSendTest = useCallback(async () => {
    setTestLoading(true);
    try {
      const res = await fetch("/api/workos/audit-logs-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Workspace-ID": tenantId ?? "", ...(accountId ? { "X-Account-ID": accountId } : {}) },
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; deliveryStatus?: string; message?: string; error?: string };
      if (currentScope.current !== scopeKey) return;
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Failed to send test event");
        return;
      }
      if (json.deliveryStatus === "delivered") toast.success(json.message ?? "Test event accepted by WorkOS.");
      else if (json.deliveryStatus === "failed") toast.error(json.message ?? "Test event saved; WorkOS delivery needs review.");
      else toast.info(json.message ?? "Test event saved; WorkOS delivery is pending.");
      void refresh();
    } catch {
      if (currentScope.current === scopeKey) toast.error("Failed to send test event");
    } finally {
      if (currentScope.current === scopeKey) setTestLoading(false);
    }
  }, [refresh, tenantId, accountId, scopeKey]);

  if (!isAdmin) return null;

  const deliveryEnabled = Boolean(status?.enabled && status?.configured);
  const pending = (status?.deliveries?.pending ?? 0) + (status?.deliveries?.delivering ?? 0);
  const failed = status?.deliveries?.failed ?? 0;

  return (
    <Card size="3">
      <Box mb="3">
        <Flex align="center" gap="2" mb="1">
          <Heading size="3">Audit Logs (WorkOS)</Heading>
          {loading ? (
            <Badge color="gray" variant="soft">Loading…</Badge>
          ) : !status ? (
            <Badge color="amber" variant="soft">Status unavailable</Badge>
          ) : failed > 0 ? (
            <Badge color="red" variant="soft">Delivery needs review</Badge>
          ) : pending > 0 ? (
            <Badge color="amber" variant="soft">Delivery pending</Badge>
          ) : deliveryEnabled ? (
            <Badge color="green" variant="soft">Delivery enabled</Badge>
          ) : status?.configured ? (
            <Badge color="amber" variant="soft">Configured, mirror disabled</Badge>
          ) : (
            <Badge color="gray" variant="soft">Not configured</Badge>
          )}
        </Flex>
        <Text size="2" color="gray" as="p">
          When enabled, new workspace audit events are queued for WorkOS Audit Logs.
          Failed delivery stays visible for review; your database audit history remains
          the source of truth. WorkOS acceptance does not confirm receipt by your SIEM.
        </Text>
      </Box>

      <Separator size="4" mb="3" />

      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" wrap="wrap" gap="2">
          <Text size="2" color="gray">WorkOS organization</Text>
          <Text size="2">
            {status?.workosOrgId ? (
              <code className="text-xs">{status.workosOrgId}</code>
            ) : (
              <span>Not paired — contact support</span>
            )}
          </Text>
        </Flex>
        <Flex justify="between" align="center" wrap="wrap" gap="2">
          <Text size="2" color="gray">Last WorkOS acceptance</Text>
          <Text size="2">{formatLastSent(status?.lastSentAt ?? null)}</Text>
        </Flex>
        {status && <Flex justify="between" align="center" wrap="wrap" gap="2">
          <Text size="2" color="gray">Delivery queue</Text>
          <Text size="2">{pending} pending · {failed} need review · {status.deliveries?.delivered ?? 0} accepted</Text>
        </Flex>}
      </Flex>

      <Separator size="4" my="3" />

      <Flex gap="2" wrap="wrap">
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
          disabled={!deliveryEnabled || testLoading}
          onClick={onSendTest}
        >
          <Send className="size-4" />
          {testLoading ? "Sending…" : "Send test event"}
        </Button>
      </Flex>
    </Card>
  );
}

function formatLastSent(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}
