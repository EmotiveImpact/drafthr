import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import {
  clearTenantScopedLocalData,
  localNamespace,
  readLocalOwner,
  restoreStashedData,
  switchLocalWorkspace,
} from "@/lib/session/clearLocalData";
import { confirmLocalDataLoss } from "@/lib/session/localDataGuard";
import { setPersistenceSuspended } from "@/lib/storage/quota-safe-storage";

/**
 * Sidebar workspace switcher. Renders nothing when the user has <=1 workspace
 * (solo users don't need the affordance). The list is fetched once on mount
 * and refreshed when the menu opens — we don't poll, the active tenant
 * changes are user-initiated.
 */
export type Workspace = {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
};

/** Reverse a local swap after the server switch failed. */
function undoLocalSwap(fromNs: string, toNs: string): void {
  setPersistenceSuspended(false);
  if (!switchLocalWorkspace(toNs, fromNs)) restoreStashedData(fromNs);
  // Back on this workspace's own data, so this tab may persist again.
  setPersistenceSuspended(false);
}

export function WorkspaceSwitcher({
  subtitle,
  name,
  fallback = null,
  leading = null,
}: {
  /** Second line under the workspace name (e.g. "HR team"). */
  subtitle?: string;
  /** How the active workspace's name shows (e.g. without "Ltd"). */
  name?: (full: string) => string;
  /** Rendered instead when there is nothing to switch between. */
  fallback?: ReactNode;
  /** Rendered just before the switcher, only when it shows (the logo's D). */
  leading?: ReactNode;
} = {}) {
  const { activeTenant, user } = useAuth();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!AUTH_ENABLED || !activeTenant) return;
    try {
      const res = await fetch("/api/workspace/list", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { workspaces: Workspace[] };
      setWorkspaces(data.workspaces);
    } catch {
      /* offline / 401 — sidebar simply won't show the switcher */
    }
  }, [activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSwitch = async (tenantId: string) => {
    if (switching) return;
    if (tenantId === activeTenant?.id) return;
    setSwitching(true);
    // Keep this workspace's local data on the device, stashed under its own
    // namespace, and bring back the target workspace's (if any). Much of it
    // exists only here (employees, tasks, events, templates, evidence, and
    // every letter when sync is off), so it must never be silently deleted.
    // Done before the server switch so a full storage can still be cancelled.
    const fromNs = user ? readLocalOwner() ?? localNamespace(user.id, activeTenant!.id) : null;
    const toNs = user ? localNamespace(user.id, tenantId) : null;
    let swapped = false;
    if (fromNs && toNs) {
      swapped = switchLocalWorkspace(fromNs, toNs);
      if (!swapped && !(await confirmLocalDataLoss("switch"))) {
        setSwitching(false);
        return;
      }
    }
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        // Tenant A's data is never shown in tenant B (security board SA-01):
        // it was stashed above. If it couldn't be (storage full) the user
        // agreed to delete it. keepProfile: a switch is the same user, so
        // preserve their role/credits (board JA-03).
        if (!swapped) {
          clearTenantScopedLocalData({ keepProfile: true });
          if (toNs) switchLocalWorkspace(null, toNs);
        }
        // Hard reload so every Zustand store + sidebar nav re-reads the new
        // tenant's data. Cheap; we already do this on sign-out.
        window.location.assign("/");
        return;
      }
      // Surface the failure instead of silently no-op'ing (bug #20). A
      // deprovisioned seat still appears in the list and returns 403 here;
      // tell the user and refresh the list so the dead entry drops out.
      // The server refused: put this workspace's data back.
      if (swapped && fromNs && toNs) undoLocalSwap(fromNs, toNs);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(
        res.status === 403
          ? "You no longer have access to that workspace."
          : data.error ?? "Couldn't switch workspace. Please try again.",
      );
      void load();
    } catch {
      if (swapped && fromNs && toNs) undoLocalSwap(fromNs, toNs);
      toast.error("Couldn't switch workspace. You appear to be offline.");
    } finally {
      setSwitching(false);
    }
  };

  // Solo user — render nothing so the sidebar stays clean for the common case.
  if (!activeTenant || !workspaces || workspaces.length <= 1) return <>{fallback}</>;
  const shown = name ? name(activeTenant.name) : activeTenant.name;

  return (
    <>
      {leading}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group/ws relative -mx-1.5 inline-flex h-8 max-w-[calc(100%+0.75rem)] min-w-0 items-center rounded-[8px] px-1.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)]"
            aria-label="Switch workspace"
            title={subtitle ? `${activeTenant.name}, ${subtitle}` : activeTenant.name}
          >
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)]">
              {isCollapsed ? activeTenant.name[0] : shown}
            </span>
            {/* The button reaches into the gaps either side, so the name gets
             * the whole row; the chevron shows on hover, focus and while open,
             * over the end of the name. At rest the whole name fits beside the
             * search, bell and collapse tools (FEAT-X15). */}
            {!isCollapsed && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-r-[8px] bg-[linear-gradient(to_right,transparent,var(--ds-surface-2)_12px)] pr-1 pl-3.5 opacity-0 transition-opacity duration-[120ms] group-hover/ws:opacity-100 group-focus-visible/ws:opacity-100 group-active/ws:bg-[linear-gradient(to_right,transparent,var(--ds-surface-3)_12px)] group-data-[state=open]/ws:opacity-100"
              >
                <ChevronDown className="size-3.5 text-[var(--ds-subtle)]" />
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="min-w-60">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => void onSwitch(w.id)}
              disabled={switching}
            >
              <span className="flex-1 truncate">{w.name}</span>
              <span className="ml-2 text-[12px] capitalize text-[var(--ds-subtle)]">
                {w.role}
              </span>
              {w.isActive && <Check className="ml-2 size-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/signup/workspace" className="cursor-pointer">
              <Plus className="size-4" />
              Create workspace
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
