import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark, Wordmark } from "@/components/ds";
import {
  PanelLeftOpen,
  PanelLeftClose,
  PlusCircle,
  Briefcase,
  UserRound,
  History,
  ShieldCheck,
  ChevronsUpDown,
  Settings as SettingsIcon,
  MoreHorizontal,
  Trash2,
  ArrowUpRight,
  LogOut,
  LayoutDashboard,
  Search,
  CalendarDays,
  FileDown,
  Activity as ActivityIcon,
  Bell,
  FolderOpen,
  ChevronDown,
  FileText,
  Users,
  Layers,
  ClipboardCheck,
  BarChart3,
} from "lucide-react";
import { activeMatters, MATTER_COLOR_CLASSES, draftsInMatter } from "@/lib/matters";
import { briefTitleFor, displayTitleFor } from "@/lib/letters/display";
import type { Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useAuth } from "@/lib/auth";
import { deriveNotifications, topSeverity } from "@/lib/notifications";
import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { useSearchPaletteToggle } from "@/components/SearchPaletteContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

/**
 * App sidebar.
 *
 *   Header — brand + bell + trigger.
 *     • Brand is a plain <Link> (NOT a SidebarMenuButton) so the primitive's
 *       size override doesn't shrink the tile when the sidebar collapses —
 *       the 32x32 brand tile is the same size in both states.
 *     • Bell handles all notifications (one surface, not two — there's no
 *       separate "Notifications" nav item).
 *     • Trigger is the explicit collapse/expand button.
 *     • When sidebar is COLLAPSED, clicking the brand tile expands it.
 *     • Layout flips from row → column on collapse so the three controls
 *       stack vertically in the icon strip.
 *
 *   Body  — primary nav · recent drafts · platform group.
 *   Footer — user card with role / account / theme dropdown.
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
        <BrandHeader />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup data-tour="workspace-switcher">
          <SidebarGroupContent>
            <WorkspaceSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
        <NavigatePrimary mode={mode} />
        <NavRecentDrafts mode={mode} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser mode={mode} />
      </SidebarFooter>

      <SidebarRail />
    </SidebarShell>
  );
}

/**
 * Sidebar wrapper with click-anywhere-to-expand when collapsed (taken from
 * the committed version). Clicking any empty space inside the icon-strip
 * expands the sidebar; clicks on real interactive elements (links, buttons,
 * dropdown items) keep their normal behaviour.
 */
function SidebarShell({ children }: { children: React.ReactNode }) {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      // Mobile: sheet slides in from the right to match the hamburger
      // position in the mobile topbar. Desktop sidebar stays on the left
      // where the persistent rail belongs.
      side={isMobile ? "right" : "left"}
      className={collapsed ? "cursor-pointer" : undefined}
      onClick={(e) => {
        if (!collapsed) return;
        const t = e.target as HTMLElement;
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
/*  Header                                                             */
/* ------------------------------------------------------------------ */

function BrandHeader() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  /*
   * Two-button row, exactly like the committed version:
   *   - Brand <Link>: plain anchor, NOT SidebarMenuButton — 32x32 tile stays
   *     32x32 in both states. When collapsed, hover swaps the icon to
   *     PanelLeftOpen and click expands. When expanded, click goes to "/".
   *   - Collapse <button>: visible only when expanded. Sits on the right of
   *     the brand row. Click → collapse. (When collapsed it disappears, since
   *     the whole sidebar surface acts as the expand affordance via SidebarShell.)
   */
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Link
        to="/"
        onClick={(e) => {
          if (isCollapsed) {
            e.preventDefault();
            toggleSidebar();
          }
        }}
        aria-label={isCollapsed ? "Expand sidebar" : "DRAFTHR home"}
        title={isCollapsed ? "Expand sidebar (⌘B)" : "DRAFTHR"}
        className="group/brand flex items-center gap-2 min-w-0 cursor-pointer"
      >
        <div className="relative shrink-0">
          <BrandMark
            size={40}
            className={cn(
              "transition-opacity duration-150",
              isCollapsed && "group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0"
            )}
          />
          {isCollapsed && (
            <span className="absolute inset-0 grid place-items-center rounded-md bg-[var(--ds-ink)] text-white opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100">
              <PanelLeftOpen className="size-4" />
            </span>
          )}
        </div>
        {!isCollapsed && (
          <span className="flex flex-col leading-tight min-w-0 -mt-1">
            <Wordmark size={19} className="truncate" />
            <span className="text-[11px] text-[var(--ds-muted)] mt-0.5 truncate">
              Words that carry weight.
            </span>
          </span>
        )}
      </Link>

      {!isCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (⌘B)"
          className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0"
        >
          <PanelLeftClose className="size-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Body — primary navigation                                          */
/* ------------------------------------------------------------------ */

function NavigatePrimary({ mode }: { mode: Mode | null }) {
  const loc = useLocation();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const realDrafts = Object.values(drafts).filter((d) => !d.isTemplateSource);
  const notifs = deriveNotifications(realDrafts, profile);
  const actionable = notifs.filter((n) => n.severity !== "info").length;
  const top = topSeverity(notifs);
  const inReviewCount = realDrafts.filter(
    (d) => d.reviewStatus === "in_review"
  ).length;
  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;
  const search = useSearchPaletteToggle();

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

  /**
   * Three logical groups:
   *  - PRIMARY: the actions you start every session with (Home / New letter
   *    / Search). Search at the bottom because it's a fallback when you
   *    can't find a thing — not the first thing you reach for.
   *  - WATCH: things that need attention this week (Notifications, then
   *    Calendar). Notifications first so the badge is the most prominent
   *    thing on the rail.
   *  - ARCHIVE: look-back surfaces (Activity, Exported).
   *
   * Recent drafts hangs below all three from NavRecentDrafts.
   */
  const primary: NavItem[] = [
    { href: prefix, label: "Home", Icon: LayoutDashboard, tooltip: "Dashboard" },
    { href: `${prefix}/new`, label: "New letter", Icon: PlusCircle, tooltip: "Browse letter types" },
    // Portfolio-level surfaces — HR mode only (the multi-employee workbench).
    // Employee mode users have one self-record + one matter; these surfaces
    // would be empty noise for them.
    ...(mode === "employer"
      ? ([
          { href: "/employees", label: "Employees", Icon: Users, tooltip: "Workspace employee directory" },
          { href: "/bulk", label: "Bulk operations", Icon: Layers, tooltip: "CSV → batch drafts" },
          { href: "/reports", label: "Reports", Icon: BarChart3, tooltip: "Compliance, risk & operations rollup" },
        ] satisfies NavItem[])
      : []),
  ];

  const watch: NavItem[] = [
    { href: "/notifications", label: "Notifications", Icon: Bell, tooltip: "Deadline reminders & compliance alerts" },
    // HR-only — approval queue is a Business-tier feature for HR drafters
    // shipping work to reviewers (HR Director, in-house counsel).
    ...(mode === "employer"
      ? ([
          { href: "/approvals", label: "Approvals", Icon: ClipboardCheck, tooltip: "Drafts waiting for sign-off" },
        ] satisfies NavItem[])
      : []),
    { href: "/calendar", label: "Calendar", Icon: CalendarDays, tooltip: "Deadlines across all your drafts" },
  ];

  const archive: NavItem[] = [
    { href: "/activity", label: "Activity", Icon: ActivityIcon, tooltip: "Audit trail of your drafts" },
    { href: "/exported", label: "Exported", Icon: FileDown, tooltip: "Letters you've finalised" },
  ];

  const renderItem = (it: NavItem) => {
    const showNotifBadge = it.label === "Notifications" && actionable > 0 && top;
    const showApprovalsBadge = it.label === "Approvals" && inReviewCount > 0;
    // Tour anchor keys — stable selectors for the OnboardingTour. Keep in
    // sync with HR_STEPS in OnboardingTour.tsx.
    const tourKey =
      it.label === "Employees"
        ? "nav-employees"
        : it.label === "Reports"
          ? "nav-reports"
          : undefined;
    return (
      <SidebarMenuItem key={it.label} data-tour={tourKey}>
        {it.href && !it.disabled ? (
          <SidebarMenuButton asChild tooltip={it.tooltip} isActive={loc.pathname === it.href}>
            <Link to={it.href}>
              <it.Icon />
              <span>{it.label}</span>
            </Link>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton
            tooltip={it.tooltip}
            className="text-muted-foreground cursor-not-allowed"
            aria-disabled
          >
            <it.Icon />
            <span>{it.label}</span>
          </SidebarMenuButton>
        )}
        {showNotifBadge && (
          <SidebarMenuBadge
            className={cn(
              "px-1 text-[10px] text-white",
              top === "urgent" ? "bg-rose-500" : "bg-amber-500"
            )}
          >
            {actionable > 9 ? "9+" : actionable}
          </SidebarMenuBadge>
        )}
        {showApprovalsBadge && (
          <SidebarMenuBadge className="px-1 text-[10px] text-white bg-amber-500">
            {inReviewCount > 9 ? "9+" : inReviewCount}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {/* PRIMARY actions — Home / New letter / Search */}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {primary.map(renderItem)}
            {/* Search opens the Cmd+K palette. Lives at the bottom of the
             * primary group rather than its own row so power-users see
             * it next to their main entry points. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Search drafts, letter types, pages (⌘K)"
                onClick={() => search.setOpen(true)}
              >
                <Search />
                <span>Search</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="border border-letter-rule bg-muted text-muted-foreground px-1 text-[10px]">
                ⌘K
              </SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* WATCH — things that need attention this week */}
      <SidebarGroup>
        <SidebarGroupLabel>Watch</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{watch.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* ARCHIVE — look-back surfaces */}
      <SidebarGroup>
        <SidebarGroupLabel>Archive</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{archive.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* MATTERS — named cases. Parent label is clickable → /matters
       *   sub-items are each matter; the active matter's letters expand
       *   inline below it. */}
      <NavMatters mode={mode!} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Matters group                                                      */
/* ------------------------------------------------------------------ */

function NavMatters({ mode }: { mode: Mode }) {
  const loc = useLocation();
  const matters = useDraftStore((s) => s.matters);
  const drafts = useDraftStore((s) => s.drafts);

  const allMatters = activeMatters(Object.values(matters), mode);
  const allDrafts = Object.values(drafts).filter((d) => !d.isTemplateSource);

  const onIndexPage = loc.pathname === "/matters";
  const activeMatterId = loc.pathname.startsWith("/matters/")
    ? loc.pathname.slice("/matters/".length)
    : null;

  return (
    <SidebarGroup data-tour="nav-matters">
      <SidebarGroupLabel className="flex items-center gap-1">
        <Link
          to="/matters"
          className={cn(
            "flex items-center gap-1.5 px-1 py-0.5 -mx-1 rounded hover:text-sidebar-foreground transition",
            onIndexPage && "text-sidebar-foreground font-semibold"
          )}
        >
          <FolderOpen className="size-3" />
          <span>Matters</span>
        </Link>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {allMatters.length}
        </span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {allMatters.length === 0 ? (
            <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
              <div className="px-2 py-1 text-[11px] text-muted-foreground italic">
                None yet. Promote a Home group →
              </div>
            </SidebarMenuItem>
          ) : (
            allMatters.map((m) => {
              const matterHref = `/matters/${m.id}`;
              const isActive = activeMatterId === m.id;
              const matterDrafts = draftsInMatter(allDrafts, m.id);
              return (
                <div key={m.id}>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip={m.name}
                      isActive={isActive}
                    >
                      <Link to={matterHref}>
                        <span
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            MATTER_COLOR_CLASSES[m.color].dot
                          )}
                        />
                        <span className="truncate">{m.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Inline letters for the active matter — Notion-tree pattern. */}
                  {isActive && matterDrafts.length > 0 && (
                    <div className="ml-3 pl-2 border-l border-sidebar-border group-data-[collapsible=icon]:hidden">
                      {matterDrafts.map((d) => {
                        const href = `/editor/${d.id}`;
                        const label = briefTitleFor(d);
                        return (
                          <SidebarMenuItem key={d.id}>
                            <SidebarMenuButton
                              asChild
                              size="sm"
                              isActive={loc.pathname === href}
                              tooltip={displayTitleFor(d)}
                            >
                              <Link to={href}>
                                <FileText className="size-3 text-muted-foreground" />
                                <span className="truncate text-[12px]">{label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// Mark ChevronDown as used (reserved for future expand/collapse on
// individual matter rows). The current implementation auto-expands the
// active matter only, but the chevron will appear when we add per-row
// expand state.
void ChevronDown;

type NavItem = {
  href: string | null;
  label: string;
  Icon: typeof LayoutDashboard;
  tooltip: string;
  disabled?: boolean;
};

function NavRecentDrafts({ mode }: { mode: Mode | null }) {
  const { isMobile } = useSidebar();
  const loc = useLocation();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);

  const list = Object.values(drafts)
    .filter((d) => !d.isTemplateSource)
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
                      <span>{label}</span>
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


/* ------------------------------------------------------------------ */
/*  Footer — user card                                                 */
/* ------------------------------------------------------------------ */

function NavUser({ mode }: { mode: Mode | null }) {
  const { isMobile, state } = useSidebar();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const { signOut, user } = useAuth();
  const nav = useNavigate();
  const isCollapsed = state === "collapsed" && !isMobile;

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={display}
          title={display}
          className="group/user flex items-center gap-2 min-w-0 w-full rounded-md p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8 rounded-md shrink-0">
            <AvatarFallback className="rounded-md text-xs">{initials || "??"}</AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <>
              <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                <span className="truncate font-medium">{display}</span>
                <span className="truncate text-xs text-muted-foreground">{email || roleLabel}</span>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-60 rounded-md"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Role · {roleLabel}</DropdownMenuLabel>
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
          <UserRound className="size-4" />
          Role picker
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => nav("/settings")} className="gap-2">
          <SettingsIcon className="size-4" />
          Profile & settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav("/privacy")} className="gap-2">
          <ShieldCheck className="size-4" />
          Privacy & data
        </DropdownMenuItem>

        {user ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="gap-2 text-[var(--ds-red-fg)] focus:text-[var(--ds-red-fg)]"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
