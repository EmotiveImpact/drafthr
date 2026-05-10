import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  ScrollText,
  PlusCircle,
  Briefcase,
  UserRound,
  History,
  ShieldCheck,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  MoreHorizontal,
  Trash2,
  ArrowUpRight,
  Sun,
  Moon,
  Monitor,
  LayoutDashboard,
  Search,
  Sparkles,
  CalendarDays,
  FileDown,
  Activity as ActivityIcon,
  Bell,
} from "lucide-react";
import { deriveNotifications, topSeverity } from "@/lib/notifications";
import type { Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useThemeStore } from "@/lib/theme";

/**
 * App sidebar — collapsible icon ↔ expanded panel.
 *
 * Sections:
 *   1. Header   — Role switcher (current role + dropdown to swap)
 *   2. Navigate — Home, New letter, Search, Inbox, Archive, Notifications
 *   3. Recent drafts — project-list pattern with per-row action menu
 *   4. Footer   — User card with profile / privacy / theme dropdown
 *
 * Letter TYPES are NOT in the sidebar. They live in the dashboard's "Quick
 * start" section and on the dedicated browse page (/hr/new or /me/new).
 */
export function AppSidebar() {
  const loc = useLocation();
  const profileRole = useProfileStore((s) => s.profile.role);

  const mode: Mode | null = loc.pathname.startsWith("/hr")
    ? "employer"
    : loc.pathname.startsWith("/me")
    ? "employee"
    : profileRole;

  return (
    <SidebarShell>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>

      <SidebarContent>
        <NavigatePrimary mode={mode} />
        <NavRecentDrafts mode={mode} />
        <NavPlatform />
      </SidebarContent>

      <SidebarFooter>
        <NavUser mode={mode} />
      </SidebarFooter>
      <SidebarRail />
    </SidebarShell>
  );
}

/**
 * Sidebar wrapper that:
 *   1. Tags the root with `group/sb` so the brand icon can react to a
 *      sidebar-wide hover (used by collapsed Brand).
 *   2. When collapsed (desktop only), turns the whole sidebar surface into
 *      an "expand" affordance. Clicks on empty space inside the sidebar
 *      expand it; clicks on a real link/button keep their normal behaviour.
 */
function SidebarShell({ children }: { children: React.ReactNode }) {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <Sidebar
      collapsible="icon"
      className={collapsed ? "group/sb cursor-pointer" : "group/sb"}
      onClick={(e) => {
        if (!collapsed) return;
        const t = e.target as HTMLElement;
        // Don't intercept clicks on real interactive descendants.
        if (
          t.closest(
            'a, button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], input, textarea, select, [data-radix-popper-content-wrapper]'
          )
        ) {
          return;
        }
        toggleSidebar();
      }}
    >
      {children}
    </Sidebar>
  );
}

/* ------------------------------------------------------------------ */
/*  Header — role switcher                                            */
/* ------------------------------------------------------------------ */

/**
 * Brand header.
 *
 * Expanded:
 *   - [Logo + "HR Letter"] non-interactive (just identity)
 *   - Right-side action button → collapse sidebar
 *
 * Collapsed (desktop):
 *   - Brand icon shown by default
 *   - On hover, the icon swaps to a "panel-left-open" expand glyph
 *   - Click anywhere on the icon → expand the sidebar
 */
function Brand() {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  if (isCollapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Expand sidebar (⌘B)"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            className="group/brand cursor-pointer"
          >
            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md shadow-xs relative">
              {/* Default: brand glyph. On hover (brand OR anywhere on the
                  collapsed sidebar), swap to the expand glyph. */}
              <ScrollText className="size-4 transition-opacity duration-150 group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0 group-hover/sb:opacity-0" />
              <PanelLeftOpen className="size-4 absolute opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100 group-hover/sb:opacity-100" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="lg"
          className="hover:bg-transparent active:bg-transparent cursor-default"
        >
          <Link to="/" className="cursor-default">
            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md shadow-xs">
              <ScrollText className="size-4" />
            </div>
            <div className="grid flex-1 text-left leading-tight min-w-0">
              <span className="text-sm font-semibold tracking-tight truncate">HR Letter</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                UK & US drafting
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuAction
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (⌘B)"
        >
          <PanelLeftClose />
        </SidebarMenuAction>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Body — primary navigation                                         */
/* ------------------------------------------------------------------ */

function NavigatePrimary({ mode }: { mode: Mode | null }) {
  const loc = useLocation();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const notifs = deriveNotifications(Object.values(drafts), profile);
  const actionable = notifs.filter((n) => n.severity !== "info").length;
  const top = topSeverity(notifs);
  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;

  const items: { href: string | null; label: string; Icon: typeof LayoutDashboard; tooltip: string; disabled?: boolean }[] = [
    {
      href: prefix,
      label: "Home",
      Icon: LayoutDashboard,
      tooltip: "Dashboard",
    },
    {
      href: prefix ? `${prefix}/new` : null,
      label: "New letter",
      Icon: PlusCircle,
      tooltip: "Browse letter types",
    },
    {
      href: "/calendar",
      label: "Calendar",
      Icon: CalendarDays,
      tooltip: "Deadlines across all your drafts",
    },
    {
      href: "/exported",
      label: "Exported",
      Icon: FileDown,
      tooltip: "Letters you've finalised",
    },
    {
      href: "/activity",
      label: "Activity",
      Icon: ActivityIcon,
      tooltip: "Audit trail of your drafts",
    },
    {
      href: "/notifications",
      label: "Notifications",
      Icon: Bell,
      tooltip: "Deadline reminders & compliance alerts",
    },
    {
      href: null,
      label: "Search",
      Icon: Search,
      tooltip: "Search drafts (coming soon)",
      disabled: true,
    },
  ];

  if (!prefix) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Get started</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="HR / Management">
                <Link to="/hr">
                  <Briefcase />
                  <span>HR / Management</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Employee">
                <Link to="/me">
                  <UserRound />
                  <span>Employee</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const showBadge = it.label === "Notifications" && actionable > 0 && top;
            return (
              <SidebarMenuItem key={it.label}>
                {it.href && !it.disabled ? (
                  <SidebarMenuButton
                    asChild
                    tooltip={it.tooltip}
                    isActive={loc.pathname === it.href}
                  >
                    <Link to={it.href}>
                      <it.Icon />
                      <span className="truncate flex-1 min-w-0">{it.label}</span>
                      {showBadge && (
                        <span
                          className={`ml-auto shrink-0 min-w-[18px] h-[18px] grid place-items-center rounded-full text-[10px] font-medium px-1 ${
                            top === "urgent"
                              ? "bg-rose-500 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {actionable > 9 ? "9+" : actionable}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    tooltip={it.tooltip}
                    className="text-muted-foreground cursor-not-allowed"
                    aria-disabled
                  >
                    <it.Icon />
                    <span className="truncate flex-1 min-w-0">{it.label}</span>
                    <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider opacity-70">soon</span>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavRecentDrafts({ mode }: { mode: Mode | null }) {
  const { isMobile } = useSidebar();
  const loc = useLocation();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);

  const list = Object.values(drafts)
    .filter((d) => (mode ? d.mode === mode : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  if (list.length === 0) return null;

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Recent drafts</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {list.map((d) => {
              const href = `/editor/${d.id}`;
              const label = d.letterType.replace(/_/g, " ");
              const sub =
                d.mode === "employer"
                  ? d.employee.legalName || "(no recipient)"
                  : `to ${d.employer.legalName || "(employer)"}`;
              return (
                <SidebarMenuItem key={d.id}>
                  <SidebarMenuButton asChild isActive={loc.pathname === href} tooltip={`${label} · ${sub}`}>
                    <Link to={href}>
                      <History />
                      <span className="truncate flex-1 min-w-0">{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label="Draft actions">
                        <MoreHorizontal />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-44 rounded-md"
                      side={isMobile ? "bottom" : "right"}
                      align="start"
                    >
                      <DropdownMenuItem onClick={() => nav(href)} className="gap-2">
                        <ArrowUpRight className="size-4" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteDraft(d.id)}
                        className="gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function NavPlatform() {
  const loc = useLocation();
  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="What's new (coming soon)" className="text-muted-foreground">
                <Sparkles />
                <span className="truncate flex-1 min-w-0">What's new</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Privacy & data" isActive={loc.pathname === "/privacy"}>
                <Link to="/privacy">
                  <ShieldCheck />
                  <span className="truncate flex-1 min-w-0">Privacy & data</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer — NavUser-style card                                       */
/* ------------------------------------------------------------------ */

function NavUser({ mode }: { mode: Mode | null }) {
  const { isMobile } = useSidebar();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const nav = useNavigate();

  const display = profile.personal.preferredName ?? profile.personal.legalName ?? "Set up profile";
  const email = profile.personal.email ?? (profile.role ? "Local profile" : "");
  const initials = (profile.personal.preferredName ?? profile.personal.legalName ?? "??")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = mode === "employer" ? "HR / Management" : mode === "employee" ? "Employee" : "Not set";
  const swapTo: Mode = mode === "employer" ? "employee" : "employer";
  const swapLabel = swapTo === "employer" ? "HR / Management" : "Employee";
  const SwapIcon = swapTo === "employer" ? Briefcase : UserRound;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              tooltip={display}
            >
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md text-xs">{initials || "??"}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                <span className="truncate font-medium">{display}</span>
                <span className="truncate text-xs text-muted-foreground">{email || roleLabel}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-md"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Role · {roleLabel}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                setRole(swapTo);
                nav(swapTo === "employer" ? "/hr" : "/me");
              }}
              className="gap-2"
            >
              <SwapIcon className="size-4" />
              <span>Switch to {swapLabel}</span>
              <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav("/pick-role")} className="gap-2">
              <ScrollText className="size-4" />
              Role picker
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Account
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => nav("/settings")} className="gap-2">
              <SettingsIcon className="size-4" />
              Profile & settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav("/privacy")} className="gap-2">
              <ShieldCheck className="size-4" />
              Privacy & data
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setThemeMode("light")} className="gap-2">
              <Sun className="size-4" /> Light
              {themeMode === "light" && <span className="ml-auto text-xs">·</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemeMode("dark")} className="gap-2">
              <Moon className="size-4" /> Dark
              {themeMode === "dark" && <span className="ml-auto text-xs">·</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemeMode("system")} className="gap-2">
              <Monitor className="size-4" /> System
              {themeMode === "system" && <span className="ml-auto text-xs">·</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
