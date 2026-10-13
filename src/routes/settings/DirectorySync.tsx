import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { Pill } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Band } from "@/components/wizard/Band";
import { Callout, FadeIn, LoadingRows, Spinner } from "@/components/wizard/kit";
import { SettingsCard } from "./parts";

/**
 * /settings/directory-sync: admin-only directory sync (SCIM / Google
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

const CRUMBS = [{ label: "Settings", href: "/settings?tab=integrations" }, { label: "Directory sync" }];

const LEDE =
  "Keep who can use DraftHR in step with your company directory: Okta, Microsoft Entra ID, Google Workspace or any SCIM directory. New starters get access automatically, and leavers lose it.";

/** WorkOS directory types in plain names ("gsuite directory" is Google
 * Workspace). Unknown types fall back to the type in sentence case. */
const DIRECTORY_TYPES: Record<string, string> = {
  "gsuite directory": "Google Workspace",
  "azure scim v2.0": "Microsoft Entra ID",
  "okta scim v2.0": "Okta",
  "onelogin scim v2.0": "OneLogin",
  "jump cloud scim v2.0": "JumpCloud",
  "pingfederate scim v2.0": "PingFederate",
  "rippling scim v2.0": "Rippling",
  "cyberark scim v2.0": "CyberArk",
  "generic scim v2.0": "SCIM directory",
  "generic scim v1.1": "SCIM directory",
  bamboohr: "BambooHR",
  "breathe hr": "Breathe HR",
  "cezanne hr": "Cezanne HR",
  "fourth hr": "Fourth HR",
  gusto: "Gusto",
  hibob: "HiBob",
  "people hr": "People HR",
  personio: "Personio",
  workday: "Workday",
};

function directoryTypeName(type: string): string {
  return DIRECTORY_TYPES[type.trim().toLowerCase()] ?? sentence(type);
}

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

  // No session (auth off): fall back to the local profile's role, as the
  // Employees strip and comments do, so a local owner is not told "Not allowed".
  const profileRole = useProfileStore((st) => st.profile.workspaceRole);
  const role = activeTenant?.role ?? profileRole ?? "";
  const isAdmin = ADMIN_ROLES.has(role);
  // Without a signed-in workspace (local mode) there is nothing for
  // directory sync to connect to: the page reads as "off", as the Employees
  // strip does, rather than as an error.
  const signedIn = !!activeTenant;

  const refresh = useCallback(async () => {
    if (!isAdmin || !signedIn) return;
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
      // A non-JSON answer (no API behind this address, as in local mode)
      // reads as "not available", never as a parser message.
      const data = (await res.json().catch(() => null)) as DirectoryInfo | null;
      if (!data || typeof data !== "object") {
        setError("Directory sync isn't available right now. Try again in a minute.");
        setInfo(null);
        return;
      }
      setInfo(data);
    } catch {
      setError("Couldn't reach DraftHR to check directory sync. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, signedIn]);

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
        toast.error(data.error ?? "Couldn't open the setup portal. Try again in a minute.");
        return;
      }
      const { link } = (await res.json()) as { link: string };
      // Open in a new tab: the portal is a separate origin (workos.com).
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Couldn't reach DraftHR to open the setup portal. Check your connection and try again.", {
        description: err instanceof Error && err.message ? err.message : undefined,
      });
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
        <Band crumbs={CRUMBS} title="Directory sync" />
        <div className="max-w-[720px]">
          <SettingsCard
            icon={<ShieldCheck />}
            title="Not allowed"
            description="Only workspace owners and admins can view or change directory sync. Ask an admin if you need it set up."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        crumbs={CRUMBS}
        title="Directory sync"
        lede={LEDE}
      />

      <div className="flex max-w-[1000px] flex-col gap-3.5">
        {error && (
          <Callout tone="error" title="Couldn't load directory sync" role="alert">
            {error}
          </Callout>
        )}
        <ConnectionCard
          signedIn={signedIn}
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
  signedIn,
  info,
  loading,
  portalLoading,
  onOpenPortal,
  onRefresh,
}: {
  signedIn: boolean;
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
      description="When someone joins or leaves in your company directory, DraftHR gives or removes their access. Leavers keep their letter history."
      actions={
        <>
          {signedIn && (
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              {loading ? <Spinner /> : <RefreshCw className="size-4" />}
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          )}
          <Button
            onClick={onOpenPortal}
            disabled={portalLoading || !signedIn}
            title={signedIn ? "Opens the secure setup portal in a new tab" : "Sign in to your workspace to set up directory sync"}
            data-testid="open-portal"
          >
            {portalLoading ? <Spinner /> : <ExternalLink className="size-4" />}
            {portalLoading ? "Opening…" : "Open setup portal"}
          </Button>
        </>
      }
    >
      <div className="border-t border-[var(--ds-line-2)] pt-4">
        {!signedIn ? (
          <div className="flex flex-col items-start gap-2" data-testid="unconnected-cta">
            <span data-testid="connection-state">
              <Pill tone="grey">Off</Pill>
            </span>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              Directory sync is off. It connects to a signed-in workspace, so sign in to your workspace to set it up.
            </p>
          </div>
        ) : loading && !info ? (
          <LoadingRows rows={1} label="Loading connection" />
        ) : count > 0 ? (
          <div className="flex flex-col items-start gap-2">
            <span data-testid="connection-state">
              <Pill tone="green">Connected</Pill>
            </span>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              {count} {count === 1 ? "directory" : "directories"} connected. People added or removed there show up here
              straight away.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2" data-testid="unconnected-cta">
            <span data-testid="connection-state">
              <Pill tone="grey">Off</Pill>
            </span>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              Directory sync is off. Open the setup portal to connect Okta, Microsoft Entra ID, Google Workspace or any
              SCIM directory. Once it is set up there, the connection shows here.
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
                {directoryTypeName(d.type)} · {d.domain || "no domain"}
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
          No one has been added from your directory yet. People appear here once it starts syncing.
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
