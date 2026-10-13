import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Pill } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Band } from "@/components/wizard/Band";
import { Callout, FadeIn, LoadingRows, Spinner } from "@/components/wizard/kit";
import { SettingsCard } from "./parts";

/**
 * /settings/directory-sync: admin-only Directory Sync (SCIM / Google
 * Workspace) status panel. Shows whether the tenant is paired with a WorkOS
 * organisation, lists the connected directories and provisioned users, and
 * opens the WorkOS Admin Portal so IT can configure or extend the
 * connection.
 *
 * We don't proxy any WorkOS UI here. The Admin Portal is the WorkOS-owned
 * surface and we just generate one-shot links to it. That keeps DraftHR out
 * of the IdP configuration business; we only need to know the outcome
 * (webhook events on `/api/workos/directory-webhook`).
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

const CRUMBS = [{ label: "Settings", href: "/settings?tab=integrations" }, { label: "Directory Sync" }];

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "Not known";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not known";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sentence(s: string): string {
  const t = s.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

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
        setError(data.error ?? "Couldn't load directory details. Try again in a minute.");
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
      // Open in a new tab: the portal is a separate origin (workos.com).
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
        <Band crumbs={CRUMBS} title="Directory Sync" />
        <div className="max-w-[720px]">
          <SettingsCard
            icon={<ShieldCheck />}
            title="Not allowed"
            description="Only workspace admins can view or change Directory Sync configuration. Ask an admin if you need IT to wire your IdP into DraftHR."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        crumbs={CRUMBS}
        title="Directory Sync"
        lede="Auto-provision DraftHR seats from Okta, Entra ID (Azure AD), Google Workspace, or any SCIM 2.0 directory. Powered by WorkOS."
      />

      <div className="flex max-w-[1000px] flex-col gap-3.5">
        {error && (
          <Callout tone="error" title="Couldn't load Directory Sync." role="alert">
            {error}
          </Callout>
        )}
        <ConnectionCard
          info={info}
          loading={loading}
          portalLoading={portalLoading}
          onOpenPortal={openPortal}
          onRefresh={refresh}
        />
        {info && info.directories.length > 0 && <DirectoriesList directories={info.directories} />}
        {info && <SyncedUsersTable users={info.users} />}
      </div>
    </div>
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
  const count = info?.directories.length ?? 0;

  return (
    <SettingsCard
      title="Connection"
      description="DraftHR receives provisioning events from your IdP via WorkOS. New hires get a seat automatically; offboarded users are deprovisioned without losing their audit history."
      actions={
        <>
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="size-4" />}
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={onOpenPortal} disabled={portalLoading} data-testid="open-portal">
            {portalLoading ? <Spinner /> : <ExternalLink className="size-4" />}
            {portalLoading ? "Opening…" : "Open Admin Portal"}
          </Button>
        </>
      }
    >
      <div className="border-t border-[var(--ds-line-2)] pt-4">
        {loading && !info ? (
          <LoadingRows rows={1} label="Loading connection" />
        ) : count > 0 ? (
          <div className="flex flex-col items-start gap-2">
            <span data-testid="connection-state">
              <Pill tone="green">Connected</Pill>
            </span>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              {count} {count === 1 ? "directory" : "directories"} linked to your WorkOS organisation. Changes in your
              IdP propagate in real time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2" data-testid="unconnected-cta">
            <Pill tone="amber">Not configured</Pill>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              Open the WorkOS Admin Portal to connect Okta, Entra ID, Google Workspace, or any SCIM 2.0 directory.
              After you finish the setup there, this page will show the connection.
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function DirectoriesList({ directories }: { directories: DirectorySummary[] }) {
  return (
    <SettingsCard title="Linked directories">
      <FadeIn className="flex flex-col">
        {directories.map((d) => (
          <div
            key={d.id}
            className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--ds-line-2)] py-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{d.name}</div>
              <div className="truncate text-[12.5px] text-[var(--ds-muted)]">
                {sentence(d.type)} · {d.domain || "no domain"}
              </div>
            </div>
            <Pill tone={d.state === "linked" ? "green" : d.state === "validating" ? "amber" : "grey"}>
              {sentence(d.state)}
            </Pill>
          </div>
        ))}
      </FadeIn>
    </SettingsCard>
  );
}

function SyncedUsersTable({ users }: { users: DirectoryUserRow[] }) {
  return (
    <SettingsCard
      icon={<Users />}
      title={`Synced users (${users.length})`}
    >
      {users.length === 0 ? (
        <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
          No directory-provisioned users yet. Once your IdP starts syncing, users will appear here.
        </p>
      ) : (
        <FadeIn className="-mx-5 overflow-x-auto sm:-mx-[22px]">
          <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[var(--ds-subtle)]">
                {["Name", "Email", "Role", "Status", "Last update"].map((h) => (
                  <th key={h} className="border-b border-[var(--ds-line)] px-5 pb-2.5 font-medium sm:first:pl-[22px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-hover)]">
                  <td className="px-5 py-3 text-[var(--ds-ink)] sm:pl-[22px]">{u.legalName ?? "Not given"}</td>
                  <td className="px-5 py-3 text-[var(--ds-body)]">{u.email ?? "Not given"}</td>
                  <td className="px-5 py-3">
                    <Pill tone="grey" dot={false}>
                      {sentence(u.role)}
                    </Pill>
                  </td>
                  <td className="px-5 py-3">
                    {/* Red is only for errors; a removed directory user is neutral. */}
                    {u.status === "active" ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Deprovisioned</Pill>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[var(--ds-muted)]">
                    {shortDate(u.deprovisionedAt ?? u.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FadeIn>
      )}
    </SettingsCard>
  );
}
