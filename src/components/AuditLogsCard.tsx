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
      toast.success(json.message ?? "Test event sent — check your SIEM.");
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
    <Card size="3">
      <Box mb="3">
        <Flex align="center" gap="2" mb="1">
          <Heading size="3">Audit Logs (WorkOS)</Heading>
          {loading ? (
            <Badge color="gray" variant="soft">Loading…</Badge>
          ) : streaming ? (
            <Badge color="green" variant="soft">Streaming to WorkOS</Badge>
          ) : status?.configured ? (
            <Badge color="amber" variant="soft">Configured, mirror disabled</Badge>
          ) : (
            <Badge color="gray" variant="soft">Not configured</Badge>
          )}
        </Flex>
        <Text size="2" color="gray" as="p">
          Every audit event written to the local tamper-evident chain is also mirrored to
          WorkOS Audit Logs, so your SOC team can subscribe a SIEM feed. The local chain
          remains the source of truth.
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
          <Text size="2" color="gray">Last successful mirror</Text>
          <Text size="2">{formatLastSent(status?.lastSentAt ?? null)}</Text>
        </Flex>
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
          disabled={!streaming || testLoading}
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
