import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
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
import { Avatar } from "@/components/ds/Avatar";
import { BrandMark, Wordmark } from "@/components/ds";
import {
  PanelLeftOpen,
  PanelLeft,
  Plus,
  Briefcase,
  UserRound,
  ShieldCheck,
  ChevronsUpDown,
  ChevronDown,
  Settings as SettingsIcon,
  MoreHorizontal,
  Trash2,
  ArrowUpRight,
  LogOut,
  House,
  Search,
  CalendarDays,
  FileDown,
  Activity as ActivityIcon,
  Bell,
  FolderOpen,
  FileText,
  Files,
  Users,
  Layers,
  ClipboardCheck,
  BarChart3,
  GraduationCap,
  Inbox,
  Store,
  UserCog,
  CircleCheck,
} from "lucide-react";
import { activeMatters, MATTER_COLOR_CLASSES, draftsInMatter } from "@/lib/matters";
import { briefTitleFor, displayTitleFor } from "@/lib/letters/display";
import type { Draft, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { undeleteDraft } from "@/lib/dual-write";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";
import { deriveNotifications, topSeverity } from "@/lib/notifications";
import { useSearchPaletteToggle } from "@/components/SearchPaletteContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { getLetterMeta } from "@/lib/letters/catalog";

/**
 * App sidebar, Harvey-style (design option 1A).
 *
 *   Header  brand tile + wordmark, search and collapse tools; the workspace
 *           block (name and team, a switcher when there are several); a
 *           prominent "New letter" button.
 *   Body    icon + label navigation. Recent letters nest under "Letters" and
 *           matters under "Matters". Quiet "Watch" and "Archive" groups.
 *   Footer  Settings, then the user card with the role / account menu.
 *
 * Collapses to an icon strip on desktop (⌘B, the collapse button, the rail,
 * or a click on any empty part of the strip expands it again). On mobile the
 * shadcn primitive renders it inside a Sheet opened from the topbar.
 */
/**
 * Sidebar-local mode type — extends the letter-writing Mode with a
 * "consultant" branch for marketplace specialists who don't write
 * letters at all. We don't push "consultant" into the global Mode type
 * because that would cascade through every letter type, draft, and
 * wizard call site — and a consultant doesn't draft.
 */
export type SidebarMode = Mode | "consultant";

/* Shared row styling, mirroring the prototype's .s1a-item: 34px rows,
 * muted icons, a soft filled pill for the active page. */
const NAV_BUTTON =
  "h-[34px] gap-2.5 rounded-[var(--ds-r-s)] px-[9px] text-[14px] text-sidebar-foreground " +
  "hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] hover:text-[var(--ds-ink)] " +
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-[var(--ds-ink)] data-[active=true]:font-medium " +
  "[&>svg]:text-[var(--ds-subtle)] hover:[&>svg]:text-[var(--ds-ink)] data-[active=true]:[&>svg]:text-[var(--ds-ink)]";

/* Nested rows (recent letters, matters), mirroring .s1a-subitem. */
const SUB_BUTTON =
  "h-8 gap-2 rounded-[var(--ds-r-s)] pl-2.5 pr-2 text-[13.5px] text-[var(--ds-muted)] " +
  "hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] hover:text-[var(--ds-ink)] " +
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-[var(--ds-ink)] data-[active=true]:font-medium";

/* Count chip, mirroring .s1a-count. */
const COUNT_BADGE =
  "ds-mono right-1.5 h-[18px] min-w-[18px] rounded-full px-[5px] text-[11.5px] font-medium " +
  "bg-[var(--ds-chip)] text-[var(--ds-muted)] peer-hover/menu-button:text-[var(--ds-muted)] peer-data-active/menu-button:text-[var(--ds-muted)] " +
  "peer-data-[size=default]/menu-button:top-2";

const GROUP_LABEL =
  "h-7 px-[9px] text-[11.5px] font-medium tracking-[0.02em] text-[var(--ds-subtle)]";

export function AppSidebar() {
  const loc = useLocation();
  const profileRole = useProfileStore((s) => s.profile.role);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);

  // Consultant routes win when the user is actually inside /c — they're
  // unambiguously in the consultant context. Otherwise the per-user
  // profileRole is the source of truth so an HR user who has tested the
  // consultant flow doesn't see consultant nav on shared routes like
  // /consultants, /settings, or /matters. consultantEnrolled is only the
  // last-resort fallback when the user has no profile role yet.
  const mode: SidebarMode | null = loc.pathname.startsWith("/c/")
    || loc.pathname === "/c"
    ? "consultant"
    : loc.pathname.startsWith("/hr")
    ? "employer"
    : loc.pathname.startsWith("/me")
    ? "employee"
    : profileRole
    ?? (consultantEnrolled ? "consultant" : null);

  return (
    <SidebarShell>
      <SidebarHeader className="gap-0 px-1 pt-1.5 pb-1 group-data-[collapsible=icon]:px-2 in-data-[mobile=true]:px-3 in-data-[mobile=true]:pt-3.5">
        <BrandHeader />
        <WorkspaceBlock mode={mode} />
        <NewLetterButton mode={mode} />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 group-data-[collapsible=icon]:px-2 in-data-[mobile=true]:px-3">
        <NavigatePrimary mode={mode} />
      </SidebarContent>

      <SidebarFooter className="gap-0 px-1 pb-1 pt-2 group-data-[collapsible=icon]:px-2 in-data-[mobile=true]:px-3 in-data-[mobile=true]:pb-3">
        <NavFooter />
        <NavUser mode={mode} />
      </SidebarFooter>

      <SidebarRail />
    </SidebarShell>
  );
}

/**
 * Sidebar wrapper with click-anywhere-to-expand when collapsed. Clicking any
 * empty space inside the icon-strip expands the sidebar; clicks on real
 * interactive elements (links, buttons, dropdown items) keep their normal
 * behaviour.
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

const TOOL_BUTTON =
  "size-7 grid place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-subtle)] hover:bg-sidebar-accent hover:text-[var(--ds-ink)] shrink-0";

function BrandHeader() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const search = useSearchPaletteToggle();

  /*
   * Brand <Link>: a plain anchor, so the tile keeps its size in both states.
   * When collapsed, hover swaps the tile for PanelLeftOpen and a click
   * expands the sidebar. When expanded, a click goes to "/".
   * Search and collapse tools sit on the right when expanded.
   */
  return (
    <div className="flex h-8 w-full items-center justify-between gap-2 pl-1 pr-0.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
      <Link
        to="/"
        onClick={(e) => {
          if (isCollapsed) {
            e.preventDefault();
            toggleSidebar();
          }
        }}
        aria-label={isCollapsed ? "Expand sidebar" : "DraftHR home"}
        title={isCollapsed ? "Expand sidebar (⌘B)" : "DraftHR"}
        className="group/brand flex items-center gap-2 min-w-0 cursor-pointer"
      >
        <div className="relative shrink-0">
          <BrandMark
            size={26}
            className={cn(
              "rounded-[var(--ds-r-s)] transition-opacity duration-150",
              isCollapsed && "group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0"
            )}
          />
          {isCollapsed && (
            <span className="absolute inset-0 grid place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100">
              <PanelLeftOpen className="size-4" />
            </span>
          )}
        </div>
        {!isCollapsed && <Wordmark size={15} className="truncate" />}
      </Link>

      {!isCollapsed && (
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => search.setOpen(true)}
            aria-label="Search"
            title="Search letters, letter types and pages (⌘K)"
            className={TOOL_BUTTON}
          >
            <Search className="size-[15px]" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isMobile ? "Close menu" : "Collapse sidebar"}
            title={isMobile ? "Close menu" : "Collapse sidebar (⌘B)"}
            className={TOOL_BUTTON}
          >
            <PanelLeft className="size-[15px]" />
          </button>
        </span>
      )}
    </div>
  );
}

function roleLabelFor(mode: SidebarMode | null): string {
  return mode === "employer"
    ? "HR / Management"
    : mode === "employee"
    ? "Employee"
    : mode === "consultant"
    ? "Consultant"
    : "Not set";
}

/**
 * Workspace name and team, like the prototype's org block. When the user
 * belongs to several workspaces the whole block is the switcher's trigger;
 * otherwise it is a static label. Hidden in the icon strip.
 */
function WorkspaceBlock({ mode }: { mode: SidebarMode | null }) {
  const { activeTenant } = useAuth();
  const orgName = useProfileStore((s) => s.profile.employer.legalName);
  const name = activeTenant?.name || orgName?.trim() || "DraftHR";
  const team = mode === "employer" ? "HR team" : roleLabelFor(mode);

  return (
    <div
      data-tour="workspace-switcher"
      className="pt-2.5 pb-3.5 group-data-[collapsible=icon]:hidden"
    >
      <WorkspaceSwitcher
        subtitle={team}
        fallback={
          <div className="min-w-0 px-1">
            <div className="truncate text-[14.5px] font-medium text-[var(--ds-ink)]">{name}</div>
            <div className="mt-px truncate text-[12px] text-[var(--ds-muted)]">{team}</div>
          </div>
        }
      />
    </div>
  );
}

/**
 * The prominent "New letter" button. Only for the two letter-writing modes;
 * consultants review letters rather than write them. In the icon strip it
 * shrinks to a plus.
 */
function NewLetterButton({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;
  if (!prefix) return null;
  const href = `${prefix}/new`;
  return (
    <SidebarMenu className="pb-3">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip="New letter"
          isActive={loc.pathname === href}
          className={cn(
            "h-9 justify-center gap-[7px] rounded-[var(--ds-r-s)] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[13.5px] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]",
            "hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] data-[active=true]:bg-[var(--ds-surface-2)] data-[active=true]:text-[var(--ds-ink)]",
            "group-data-[collapsible=icon]:border-[var(--ds-line-strong)]"
          )}
        >
          <Link to={href}>
            <Plus className="size-[15px]" />
            <span className="group-data-[collapsible=icon]:hidden">New letter</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Body — primary navigation                                          */
/* ------------------------------------------------------------------ */

type NavItem = {
  href: string | null;
  label: string;
  Icon: typeof House;
  tooltip: string;
  disabled?: boolean;
};

function NavRow({ it, isActive }: { it: NavItem; isActive: boolean }) {
  return (
    <SidebarMenuButton asChild tooltip={it.tooltip} isActive={isActive} className={NAV_BUTTON}>
      <Link to={it.href!}>
        <it.Icon />
        <span>{it.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

function NavigatePrimary({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const consultantProfile = useConsultantStore((s) => s.profile);
  // Memoised: deriveNotifications runs a regex compliance scan over EVERY
  // draft, and this sidebar re-renders on every navigation/store change.
  // Unmemoised it cost tens of ms per render. (Senior sweep B11.)
  const { actionable, top, inReviewCount } = useMemo(() => {
    const realDrafts = Object.values(drafts).filter((d) => !d.isTemplateSource);
    const n = deriveNotifications(realDrafts, profile);
    return {
      actionable: n.filter((x) => x.severity !== "info").length,
      top: topSeverity(n),
      inReviewCount: realDrafts.filter((d) => d.reviewStatus === "in_review").length,
    };
  }, [drafts, profile]);
  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;
  const search = useSearchPaletteToggle();

  // In the icon strip the header's search tool is hidden, so search gets
  // its own icon row there.
  const collapsedSearch = (
    <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
      <SidebarMenuButton
        tooltip="Search (⌘K)"
        onClick={() => search.setOpen(true)}
        className={NAV_BUTTON}
      >
        <Search />
        <span>Search</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  /* ─── Consultant sidebar ────────────────────────────────────────────
   * Consultants don't write letters — they review them. Their nav is
   * entirely different from HR/Employee: an inbox of inbound booking
   * requests, the marketplace, their profile, and the matters they're
   * actively reviewing. This whole block returns early so none of the
   * HR-mode drafts / employees / approvals UI bleeds in.
   */
  if (mode === "consultant") {
    const consultantNav: NavItem[] = [
      { href: "/c", label: "Home", Icon: House, tooltip: "Dashboard" },
      { href: "/c/profile", label: "My profile", Icon: UserCog, tooltip: "Edit your marketplace card" },
      { href: "/consultants", label: "Marketplace", Icon: Store, tooltip: "Browse all specialists" },
    ];
    return (
      <>
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {collapsedSearch}
              {consultantNav.map((it) => (
                <SidebarMenuItem key={it.label}>
                  <NavRow it={it} isActive={loc.pathname === it.href} />
                </SidebarMenuItem>
              ))}
              {/* No standalone "Inbox" row: the booking inbox already renders
               * on /c (ConsultantHome → ConsultantInbox), which is the "Home"
               * row above. A separate Inbox row pointing at /c duplicated
               * Home's target and double-highlighted on /c (bug #22), and a
               * disabled "coming soon" placeholder falsely implied the inbox
               * didn't exist yet. Removed rather than re-pointed at /c. */}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupLabel className={GROUP_LABEL}>At a glance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              <SidebarMenuItem>
                <NavRow
                  it={{ href: "/notifications", label: "Notifications", Icon: Bell, tooltip: "Notifications" }}
                  isActive={loc.pathname === "/notifications"}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavRow
                  it={{ href: "/activity", label: "Activity", Icon: ActivityIcon, tooltip: "Activity" }}
                  isActive={loc.pathname === "/activity"}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!consultantProfile && (
          <SidebarGroup className="px-0 py-1">
            <SidebarGroupContent>
              <div className="mx-1 mt-2 rounded-[var(--ds-r-m)] bg-[var(--ds-amber-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--ds-amber-fg)] group-data-[collapsible=icon]:hidden">
                <span className="font-semibold">Profile incomplete.</span>{" "}
                <Link to="/c/profile" className="underline">Finish your card</Link> to be discoverable.
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </>
    );
  }

  if (!prefix) {
    const starts: NavItem[] = [
      { href: "/hr", label: "HR / Management", Icon: Briefcase, tooltip: "HR / Management" },
      { href: "/me", label: "Employee", Icon: UserRound, tooltip: "Employee" },
      { href: "/c", label: "Consultant", Icon: GraduationCap, tooltip: "Consultant" },
    ];
    return (
      <SidebarGroup className="px-0 py-1">
        <SidebarGroupLabel className={GROUP_LABEL}>Get started</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">
            {collapsedSearch}
            {starts.map((it) => (
              <SidebarMenuItem key={it.label}>
                <NavRow it={it} isActive={false} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  /**
   * Groups:
   *  - PRIMARY: Home, Letters (recent letters nested), Matters (matters
   *    nested), then the HR-only portfolio surfaces. "New letter" is the
   *    button in the header; search is the header tool (and ⌘K).
   *  - WATCH: things that need attention this week (Notifications, then
   *    Calendar). Notifications first so the badge is the most prominent
   *    thing on the rail.
   *  - ARCHIVE: look-back surfaces (Activity, Exported, marketplace).
   */
  const portfolio: NavItem[] =
    // Portfolio-level surfaces — HR mode only (the multi-employee workbench).
    // Employee mode users have one self-record + one matter; these surfaces
    // would be empty noise for them.
    mode === "employer"
      ? [
          { href: "/employees", label: "Employees", Icon: Users, tooltip: "Workspace employee directory" },
          { href: "/reports", label: "Reports", Icon: BarChart3, tooltip: "Compliance, risk and operations rollup" },
          { href: "/bulk", label: "Bulk operations", Icon: Layers, tooltip: "CSV to batch drafts" },
        ]
      : [];

  const watch: NavItem[] = [
    { href: "/notifications", label: "Notifications", Icon: Bell, tooltip: "Deadline reminders and compliance alerts" },
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
    // Marketplace + bookings are an HR-side concept (book a specialist to
    // review a letter you're sending). The marketplace copy is entirely
    // HR-facing, so it doesn't belong in the employee sidebar.
    ...(mode === "employer"
      ? ([
          { href: "/consultants", label: "Marketplace", Icon: Store, tooltip: "Browse specialists for review" },
          { href: "/bookings", label: "My bookings", Icon: Inbox, tooltip: "Review requests you've placed" },
        ] satisfies NavItem[])
      : []),
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
          <NavRow it={it} isActive={loc.pathname === it.href} />
        ) : (
          <SidebarMenuButton
            tooltip={it.tooltip}
            className={cn(NAV_BUTTON, "text-[var(--ds-faint)] cursor-not-allowed")}
            aria-disabled
          >
            <it.Icon />
            <span>{it.label}</span>
          </SidebarMenuButton>
        )}
        {showNotifBadge && (
          <SidebarMenuBadge
            className={cn(
              COUNT_BADGE,
              top === "urgent"
                ? "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)] peer-hover/menu-button:text-[var(--ds-red-fg)] peer-data-active/menu-button:text-[var(--ds-red-fg)]"
                : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] peer-hover/menu-button:text-[var(--ds-amber-fg)] peer-data-active/menu-button:text-[var(--ds-amber-fg)]"
            )}
          >
            {actionable > 9 ? "9+" : actionable}
          </SidebarMenuBadge>
        )}
        {showApprovalsBadge && (
          <SidebarMenuBadge
            className={cn(
              COUNT_BADGE,
              "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] peer-hover/menu-button:text-[var(--ds-amber-fg)] peer-data-active/menu-button:text-[var(--ds-amber-fg)]"
            )}
          >
            {inReviewCount > 9 ? "9+" : inReviewCount}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {/* PRIMARY */}
      <SidebarGroup className="px-0 py-1">
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">
            {collapsedSearch}
            {renderItem({ href: prefix, label: "Home", Icon: House, tooltip: "Dashboard" })}
            <NavLetters mode={mode as Mode} />
            {/* MATTERS — named cases. The row links to /matters; each matter
             * nests below it and the active matter's letters expand inline. */}
            <NavMatters mode={mode as Mode} />
            {portfolio.map(renderItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* WATCH — things that need attention this week */}
      <SidebarGroup className="px-0 py-1">
        <SidebarGroupLabel className={GROUP_LABEL}>Watch</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">{watch.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* ARCHIVE — look-back surfaces */}
      <SidebarGroup className="px-0 py-1">
        <SidebarGroupLabel className={GROUP_LABEL}>Archive</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">{archive.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Nested lists                                                       */
/* ------------------------------------------------------------------ */

/** The left-ruled list under a parent row, like the prototype's .s1a-sub. */
function SubList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="ml-[17px] mt-0.5 mb-2 flex min-w-0 flex-col gap-px border-l border-[var(--ds-line-strong)] pl-[9px] group-data-[collapsible=icon]:hidden"
    >
      {children}
    </ul>
  );
}

/** Small state marker after a recent letter, like the prototype. */
function DraftMarker({ d }: { d: Draft }) {
  if (d.sections.some((s) => s.status === "streaming")) {
    return (
      <span
        title="Drafting"
        aria-label="Drafting"
        className="size-3 shrink-0 rounded-full border-[1.5px] border-[var(--ds-line-strong)] border-t-[var(--ds-body)] animate-spin motion-reduce:animate-none"
      />
    );
  }
  if (d.reviewStatus === "in_review") {
    return (
      <span
        title="In review"
        aria-label="In review"
        className="mr-0.5 size-[7px] shrink-0 rounded-full bg-[var(--ds-amber-dot)]"
      />
    );
  }
  if ((d.exports?.length ?? 0) > 0) {
    return (
      <span title="Exported" aria-label="Exported" className="grid shrink-0 text-[var(--ds-faint)]">
        <CircleCheck className="size-[13px]" />
      </span>
    );
  }
  return null;
}

/**
 * "Letters" row with the user's most recent drafts nested beneath it, each
 * with its Open / Delete (with undo) menu. The row toggles the list; in the
 * icon strip it expands the sidebar first.
 */
function NavLetters({ mode }: { mode: Mode }) {
  const { isMobile, state, setOpen } = useSidebar();
  const loc = useLocation();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const [expanded, setExpanded] = useState(true);
  const isCollapsed = state === "collapsed" && !isMobile;

  const list = Object.values(drafts)
    .filter((d) => !d.isTemplateSource)
    .filter((d) => (mode ? d.mode === mode : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  const onEditor = loc.pathname.startsWith("/editor/");

  return (
    <li className="relative" data-sidebar="menu-item">
      <SidebarMenuButton
        tooltip="Recent letters"
        aria-expanded={expanded}
        onClick={() => {
          if (isCollapsed) {
            setOpen(true);
            setExpanded(true);
            return;
          }
          setExpanded((v) => !v);
        }}
        className={cn(NAV_BUTTON, onEditor && "text-[var(--ds-ink)] font-medium [&>svg]:text-[var(--ds-ink)]")}
      >
        <Files />
        <span className="flex-1 truncate">Letters</span>
        <ChevronDown
          className={cn(
            "ml-auto size-3.5! transition-transform duration-150 group-data-[collapsible=icon]:hidden",
            !expanded && "-rotate-90"
          )}
        />
      </SidebarMenuButton>
      {expanded && (
        <SubList label="Recent letters">
          {list.length === 0 ? (
            <li className="px-2.5 py-1.5 text-[12.5px] text-[var(--ds-faint)]">No letters yet</li>
          ) : (
            list.map((d) => {
              const href = `/editor/${d.id}`;
              const label =
                d.title?.trim() || getLetterMeta(d.letterType)?.shortTitle || d.letterType.replace(/_/g, " ");
              const sub =
                d.mode === "employer"
                  ? d.employee.legalName || "(no recipient)"
                  : `to ${d.employer.legalName || "(employer)"}`;
              return (
                <SidebarMenuItem key={d.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={loc.pathname === href}
                    className={cn(SUB_BUTTON, "group-has-data-[sidebar=menu-action]/menu-item:pr-2 hover:pr-8 focus-within:pr-8")}
                  >
                    <Link to={href} title={`${label}, ${sub}`}>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <DraftMarker d={d} />
                    </Link>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label="Draft actions" className="top-1.5!">
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
                        onClick={() => {
                          // Optimistic delete with a 6s undo window. We capture
                          // the full draft object BEFORE deleting so undo can
                          // re-insert it verbatim — restoring it via setState
                          // re-triggers the dual-write subscription, so the
                          // server copy is recreated too (the delete had fired
                          // a remote delete). One misclick no longer destroys a
                          // draft permanently.
                          const snapshot = d;
                          deleteDraft(snapshot.id);
                          toast(`Deleted "${label}"`, {
                            duration: 6000,
                            action: {
                              label: "Undo",
                              onClick: () => {
                                useDraftStore.setState((s) => ({
                                  drafts: { ...s.drafts, [snapshot.id]: snapshot },
                                }));
                                // Clear the delete tombstone so future syncs of
                                // this id aren't dropped, and re-mirror it to
                                // the server (the delete had removed it there).
                                undeleteDraft(snapshot.id);
                              },
                            },
                          });
                        }}
                        className="gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              );
            })
          )}
          {list.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={loc.pathname === "/letters"}
                className={cn(SUB_BUTTON, "text-[var(--ds-faint)]")}
              >
                <Link to="/letters">View all</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SubList>
      )}
    </li>
  );
}

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
    <li className="relative" data-tour="nav-matters" data-sidebar="menu-item">
      <SidebarMenuButton asChild tooltip="Matters" isActive={onIndexPage} className={NAV_BUTTON}>
        <Link to="/matters">
          <FolderOpen />
          <span>Matters</span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuBadge className={cn(COUNT_BADGE, "top-2")}>{allMatters.length}</SidebarMenuBadge>
      <SubList label="Matters">
        {allMatters.length === 0 ? (
          <li className="px-2.5 py-1.5 text-[12.5px] text-[var(--ds-faint)]">
            No matters yet
          </li>
        ) : (
          allMatters.map((m) => {
            const matterHref = `/matters/${m.id}`;
            const isActive = activeMatterId === m.id;
            const matterDrafts = draftsInMatter(allDrafts, m.id);
            return (
              <SidebarMenuItem key={m.id}>
                <SidebarMenuButton asChild isActive={isActive} className={SUB_BUTTON}>
                  <Link to={matterHref} title={m.name}>
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        MATTER_COLOR_CLASSES[m.color].dot
                      )}
                    />
                    <span className="truncate">{m.name}</span>
                  </Link>
                </SidebarMenuButton>
                {/* Inline letters for the active matter — Notion-tree pattern. */}
                {isActive && matterDrafts.length > 0 && (
                  <SubList label={`Letters in ${m.name}`}>
                    {matterDrafts.map((d) => {
                      const href = `/editor/${d.id}`;
                      const label = briefTitleFor(d);
                      return (
                        <SidebarMenuItem key={d.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={loc.pathname === href}
                            className={cn(SUB_BUTTON, "h-7 text-[12.5px]")}
                          >
                            <Link to={href} title={displayTitleFor(d)}>
                              <FileText className="size-3 text-[var(--ds-subtle)]" />
                              <span className="truncate">{label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SubList>
                )}
              </SidebarMenuItem>
            );
          })
        )}
      </SubList>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer — settings and user card                                    */
/* ------------------------------------------------------------------ */

function NavFooter() {
  const loc = useLocation();
  return (
    <SidebarMenu className="gap-px">
      <SidebarMenuItem>
        <NavRow
          it={{ href: "/settings", label: "Settings", Icon: SettingsIcon, tooltip: "Profile and settings" }}
          isActive={loc.pathname === "/settings" || loc.pathname.startsWith("/settings/")}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser({ mode }: { mode: SidebarMode | null }) {
  const { isMobile, state } = useSidebar();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const clearRole = useProfileStore((s) => s.clearRole);
  const enrolConsultant = useConsultantStore((s) => s.enrol);
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

  const roleLabel = roleLabelFor(mode);

  // All three roles are switchable from one place. Switching is coherent with
  // the mode derivation (route + profileRole win over the enrolled fallback):
  //   • employer/employee → set the profile role + go to its home
  //   • consultant        → enrol + clear the letter-writing role + go to /c
  // (consultant enrolment is preserved when switching away, so the user keeps
  //  their marketplace profile and can switch back.)
  const ROLE_OPTIONS: {
    key: SidebarMode;
    label: string;
    Icon: typeof Briefcase;
    onSwitch: () => void;
  }[] = [
    {
      key: "employer",
      label: "HR / Management",
      Icon: Briefcase,
      onSwitch: () => {
        setRole("employer");
        nav("/hr");
      },
    },
    {
      key: "employee",
      label: "Employee",
      Icon: UserRound,
      onSwitch: () => {
        setRole("employee");
        nav("/me");
      },
    },
    {
      key: "consultant",
      label: "Consultant",
      Icon: Store,
      onSwitch: () => {
        enrolConsultant();
        clearRole();
        nav("/c");
      },
    },
  ];
  const otherRoles = ROLE_OPTIONS.filter((r) => r.key !== mode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={display}
          title={display}
          className={cn(
            "group/user mt-2 flex w-full min-w-0 items-center gap-2.5 border-t border-[var(--ds-line)] px-2 pt-2.5 pb-1.5 text-left",
            "hover:[&_.nav-user-name]:text-[var(--ds-ink)] data-[state=open]:[&_.nav-user-name]:text-[var(--ds-ink)]",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
          )}
        >
          <Avatar
            seed={profile.personal.email ?? display}
            initials={initials || "??"}
            size="lg"
            className="ring-[1.5px] ring-[var(--sidebar)]"
          />
          {!isCollapsed && (
            <>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="nav-user-name truncate text-[13px] font-medium text-[var(--ds-body)]">{display}</span>
                <span className="truncate text-[12px] text-[var(--ds-muted)]">{email || roleLabel}</span>
              </div>
              <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--ds-faint)]" />
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
        {otherRoles.map((r) => (
          <DropdownMenuItem key={r.key} onClick={r.onSwitch} className="gap-2">
            <r.Icon className="size-4" />
            <span>Switch to {r.label}</span>
            <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
          </DropdownMenuItem>
        ))}

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
        <DropdownMenuItem onClick={() => nav("/terms")} className="gap-2">
          <FileText className="size-4" />
          Terms of service
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
