import { useMemo, useState, type ReactNode } from "react";
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
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ds/Avatar";
import { BrandMark } from "@/components/ds";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Bell,
  Briefcase,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Compass,
  FileDown,
  FileText,
  Files,
  Folder,
  GraduationCap,
  House,
  Inbox,
  Layers,
  LibraryBig,
  LogOut,
  MoreHorizontal,
  PanelLeft,
  PanelLeftOpen,
  Plus,
  Scale,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  Trash2,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import { activeMatters, MATTER_COLOR_CLASSES, draftsInMatter } from "@/lib/matters";
import { briefTitleFor, displayTitleFor } from "@/lib/letters/display";
import type { Draft, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { undeleteDraft } from "@/lib/dual-write";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";
import { resetTour } from "@/lib/onboarding";
import { getJourney, type StageTone } from "@/lib/journey/stage";
import { latestReviewIn, useReviewStore } from "@/lib/journey/reviews";
import { useSearchPaletteToggle } from "@/components/SearchPaletteContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";

/**
 * The app sidebar (design/hifi shell.mjs `sidebar()`).
 *
 *   Top     logo, the workspace name (the switcher when there are several),
 *           then search, the notifications bell and collapse.
 *           A "New letter" button under it.
 *   Body    Home, Letters (the three most recent letters nested, each with a
 *           small journey dot, then "View all"), Matters (matters nested),
 *           Employees, Templates, Experts, Reports. The employee and
 *           consultant variants show their own short lists.
 *   Footer  Settings, Help, then the person with the role and account menu.
 *
 * Every page the old sidebar linked to stays reachable: the bell and its
 * "View all" (Notifications), nested rows on the page's parent (Approvals,
 * Calendar and Activity under Home; Exported and Bulk letters under Letters;
 * My bookings under Experts), the person menu's "More" group, and search.
 *
 * Collapses to a 64px icon rail on desktop (Cmd/Ctrl B, the collapse button,
 * the rail edge, or a click on any empty part of the rail expands it). On
 * phones it is a sheet opened from the top bar's menu button.
 */

/**
 * Sidebar-local mode type: the letter-writing Mode plus "consultant" for
 * marketplace specialists who do not write letters. Not pushed into the
 * global Mode type, which would cascade through every letter type and draft.
 */
export type SidebarMode = Mode | "consultant";

/* Rows, as .nav in the mocks: 40px, 15px text, 18px quiet icons, a soft
 * filled pill for the current page. In the rail each row is a 40px square. */
const NAV_BUTTON =
  "h-10 gap-3 rounded-[9px] px-3 text-[15px] text-[var(--ds-body)] transition-colors duration-[120ms] " +
  "hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] active:text-[var(--ds-ink)] " +
  "data-[active=true]:bg-[var(--ds-surface-2)] data-[active=true]:font-medium data-[active=true]:text-[var(--ds-ink)] " +
  "[&_svg]:size-[18px] [&>svg]:text-[var(--ds-subtle)] hover:[&>svg]:text-[var(--ds-ink)] data-[active=true]:[&>svg]:text-[var(--ds-ink)] " +
  "group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:rounded-[10px] group-data-[collapsible=icon]:p-[11px]!";

/* Nested rows (.sub): 34px, 14px muted. */
const SUB_BUTTON =
  "h-[34px] gap-2 rounded-[8px] px-2.5 text-[14px] text-[var(--ds-muted)] transition-colors duration-[120ms] " +
  "hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] " +
  "data-[active=true]:bg-[var(--ds-surface-2)] data-[active=true]:font-normal data-[active=true]:text-[var(--ds-ink)]";

/* The chevron that opens and closes a row's nested list. */
const CHEVRON_ACTION =
  "top-2.5! right-1.5 size-5 rounded-[6px] text-[var(--ds-faint)] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] [&>svg]:size-[15px]";

const GROUP_LABEL = "h-7 px-3 text-[12px] font-medium text-[var(--ds-subtle)]";

const TOOL_BUTTON =
  "grid size-[30px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-subtle)] transition-colors duration-[120ms] " +
  "hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]";

function useSidebarMode(): SidebarMode | null {
  const loc = useLocation();
  const profileRole = useProfileStore((s) => s.profile.role);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);
  // Consultant routes win inside /c. Otherwise the route prefix, then the
  // per-user profile role, then consultant enrolment as the last fallback, so
  // an HR user who tried the consultant flow keeps HR nav on shared routes.
  if (loc.pathname === "/c" || loc.pathname.startsWith("/c/")) return "consultant";
  if (loc.pathname.startsWith("/hr")) return "employer";
  if (loc.pathname.startsWith("/me")) return "employee";
  return profileRole ?? (consultantEnrolled ? "consultant" : null);
}

export function AppSidebar() {
  const mode = useSidebarMode();
  return (
    <SidebarShell>
      <SidebarHeader className="gap-0 pt-3.5 pr-2 pb-0 pl-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3">
        <OrgRow mode={mode} />
        <NewLetterButton mode={mode} />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-3 group-data-[collapsible=icon]:items-center">
        <NavigatePrimary mode={mode} />
      </SidebarContent>

      <SidebarFooter className="gap-0.5 px-3 pt-2 pb-3 group-data-[collapsible=icon]:items-center">
        <NavFooter mode={mode} />
        <NavUser mode={mode} />
      </SidebarFooter>

      <SidebarRail />
    </SidebarShell>
  );
}

/**
 * Sidebar wrapper with click-anywhere-to-expand when collapsed. Clicks on
 * real controls keep their normal behaviour.
 */
function SidebarShell({ children }: { children: ReactNode }) {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      // Phones: the sheet slides in from the right, under the top bar's menu
      // button. Desktop keeps the persistent rail on the left.
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
/*  Top: logo, workspace, tools                                        */
/* ------------------------------------------------------------------ */

function OrgRow({ mode }: { mode: SidebarMode | null }) {
  const { state, isMobile, toggleSidebar, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const search = useSearchPaletteToggle();
  const { activeTenant } = useAuth();
  const orgName = useProfileStore((s) => s.profile.employer.legalName);
  const fullName = activeTenant?.name || orgName?.trim() || "DraftHR";
  const name = shortOrgName(fullName);
  const team = roleLabelFor(mode);

  return (
    <div className="flex h-[34px] w-full min-w-0 items-center gap-2 pl-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
      <Link
        to="/"
        onClick={(e) => {
          if (isCollapsed) {
            e.preventDefault();
            toggleSidebar();
          }
        }}
        aria-label={isCollapsed ? "Expand sidebar" : "DraftHR home"}
        title={isCollapsed ? "Expand sidebar (Ctrl B)" : "DraftHR"}
        className="group/brand relative shrink-0 rounded-[7px]"
      >
        <BrandMark
          size={28}
          className={cn(
            "rounded-[7px] transition-opacity duration-150",
            isCollapsed && "group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0"
          )}
        />
        {isCollapsed && (
          <span className="absolute inset-0 grid place-items-center rounded-[7px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100">
            <PanelLeftOpen className="size-4" />
          </span>
        )}
      </Link>

      {!isCollapsed && (
        <>
          <div data-tour="workspace-switcher" className="flex min-w-0 flex-1 items-center">
            <WorkspaceSwitcher
              subtitle={team}
              fallback={
                <span
                  title={fullName}
                  className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)]"
                >
                  {name}
                </span>
              }
            />
          </div>
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => {
                if (isMobile) setOpenMobile(false);
                search.setOpen(true);
              }}
              aria-label="Search"
              title="Search letters, letter types and pages (Ctrl K)"
              className={TOOL_BUTTON}
            >
              <Search className="size-[17px]" />
            </button>
            <NotificationsBell variant="dot" />
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isMobile ? "Close menu" : "Collapse sidebar"}
              title={isMobile ? "Close menu" : "Collapse sidebar (Ctrl B)"}
              className={TOOL_BUTTON}
            >
              <PanelLeft className="size-[17px]" />
            </button>
          </span>
        </>
      )}
    </div>
  );
}

/** "Harbour Foods" from "Harbour Foods Ltd": the legal suffix is noise in the frame. */
export function shortOrgName(name: string): string {
  return name.replace(/\s+(ltd\.?|limited|plc|llp|inc\.?|llc)$/i, "").trim() || name;
}

function roleLabelFor(mode: SidebarMode | null): string {
  return mode === "employer"
    ? "HR team"
    : mode === "employee"
      ? "Employee"
      : mode === "consultant"
        ? "Consultant"
        : "Not set";
}

function personRoleLabel(mode: SidebarMode | null): string {
  return mode === "employer"
    ? "HR / Management"
    : mode === "employee"
      ? "Employee"
      : mode === "consultant"
        ? "Consultant"
        : "Not set";
}

/**
 * "New letter" (.create in the mocks). Only for the two letter-writing modes;
 * consultants review letters rather than write them. A bordered plus in the rail.
 */
function NewLetterButton({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;
  if (!prefix) return <div className="h-[18px]" />;
  const href = `${prefix}/new`;
  return (
    <SidebarMenu className="my-[18px] mr-1 w-auto group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:mt-4 group-data-[collapsible=icon]:mb-2 group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip="New letter"
          isActive={loc.pathname === href}
          className={cn(
            "h-[42px] justify-center gap-2 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[15px] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)] transition-colors duration-[120ms]",
            "hover:border-[var(--ds-line-hover)] hover:bg-[var(--ds-surface)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-2)] active:text-[var(--ds-ink)]",
            "data-[active=true]:bg-[var(--ds-surface-2)] data-[active=true]:text-[var(--ds-ink)] [&_svg]:size-[17px]",
            "group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:shadow-none"
          )}
        >
          <Link to={href}>
            <Plus />
            <span className="group-data-[collapsible=icon]:hidden">New letter</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Body: primary navigation                                           */
/* ------------------------------------------------------------------ */

type NavItem = {
  href: string;
  label: string;
  Icon: typeof House;
  tooltip?: string;
  tour?: string;
};

function NavRow({ it, isActive, children }: { it: NavItem; isActive: boolean; children?: ReactNode }) {
  return (
    <SidebarMenuItem data-tour={it.tour}>
      <SidebarMenuButton asChild tooltip={it.tooltip ?? it.label} isActive={isActive} className={NAV_BUTTON}>
        <Link to={it.href} aria-current={isActive ? "page" : undefined}>
          <it.Icon />
          <span>{it.label}</span>
        </Link>
      </SidebarMenuButton>
      {children}
    </SidebarMenuItem>
  );
}

/** The left-ruled list under a parent row (.subs). Hidden in the rail. */
function SubList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="mt-0.5 mb-1.5 ml-[21px] flex min-w-0 list-none flex-col border-l border-[var(--ds-line)] pl-3 group-data-[collapsible=icon]:hidden"
    >
      {children}
    </ul>
  );
}

function SubRow({ href, label, isActive, children }: { href: string; label: ReactNode; isActive: boolean; children?: ReactNode }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className={SUB_BUTTON}>
        <Link to={href} aria-current={isActive ? "page" : undefined}>
          {label}
        </Link>
      </SidebarMenuButton>
      {children}
    </SidebarMenuItem>
  );
}

/** Pages that live under Home, Letters and Experts (highlight their parent). */
const HOME_PAGES = ["/approvals", "/calendar", "/activity", "/notifications"];
const LETTER_PAGES = ["/letters", "/exported", "/bulk"];
const EXPERT_PAGES = ["/consultants", "/bookings"];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

function NavigatePrimary({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const path = loc.pathname;
  // Choosing an expert for a letter (/consultants?for=<id>) is part of that
  // letter's journey: Letters is the active row, not Experts (MARKET-053).
  const choosingForLetter = path === "/consultants" && new URLSearchParams(loc.search).has("for");
  const consultantProfile = useConsultantStore((s) => s.profile);
  const search = useSearchPaletteToggle();

  // The rail hides the top row's tools, so search and the bell get their own
  // icons there.
  const railTools = (
    <>
      <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenuButton tooltip="Search (Ctrl K)" onClick={() => search.setOpen(true)} className={NAV_BUTTON}>
          <Search />
          <span>Search</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
        <NotificationsBell variant="dot" className="size-10 rounded-[10px]" />
      </SidebarMenuItem>
    </>
  );

  /* Consultants review letters; their nav is their own. */
  if (mode === "consultant") {
    const items: NavItem[] = [
      { href: "/c", label: "Home", Icon: House, tooltip: "Your requests" },
      { href: "/c/profile", label: "My profile", Icon: UserCog, tooltip: "Edit your marketplace card" },
      { href: "/consultants", label: "Marketplace", Icon: Store, tooltip: "Browse all experts" },
      { href: "/activity", label: "Activity", Icon: ActivityIcon },
    ];
    return (
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
            {items.map((it) => (
              <NavRow key={it.href} it={it} isActive={path === it.href} />
            ))}
            {railTools}
          </SidebarMenu>
          {!consultantProfile && (
            <div className="mt-3 rounded-[10px] bg-[var(--ds-amber-bg)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--ds-amber-fg)] group-data-[collapsible=icon]:hidden">
              <span className="font-semibold">Profile incomplete.</span>{" "}
              <Link to="/c/profile" className="underline underline-offset-2">
                Finish your card
              </Link>{" "}
              to be discoverable.
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const prefix = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;

  if (!prefix) {
    const starts: NavItem[] = [
      { href: "/hr", label: "HR / Management", Icon: Briefcase },
      { href: "/me", label: "Employee", Icon: UserRound },
      { href: "/c", label: "Consultant", Icon: GraduationCap },
    ];
    return (
      <SidebarGroup className="p-0">
        <SidebarGroupLabel className={GROUP_LABEL}>Get started</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
            {starts.map((it) => (
              <NavRow key={it.href} it={it} isActive={false} />
            ))}
            {railTools}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const employer = mode === "employer";
  const homeActive = path === prefix || HOME_PAGES.some((p) => under(path, p));
  const homeSubs: Array<{ href: string; label: string }> = [
    ...(employer ? [{ href: "/approvals", label: "Approvals" }] : []),
    { href: "/calendar", label: "Calendar" },
    { href: "/activity", label: "Activity" },
    { href: "/notifications", label: "Notifications" },
  ];
  // Employers have Approvals, Calendar and Activity as tabs in Home's band,
  // so the sub-list would only repeat them (and push Experts and Reports
  // below the fold on short screens).
  const onHomeSub =
    homeSubs.some((s) => under(path, s.href)) &&
    !(employer && ["/approvals", "/calendar", "/activity"].some((p) => under(path, p)));
  const templatesHref = `${prefix}/new`;

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
          <NavRow it={{ href: prefix, label: "Home", Icon: House }} isActive={homeActive}>
            {onHomeSub && (
              <SubList label="Home">
                {homeSubs.map((s) => (
                  <SubRow key={s.href} href={s.href} label={s.label} isActive={under(path, s.href)} />
                ))}
              </SubList>
            )}
          </NavRow>
          <NavLetters mode={mode as Mode} />
          <NavMatters mode={mode as Mode} />
          {employer && (
            <NavRow
              it={{ href: "/employees", label: "Employees", Icon: Users, tour: "nav-employees" }}
              isActive={under(path, "/employees")}
            />
          )}
          <NavRow
            it={{ href: templatesHref, label: "Templates", Icon: LibraryBig, tooltip: "Templates and letter types" }}
            isActive={under(path, templatesHref)}
          />
          {employer && (
            <NavRow
              it={{ href: "/consultants", label: "Experts", Icon: Scale, tooltip: "DraftHR experts" }}
              isActive={!choosingForLetter && EXPERT_PAGES.some((p) => under(path, p))}
            >
              {!choosingForLetter && EXPERT_PAGES.some((p) => under(path, p)) && (
                <SubList label="Experts">
                  <SubRow href="/consultants" label="Marketplace" isActive={under(path, "/consultants")} />
                  <SubRow href="/bookings" label="My bookings" isActive={under(path, "/bookings")} />
                </SubList>
              )}
            </NavRow>
          )}
          {employer && (
            <NavRow
              it={{ href: "/reports", label: "Reports", Icon: ChartColumn, tour: "nav-reports" }}
              isActive={under(path, "/reports")}
            />
          )}
          {railTools}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/* ------------------------------------------------------------------ */
/*  Letters and Matters (with nested lists)                            */
/* ------------------------------------------------------------------ */

const JOURNEY_DOT: Partial<Record<StageTone, { className: string; label: string }>> = {
  "needs-you": { className: "bg-[var(--ds-amber-dot)]", label: "Needs you" },
  away: { className: "bg-[var(--ds-lilac-line)]", label: "With someone else" },
  done: { className: "bg-[var(--ds-green-solid)]", label: "Sent" },
};

/** "J. Hale" from "Jordan Hale". */
function shortName(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function recentLabel(d: Draft): string {
  const title = briefTitleFor(d);
  const who = d.mode === "employer" ? shortName(d.employee.legalName) : d.employer.legalName?.trim();
  return who ? `${title} · ${who}` : title;
}

/** Small state marker after a recent letter: drafting spinner or journey dot. */
function DraftMarker({ d, tone }: { d: Draft; tone: StageTone }) {
  if (d.sections.some((s) => s.status === "streaming")) {
    return (
      <span
        role="img"
        aria-label="Drafting"
        title="Drafting"
        className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--ds-line-strong)] border-t-[var(--ds-body)] motion-reduce:animate-none"
      />
    );
  }
  const dot = JOURNEY_DOT[tone];
  if (!dot) return null;
  return (
    <span role="img" aria-label={dot.label} title={dot.label} className={cn("size-[7px] shrink-0 rounded-full", dot.className)} />
  );
}

/**
 * "Letters": the row opens the Letters list; the chevron shows or hides the
 * three most recent letters (each with its journey dot and an Open / Delete
 * with undo menu), then "View all".
 */
function NavLetters({ mode }: { mode: Mode }) {
  const { isMobile, state, setOpen } = useSidebar();
  const loc = useLocation();
  const path = loc.pathname;
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const requests = useReviewStore((s) => s.requests);
  const [expanded, setExpanded] = useState(true);
  const isCollapsed = state === "collapsed" && !isMobile;

  const recent = useMemo(() => {
    const list = Object.values(drafts)
      .filter((d) => !d.isTemplateSource && d.mode === mode)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    return list.map((d) => ({ d, tone: getJourney(d, latestReviewIn(requests, d.id)).listTone }));
  }, [drafts, requests, mode]);

  const active =
    LETTER_PAGES.some((p) => under(path, p)) ||
    path.startsWith("/editor/") ||
    (path === "/consultants" && new URLSearchParams(loc.search).has("for"));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip="Letters"
        isActive={active}
        className={cn(NAV_BUTTON, "pr-9")}
      >
        <Link
          to="/letters"
          aria-current={path === "/letters" ? "page" : undefined}
          onClick={(e) => {
            if (isCollapsed) {
              e.preventDefault();
              setOpen(true);
              setExpanded(true);
            }
          }}
        >
          <Files />
          <span>Letters</span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuAction
        aria-label={expanded ? "Hide recent letters" : "Show recent letters"}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={CHEVRON_ACTION}
      >
        <ChevronDown className={cn("transition-transform duration-150", !expanded && "-rotate-90")} />
      </SidebarMenuAction>
      {(expanded || under(path, "/exported") || under(path, "/bulk")) && (
        <SubList label="Recent letters">
          {expanded &&
            (recent.length === 0 ? (
              <li className="px-2.5 py-2 text-[13px] text-[var(--ds-subtle)]">No letters yet</li>
            ) : (
              recent.map(({ d, tone }) => {
                const href = `/editor/${d.id}`;
                const label = recentLabel(d);
                const on = path === href || path.startsWith(`${href}/`);
                return (
                  <SidebarMenuItem key={d.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={on}
                      className={cn(SUB_BUTTON, "justify-between hover:pr-8 focus-within:pr-8")}
                    >
                      <Link to={href} title={displayTitleFor(d)} aria-current={on ? "page" : undefined}>
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <DraftMarker d={d} tone={tone} />
                      </Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label={`Actions for ${label}`} className="top-[7px]! right-1 rounded-[6px]">
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-44" side={isMobile ? "bottom" : "right"} align="start">
                        <DropdownMenuItem onClick={() => nav(href)}>
                          <ArrowUpRight />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            // Optimistic delete with a 6s undo. The full draft is
                            // captured first so undo can put it back verbatim;
                            // restoring it re-triggers the dual-write mirror, so
                            // the server copy comes back too.
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
                                  undeleteDraft(snapshot.id);
                                },
                              },
                            });
                          }}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              })
            ))}
          {under(path, "/exported") && <SubRow href="/exported" label="Exported" isActive />}
          {under(path, "/bulk") && <SubRow href="/bulk" label="Bulk letters" isActive />}
          {expanded && recent.length > 0 && <SubRow href="/letters" label="View all" isActive={false} />}
        </SubList>
      )}
    </SidebarMenuItem>
  );
}

function NavMatters({ mode }: { mode: Mode }) {
  const loc = useLocation();
  const path = loc.pathname;
  const matters = useDraftStore((s) => s.matters);
  const drafts = useDraftStore((s) => s.drafts);
  const [expanded, setExpanded] = useState(true);

  const allMatters = useMemo(() => activeMatters(Object.values(matters), mode), [matters, mode]);
  const allDrafts = useMemo(() => Object.values(drafts).filter((d) => !d.isTemplateSource), [drafts]);
  const activeMatterId = path.startsWith("/matters/") ? path.slice("/matters/".length) : null;

  return (
    <SidebarMenuItem data-tour="nav-matters">
      <SidebarMenuButton asChild tooltip="Matters" isActive={under(path, "/matters")} className={cn(NAV_BUTTON, "pr-9")}>
        <Link to="/matters" aria-current={path === "/matters" ? "page" : undefined}>
          <Folder />
          <span>Matters</span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuAction
        aria-label={expanded ? "Hide matters" : "Show matters"}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={CHEVRON_ACTION}
      >
        <ChevronDown className={cn("transition-transform duration-150", !expanded && "-rotate-90")} />
      </SidebarMenuAction>
      {expanded && (
        <SubList label="Matters">
          {allMatters.length === 0 ? (
            <li className="px-2.5 py-2 text-[13px] text-[var(--ds-subtle)]">No matters yet</li>
          ) : (
            allMatters.map((m) => {
              const href = `/matters/${m.id}`;
              const isActive = activeMatterId === m.id;
              const matterDrafts = isActive ? draftsInMatter(allDrafts, m.id) : [];
              return (
                <SidebarMenuItem key={m.id}>
                  <SidebarMenuButton asChild isActive={isActive} className={cn(SUB_BUTTON, "justify-start")}>
                    <Link to={href} title={m.name} aria-current={isActive ? "page" : undefined}>
                      <span aria-hidden className={cn("mr-0.5 size-[7px] shrink-0 rounded-full", MATTER_COLOR_CLASSES[m.color].dot)} />
                      <span className="truncate">{m.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {isActive && matterDrafts.length > 0 && (
                    <SubList label={`Letters in ${m.name}`}>
                      {matterDrafts.map((d) => {
                        const dHref = `/editor/${d.id}`;
                        return (
                          <SubRow
                            key={d.id}
                            href={dHref}
                            isActive={path === dHref}
                            label={
                              <>
                                <FileText aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
                                <span className="truncate" title={displayTitleFor(d)}>
                                  {briefTitleFor(d)}
                                </span>
                              </>
                            }
                          />
                        );
                      })}
                    </SubList>
                  )}
                </SidebarMenuItem>
              );
            })
          )}
        </SubList>
      )}
    </SidebarMenuItem>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer: Settings, Help, the person                                 */
/* ------------------------------------------------------------------ */

function NavFooter({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const search = useSearchPaletteToggle();
  const home = mode === "employer" ? "/hr" : mode === "employee" ? "/me" : null;
  return (
    <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
      <NavRow
        it={{ href: "/settings", label: "Settings", Icon: SettingsIcon, tooltip: "Profile and settings" }}
        isActive={under(loc.pathname, "/settings")}
      />
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip="Help" className={NAV_BUTTON}>
              <CircleHelp />
              <span>Help</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" side={isMobile ? "top" : "right"} align="end" sideOffset={8}>
            <DropdownMenuLabel>Help</DropdownMenuLabel>
            {home && (
              <DropdownMenuItem
                onSelect={() => {
                  resetTour();
                  window.location.assign(home);
                }}
              >
                <Compass />
                Replay the guided tour
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                if (isMobile) setOpenMobile(false);
                search.setOpen(true);
              }}
            >
              <Search />
              Search
              <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/privacy">
                <ShieldCheck />
                Privacy and data
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/terms">
                <FileText />
                Terms of service
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const roleLabel = personRoleLabel(mode);
  const secondLine = profile.personal.jobTitle?.trim() || profile.employer.signatoryTitle?.trim() || roleLabel;
  const initials = (profile.personal.preferredName ?? profile.personal.legalName ?? "??")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // All three roles switch from one place, coherent with the mode derivation
  // (route and profile role win over the enrolled fallback). Consultant
  // enrolment is kept when switching away, so the person can switch back.
  const ROLE_OPTIONS: { key: SidebarMode; label: string; Icon: typeof Briefcase; onSwitch: () => void }[] = [
    { key: "employer", label: "HR / Management", Icon: Briefcase, onSwitch: () => { setRole("employer"); nav("/hr"); } },
    { key: "employee", label: "Employee", Icon: UserRound, onSwitch: () => { setRole("employee"); nav("/me"); } },
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

  // Pages the old sidebar listed that are not main rows any more.
  const more: { href: string; label: string; Icon: typeof Bell }[] =
    mode === "employer"
      ? [
          { href: "/approvals", label: "Approvals", Icon: ClipboardCheck },
          { href: "/calendar", label: "Calendar", Icon: CalendarDays },
          { href: "/notifications", label: "Notifications", Icon: Bell },
          { href: "/activity", label: "Activity", Icon: ActivityIcon },
          { href: "/exported", label: "Exported", Icon: FileDown },
          { href: "/bulk", label: "Bulk letters", Icon: Layers },
          { href: "/bookings", label: "My bookings", Icon: Inbox },
        ]
      : mode === "employee"
        ? [
            { href: "/calendar", label: "Calendar", Icon: CalendarDays },
            { href: "/notifications", label: "Notifications", Icon: Bell },
            { href: "/activity", label: "Activity", Icon: ActivityIcon },
            { href: "/exported", label: "Exported", Icon: FileDown },
          ]
        : mode === "consultant"
          ? [{ href: "/notifications", label: "Notifications", Icon: Bell }]
          : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${display}, account menu`}
          title={display}
          className={cn(
            "group/user mt-2 flex w-full min-w-0 items-center gap-2.5 rounded-[9px] border-t border-[var(--ds-line)] px-2 pt-2.5 pb-1 text-left",
            "rounded-t-none transition-colors duration-[120ms] hover:[&_.nav-user-name]:underline data-[state=open]:[&_.nav-user-name]:underline underline-offset-[3px]",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          )}
        >
          <Avatar seed={profile.personal.email ?? display} initials={initials || "??"} size="xl" />
          {!isCollapsed && (
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="nav-user-name truncate text-[14px] font-medium text-[var(--ds-ink)]">{display}</span>
              <span className="mt-0.5 truncate text-[12.5px] text-[var(--ds-subtle)]">{secondLine}</span>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" side={isMobile ? "top" : "right"} align="end" sideOffset={8}>
        <DropdownMenuLabel>Role · {roleLabel}</DropdownMenuLabel>
        {otherRoles.map((r) => (
          <DropdownMenuItem key={r.key} onClick={r.onSwitch}>
            <r.Icon />
            <span>Switch to {r.label}</span>
            <ArrowUpRight className="ml-auto text-[var(--ds-subtle)]" />
          </DropdownMenuItem>
        ))}

        {more.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>More</DropdownMenuLabel>
            {more.map((m) => (
              <DropdownMenuItem key={m.href} asChild>
                <Link to={m.href}>
                  <m.Icon />
                  {m.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => nav("/settings")}>
          <SettingsIcon />
          Profile and settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav("/privacy")}>
          <ShieldCheck />
          Privacy and data
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav("/terms")}>
          <FileText />
          Terms of service
        </DropdownMenuItem>

        {user ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
