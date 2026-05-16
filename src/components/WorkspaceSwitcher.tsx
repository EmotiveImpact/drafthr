import { useCallback, useEffect, useState } from "react";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";

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

export function WorkspaceSwitcher() {
  const { activeTenant } = useAuth();
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
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        // Hard reload so every Zustand store + sidebar nav re-reads the new
        // tenant's data. Cheap; we already do this on sign-out.
        window.location.assign("/");
      }
    } finally {
      setSwitching(false);
    }
  };

  // Solo user — render nothing so the sidebar stays clean for the common case.
  if (!activeTenant || !workspaces || workspaces.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="sm"
          className="w-full justify-between gap-2"
          aria-label="Switch workspace"
        >
          <span className="truncate">{isCollapsed ? activeTenant.name[0] : activeTenant.name}</span>
          {!isCollapsed && <ChevronsUpDown className="size-3.5 opacity-60" />}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={6} className="min-w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => void onSwitch(w.id)}
            disabled={switching}
          >
            <span className="flex-1 truncate">{w.name}</span>
            <span className="ml-2 text-[10px] uppercase tracking-wider opacity-60">
              {w.role}
            </span>
            {w.isActive && <Check className="ml-2 size-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/signup/workspace" className="cursor-pointer">
            <Plus className="size-3.5 mr-2" />
            Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
