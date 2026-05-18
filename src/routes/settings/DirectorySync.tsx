import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Separator,
  Table,
  Text,
} from "@radix-ui/themes";
import { ExternalLink, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ds";

/**
 * /settings/directory-sync — admin-only Directory Sync (SCIM / Google
 * Workspace) status panel. Surfaces whether the tenant is paired with a
 * WorkOS organization, lists the connected directories + provisioned users,
 * and opens the WorkOS Admin Portal so IT can configure / extend the
 * connection.
 *
 * We don't proxy any WorkOS UI here — the Admin Portal is the WorkOS-owned
 * surface and we just generate one-shot links to it. That keeps DraftHR out
 * of the IdP configuration business; we only need to know the outcome
 * (webhook events on `/api/workos/directory-webhook`).
 *
 * Light theme only — matches Settings.tsx conventions (Radix Themes + the
 * --ds-* CSS vars). No dark variants here.
 */
const ADMIN_ROLES = new Set(["owner", "admin"]);

type DirectoryUserRow = {
  userId: string;
  email: string | null;
  legalName: string | null;
  workosDirectoryId: string | null;
  workosDirectoryUserId: string | null;
  role: string;
  status: string;
  deprovisionedAt: string | null;
  joinedAt: string;
};

type DirectorySummary = {
  id: string;
  name: string;
  type: string;
  state: string;
  domain: string;
  updatedAt: string;
};

type DirectoryInfo = {
  configured: boolean;
  workosOrgId: string | null;
  directories: DirectorySummary[];
  users: DirectoryUserRow[];
};

export function DirectorySync() {
  const { activeTenant } = useAuth();
  const [info, setInfo] = useState<DirectoryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = activeTenant?.role ?? "";
  const isAdmin = ADMIN_ROLES.has(role);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workos/directory-info", { credentials: "same-origin" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to load directory info (${res.status})`);
        setInfo(null);
        return;
      }
      const data = (await res.json()) as DirectoryInfo;
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory info");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/workos/portal-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "dsync" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Couldn't open the WorkOS Admin Portal");
        return;
      }
      const { link } = (await res.json()) as { link: string };
      // Open in a new tab — the portal is a separate origin (workos.com).
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <Box className="max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader crumbs={[{ label: "Settings" }, { label: "Directory Sync" }]} title="Directory Sync" />
        <Card size="3">
          <Flex align="center" gap="3">
            <ShieldCheck className="size-5 text-[var(--gray-9)]" />
            <Box>
              <Heading size="3">Not allowed</Heading>
              <Text size="2" color="gray" as="p">
                Only workspace admins can view or change Directory Sync configuration. Ask an admin
                if you need IT to wire your IdP into DraftHR.
              </Text>
            </Box>
          </Flex>
        </Card>
      </Box>
    );
  }

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Settings" }, { label: "Directory Sync" }]}
        title="Directory Sync"
        lede="Auto-provision DraftHR seats from Okta, Entra ID (Azure AD), Google Workspace, or any SCIM 2.0 directory. Powered by WorkOS."
      />

      {error && (
        <Box mb="4">
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Box>
      )}

      <Flex direction="column" gap="4">
        <ConnectionCard
          info={info}
          loading={loading}
          portalLoading={portalLoading}
          onOpenPortal={openPortal}
          onRefresh={refresh}
        />
        {info && info.directories.length > 0 && <DirectoriesList directories={info.directories} />}
        {info && (
          <SyncedUsersTable users={info.users} />
        )}
      </Flex>
    </Box>
  );
}

function ConnectionCard({
  info,
  loading,
  portalLoading,
  onOpenPortal,
  onRefresh,
}: {
  info: DirectoryInfo | null;
  loading: boolean;
  portalLoading: boolean;
  onOpenPortal: () => void;
  onRefresh: () => void;
}) {
  const hasDirectories = (info?.directories.length ?? 0) > 0;

  return (
    <Card size="3">
      <Flex justify="between" align="start" gap="3" mb="3">
        <Box>
          <Heading size="3" mb="1">Connection</Heading>
          <Text size="2" color="gray" as="p">
            DraftHR receives provisioning events from your IdP via WorkOS. New hires get a seat
            automatically; offboarded users are deprovisioned without losing their audit history.
          </Text>
        </Box>
        <Flex gap="2">
          <Button variant="soft" color="gray" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={onOpenPortal} disabled={portalLoading} data-testid="open-portal">
            <ExternalLink className="size-4" />
            {portalLoading ? "Opening…" : "Open Admin Portal"}
          </Button>
        </Flex>
      </Flex>

      <Separator size="4" my="3" />

      {loading && !info ? (
        <Text size="2" color="gray">Loading…</Text>
      ) : hasDirectories ? (
        <Flex direction="column" gap="2">
          <Badge color="green" size="2" data-testid="connection-state">Connected</Badge>
          <Text size="2" color="gray" as="p">
            {info!.directories.length} {info!.directories.length === 1 ? "directory" : "directories"} linked to your
            WorkOS organization. Changes in your IdP propagate in real time.
          </Text>
        </Flex>
      ) : (
        <Flex direction="column" gap="2" data-testid="unconnected-cta">
          <Badge color="amber" size="2">Not configured</Badge>
          <Text size="2" color="gray" as="p">
            Open the WorkOS Admin Portal to connect Okta, Entra ID, Google Workspace, or any SCIM
            2.0 directory. After you finish the wizard, this page will show the connection.
          </Text>
        </Flex>
      )}
    </Card>
  );
}

function DirectoriesList({ directories }: { directories: DirectorySummary[] }) {
  return (
    <Card size="3">
      <Heading size="3" mb="3">Linked directories</Heading>
      <Flex direction="column" gap="2">
        {directories.map((d) => (
          <Flex
            key={d.id}
            justify="between"
            align="center"
            gap="3"
            className="rounded-md border border-[var(--gray-4)] px-3 py-2"
          >
            <Box className="min-w-0">
              <Text size="2" weight="medium" className="block truncate">{d.name}</Text>
              <Text size="1" color="gray" className="block truncate">{d.type} · {d.domain || "no domain"}</Text>
            </Box>
            <Badge color={d.state === "linked" ? "green" : d.state === "validating" ? "amber" : "gray"}>
              {d.state}
            </Badge>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

function SyncedUsersTable({ users }: { users: DirectoryUserRow[] }) {
  return (
    <Card size="3">
      <Flex align="center" gap="2" mb="3">
        <Users className="size-4 text-[var(--gray-9)]" />
        <Heading size="3">Synced users ({users.length})</Heading>
      </Flex>
      {users.length === 0 ? (
        <Text size="2" color="gray" as="p">
          No directory-provisioned users yet. Once your IdP starts syncing, users will appear here.
        </Text>
      ) : (
        <Table.Root variant="surface" size="2">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last update</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {users.map((u) => (
              <Table.Row key={u.userId}>
                <Table.Cell>{u.legalName ?? "—"}</Table.Cell>
                <Table.Cell>{u.email ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Badge color="gray">{u.role}</Badge>
                </Table.Cell>
                <Table.Cell>
                  {u.status === "active" ? (
                    <Badge color="green">Active</Badge>
                  ) : (
                    <Badge color="red">Deprovisioned</Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {(u.deprovisionedAt ?? u.joinedAt)
                    ? new Date(u.deprovisionedAt ?? u.joinedAt).toLocaleDateString()
                    : "—"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Card>
  );
}
