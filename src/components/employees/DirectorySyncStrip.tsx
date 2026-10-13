import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ds";

type Directory = { name?: string; state?: string; updatedAt?: string };
type SyncState =
  | { kind: "loading" }
  | { kind: "linked"; provider: string; updatedAt?: string }
  | { kind: "off" }
  | { kind: "unknown" };

const ADMIN_ROLES = new Set(["owner", "admin"]);

function ago(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/**
 * The Directory Sync strip on /employees (employees mock `.sync`), from the
 * real `/api/workos/directory-info`: on with the provider and last sync when
 * a linked directory is reported, off when none is configured, and a quiet
 * line when the status cannot be checked. Only owners and admins get the
 * Manage or Set up button. The role comes from the signed-in workspace, or
 * from the local profile when there is no session (auth off), the same
 * fallback the comments use.
 *
 * Without a signed-in workspace there is nothing for Directory Sync to
 * connect to, so a failed check there reads as "off", not as an error.
 */
export function DirectorySyncStrip() {
  const { activeTenant } = useAuth();
  const profileRole = useProfileStore((s) => s.profile.workspaceRole);
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? profileRole ?? "");
  const signedIn = !!activeTenant;
  const [state, setState] = useState<SyncState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    fetch("/api/workos/directory-info", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { configured?: boolean; directories?: Directory[] };
        if (!live) return;
        const linked = (data.directories ?? []).find((d) => d.state === "linked" || d.state === "active");
        if (data.configured && linked) setState({ kind: "linked", provider: linked.name || "your directory", updatedAt: linked.updatedAt });
        else if (data && typeof data === "object" && "configured" in data) setState({ kind: "off" });
        else setState({ kind: "unknown" });
      })
      .catch(() => live && setState(signedIn ? { kind: "unknown" } : { kind: "off" }));
    return () => {
      live = false;
    };
  }, [signedIn]);

  if (state.kind === "loading") {
    return (
      <div aria-busy="true" aria-label="Checking directory sync" className="mb-4 flex items-center gap-3 rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-[11px]">
        <span className="size-7 shrink-0 animate-pulse rounded-[8px] bg-[var(--ds-surface-3)] motion-reduce:animate-none" />
        <span className="h-3 w-64 max-w-full animate-pulse rounded bg-[var(--ds-surface-3)] motion-reduce:animate-none" />
      </div>
    );
  }
  if (state.kind === "unknown") {
    return <p className="m-0 mb-4 text-[12.5px] text-[var(--ds-subtle)]">Directory sync status could not be checked right now.</p>;
  }

  const on = state.kind === "linked";
  const when = on ? ago(state.updatedAt) : null;
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-[11px]">
      <span className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)]">
        <RefreshCw aria-hidden className="size-[14px]" />
      </span>
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-[var(--ds-ink)]">
          {on ? "Directory sync is on" : "Directory sync is off"}
          {on && <Pill tone="green">Connected</Pill>}
        </div>
        <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
          {on
            ? `Synced from ${state.provider}${when ? ` ${when}` : ""}. New starters appear here automatically and leavers keep their letter history.`
            : "Connect Google Workspace or Microsoft Entra so new starters appear here automatically."}
        </p>
      </div>
      {isAdmin && (
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings/directory-sync">{on ? "Manage sync" : "Set up sync"}</Link>
        </Button>
      )}
    </div>
  );
}
