import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
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
import type { Draft, Matter, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { undeleteDraft } from "@/lib/dual-write";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";
import { resetTour } from "@/lib/onboarding";
import { getJourney, type StageTone } from "@/lib/journey/stage";
import { latestReviewIn, useReviewStore } from "@/lib/journey/reviews";
import { canApprove } from "@/lib/permissions";
import { useMe, viewerIsNamedApprover } from "@/components/letters/rows";
import { useSearchPaletteToggle } from "@/components/SearchPaletteContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceLoad } from "@/components/home/loadState";
import { fitSubLists } from "@/components/sidebarFit";
import { recentLabels } from "@/components/sidebarLabels";
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
 * "View all" (Notifications), Home's tabs (Needs approval, Calendar,
 * Activity), the Experts page's tabs (My bookings), a nested row under Letters
 * while on Bulk letters, the person menu's "More" group, and
 * search. Pages under Home or Experts mark that row current without a nested
 * list. On short screens (a 1366x768 laptop) the nested lists fold to their
 * chevrons when they would push rows under the footer (sidebarFit.ts), so
 * all seven rows stay in view; opening one with its chevron folds the other
 * there. A list too long on its own scrolls, with soft fades at the edges.
 * While the first workspace pull is in flight
 * the nested lists show soft placeholders rather than "No letters yet".
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

/**
 * Soft fades at the top and bottom of the sidebar's middle while there is
 * more to scroll that way, so a long open list (a workspace with many
 * matters) never just cuts rows off under the footer (FOUNDATION-X11).
 */
function useScrollCue(ref: RefObject<HTMLElement | null>) {
  const [cue, setCue] = useState<{ above: boolean; below: boolean }>({ above: false, below: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const above = el.scrollTop > 1;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setCue((c) => (c.above === above && c.below === below ? c : { above, below }));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    // The lists inside change height without the area itself resizing.
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(read);
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [ref]);
  return cue;
}

const FADE = "24px";

export function AppSidebar() {
  const mode = useSidebarMode();
  const middleRef = useRef<HTMLDivElement>(null);
  const cue = useScrollCue(middleRef);
  const mask =
    cue.above || cue.below
      ? `linear-gradient(to bottom, ${cue.above ? `transparent, black ${FADE}` : "black"}, ${
          cue.below ? `black calc(100% - ${FADE}), transparent` : "black"
        })`
      : undefined;
  return (
    <SidebarShell>
      <SidebarHeader className="gap-0 pt-3.5 pr-2 pb-0 pl-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3">
        <OrgRow mode={mode} />
        <NewLetterButton mode={mode} />
      </SidebarHeader>

      <SidebarContent
        ref={middleRef}
        data-scroll-above={cue.above || undefined}
        data-scroll-below={cue.below || undefined}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className="gap-0 px-3 group-data-[collapsible=icon]:items-center"
      >
        <NavigatePrimary mode={mode} />
      </SidebarContent>

      <SidebarFooter className="gap-0.5 px-3 pt-2 pb-3 group-data-[collapsible=icon]:items-center">
        <NavFooter mode={mode} />
        <NavUser mode={mode} />
      </SidebarFooter>

      {/* The rail edge sits inside the sidebar (its last 8px, the line on the
       * border) rather than straddling it: hanging 8px over the page, its
       * layer painted stray fragments of the page beside the sidebar when the
       * middle scrolled (FOUNDATION-X11). */}
      <SidebarRail className="w-2 translate-x-0 group-data-[side=left]:right-0 ltr:translate-x-0 rtl:translate-x-0 after:start-auto after:end-0" />
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
              name={shortOrgName}
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
// /exported redirects to the Sent tab of /letters; kept so the row stays current mid-redirect.
const LETTER_PAGES = ["/letters", "/exported", "/bulk"];
const EXPERT_PAGES = ["/consultants", "/bookings"];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * The Experts page is choosing an expert for a real letter
 * (/consultants?for=<draftId> naming a letter this person can see): part of
 * that letter's journey, so Letters is the current row, not Experts. An
 * unknown id falls back to browsing (ConsultantsIndex), and so does the
 * sidebar (MARKET-053).
 */
function useChoosingForLetter(mode: SidebarMode | null): boolean {
  const loc = useLocation();
  const forId = loc.pathname === "/consultants" ? new URLSearchParams(loc.search).get("for") : null;
  const known = useDraftStore((s) => (forId ? !!s.drafts[forId] : false));
  return !!forId && known && mode !== "consultant";
}

function NavigatePrimary({ mode }: { mode: SidebarMode | null }) {
  const loc = useLocation();
  const path = loc.pathname;
  const choosingForLetter = useChoosingForLetter(mode);
  const consultantProfile = useConsultantStore((s) => s.profile);
  const search = useSearchPaletteToggle();
  const groupRef = useRef<HTMLDivElement>(null);
  const available = useMiddleHeight(groupRef, mode);
  const letterMode: Mode = mode === "employee" ? "employee" : "employer";
  const recent = useRecentLetters(letterMode);
  const matterList = useSidebarMatters(letterMode);
  const pulling = useWorkspaceLoad((s) => s.pulling);
  // null: follow the fit below; true or false once the person uses a chevron.
  const [lettersChoice, setLettersChoice] = useState<boolean | null>(null);
  const [mattersChoice, setMattersChoice] = useState<boolean | null>(null);
  // The list last opened with its chevron: it stays open and, on a short
  // screen, the other folds so no main row slips under the footer.
  const [kept, setKept] = useState<"letters" | "matters" | null>(null);
  const chooseLetters = (open: boolean) => {
    setLettersChoice(open);
    setKept(open ? "letters" : (k) => (k === "letters" ? null : k));
  };
  const chooseMatters = (open: boolean) => {
    setMattersChoice(open);
    setKept(open ? "matters" : (k) => (k === "matters" ? null : k));
  };

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
  const lettersLoading = pulling && recent.length === 0;
  const mattersLoading = pulling && matterList.matters.length === 0;
  const plan = fitSubLists({
    available,
    rows: employer ? 7 : 4,
    letterRows:
      (lettersLoading ? LOADING_ROWS : recent.length > 0 ? recent.length + 1 : 1) +
      (under(path, "/bulk") ? 1 : 0),
    matterRows: (mattersLoading ? LOADING_ROWS : Math.max(1, matterList.matters.length)) + matterList.nestedCount(path),
    prefer: under(path, "/matters") ? "matters" : "letters",
    want: { letters: lettersChoice ?? true, matters: mattersChoice ?? true },
    keep: kept,
  });
  const lettersOpen = plan.letters;
  const mattersOpen = plan.matters;
  // Home stays the current row on the pages that hang off it (its tabs, and
  // Notifications from the bell). They get no nested list: no mock has one,
  // and it pushed Experts and Reports under the footer on short screens
  // (RULE-106). They stay reachable from Home's tabs, the bell, the person
  // menu's More group and search.
  const homeActive = path === prefix || HOME_PAGES.some((p) => under(path, p));
  const templatesHref = `${prefix}/new`;

  return (
    <SidebarGroup ref={groupRef} className="p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
          <NavRow it={{ href: prefix, label: "Home", Icon: House }} isActive={homeActive} />
          <NavLetters
            mode={letterMode}
            recent={recent}
            loading={lettersLoading}
            expanded={lettersOpen}
            setExpanded={chooseLetters}
          />
          <NavMatters
            matters={matterList.matters}
            allDrafts={matterList.allDrafts}
            loading={mattersLoading}
            expanded={mattersOpen}
            setExpanded={chooseMatters}
          />
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
            // One row, as in the experts and bookings mocks: Marketplace and
            // My bookings are the tabs at the top of the Experts page.
            <NavRow
              it={{ href: "/consultants", label: "Experts", Icon: Scale, tooltip: "DraftHR experts" }}
              isActive={!choosingForLetter && EXPERT_PAGES.some((p) => under(path, p))}
            />
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

type RecentLetter = { d: Draft; tone: StageTone; label: string };

/** Nested placeholder rows while the first workspace pull is in flight. */
const LOADING_ROWS = 2;

/** The three most recent letters for this mode, each with its journey tone. */
function useRecentLetters(mode: Mode): RecentLetter[] {
  const drafts = useDraftStore((s) => s.drafts);
  const requests = useReviewStore((s) => s.requests);
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const legalName = useProfileStore((s) => s.profile.personal.legalName);
  const me = useMe();
  const viewerCanApprove = canApprove(workspaceRole);
  return useMemo(() => {
    const list = Object.values(drafts)
      .filter((d) => !d.isTemplateSource && d.mode === mode)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    const labels = recentLabels(list);
    // The same needs-you rule as the Letters list (rows.ts): a letter waiting
    // for your own approval is amber here too, not lilac (FOUNDATION-X8).
    return list.map((d, i) => ({
      d,
      label: labels[i],
      tone: getJourney(d, latestReviewIn(requests, d.id), {
        viewerIsApprover: viewerCanApprove && viewerIsNamedApprover(d, me, legalName),
      }).listTone,
    }));
  }, [drafts, requests, mode, me, legalName, viewerCanApprove]);
}

/** Active matters for this mode, plus how many letters nest under the open one. */
function useSidebarMatters(mode: Mode) {
  const matterMap = useDraftStore((s) => s.matters);
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useMemo(() => activeMatters(Object.values(matterMap), mode), [matterMap, mode]);
  const allDrafts = useMemo(() => Object.values(drafts).filter((d) => !d.isTemplateSource), [drafts]);
  const nestedCount = (path: string) => {
    const id = path.startsWith("/matters/") ? path.slice("/matters/".length) : null;
    return id && matters.some((m) => m.id === id) ? draftsInMatter(allDrafts, id).length : 0;
  };
  return { matters, allDrafts, nestedCount };
}

/**
 * Everything above and below the sidebar's scrolling middle: the logo row
 * and New letter (126px) plus Settings, Help and the person (162px). Used
 * for the first render so the nested lists are already right on the first
 * frame; the real figure is then read from the page and only changes the
 * plan if the chrome is a different height.
 */
const SIDEBAR_CHROME_GUESS = 288;

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * Height of the sidebar's scrolling middle (SidebarContent), which the
 * nested lists have to share with the main rows. 0 when unknown.
 */
function useMiddleHeight(ref: RefObject<HTMLElement | null>, remeasureOn: unknown): number {
  const viewport = useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 0
  );
  const [chrome, setChrome] = useState(SIDEBAR_CHROME_GUESS);
  useLayoutEffect(() => {
    const area = ref.current?.closest<HTMLElement>('[data-sidebar="content"]');
    if (!area) return;
    const read = () => {
      // An area with no height (not laid out, as in tests) tells us nothing.
      if (area.clientHeight > 0) setChrome(window.innerHeight - area.clientHeight);
      else setChrome(Number.POSITIVE_INFINITY);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(area);
    return () => ro.disconnect();
    // The group mounts only for the letter-writing modes, so look again when the mode changes.
  }, [ref, remeasureOn]);
  return Number.isFinite(chrome) ? Math.max(0, viewport - chrome) : 0;
}

/** Soft grey nested rows (Quiet tier), announced once for screen readers. */
function LoadingRows({ label }: { label: string }) {
  return (
    <li role="status" className="list-none">
      <span className="sr-only">{label}</span>
      <ul aria-hidden className="flex list-none flex-col">
        {Array.from({ length: LOADING_ROWS }, (_, i) => (
          <li key={i} className="flex h-[34px] items-center px-2.5">
            <Skeleton className="h-2.5 rounded-full" style={{ width: `${78 - i * 18}%` }} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * "Letters": the row opens the Letters list; the chevron shows or hides the
 * three most recent letters (each with its journey dot and an Open / Delete
 * with undo menu), then "View all".
 */
function NavLetters({
  mode,
  recent,
  loading,
  expanded,
  setExpanded,
}: {
  mode: Mode;
  recent: RecentLetter[];
  loading: boolean;
  expanded: boolean;
  setExpanded: (open: boolean) => void;
}) {
  const { isMobile, state, setOpen } = useSidebar();
  const loc = useLocation();
  const path = loc.pathname;
  const nav = useNavigate();
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const isCollapsed = state === "collapsed" && !isMobile;

  const choosingForLetter = useChoosingForLetter(mode);
  const active = LETTER_PAGES.some((p) => under(path, p)) || path.startsWith("/editor/") || choosingForLetter;

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
        onClick={() => setExpanded(!expanded)}
        className={CHEVRON_ACTION}
      >
        <ChevronDown className={cn("transition-transform duration-150", !expanded && "-rotate-90")} />
      </SidebarMenuAction>
      {(expanded || under(path, "/bulk")) && (
        <SubList label="Recent letters">
          {expanded &&
            (loading ? (
              <LoadingRows label="Loading your letters" />
            ) : recent.length === 0 ? (
              <li className="px-2.5 py-2 text-[13px] text-[var(--ds-subtle)]">No letters yet</li>
            ) : (
              recent.map(({ d, tone, label }) => {
                const href = `/editor/${d.id}`;
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
          {under(path, "/bulk") && <SubRow href="/bulk" label="Bulk letters" isActive />}
          {expanded && recent.length > 0 && <SubRow href="/letters" label="View all" isActive={false} />}
        </SubList>
      )}
    </SidebarMenuItem>
  );
}

function NavMatters({
  matters: allMatters,
  allDrafts,
  loading,
  expanded,
  setExpanded,
}: {
  matters: Matter[];
  allDrafts: Draft[];
  loading: boolean;
  expanded: boolean;
  setExpanded: (open: boolean) => void;
}) {
  const loc = useLocation();
  const path = loc.pathname;
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
        onClick={() => setExpanded(!expanded)}
        className={CHEVRON_ACTION}
      >
        <ChevronDown className={cn("transition-transform duration-150", !expanded && "-rotate-90")} />
      </SidebarMenuAction>
      {expanded && (
        <SubList label="Matters">
          {loading ? (
            <LoadingRows label="Loading your matters" />
          ) : allMatters.length === 0 ? (
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
          { href: "/approvals", label: "Needs approval", Icon: ClipboardCheck },
          { href: "/calendar", label: "Calendar", Icon: CalendarDays },
          { href: "/notifications", label: "Notifications", Icon: Bell },
          { href: "/activity", label: "Activity", Icon: ActivityIcon },
          { href: "/letters?tab=sent", label: "Sent letters", Icon: FileDown },
          { href: "/bulk", label: "Bulk letters", Icon: Layers },
          { href: "/bookings", label: "My bookings", Icon: Inbox },
        ]
      : mode === "employee"
        ? [
            { href: "/calendar", label: "Calendar", Icon: CalendarDays },
            { href: "/notifications", label: "Notifications", Icon: Bell },
            { href: "/activity", label: "Activity", Icon: ActivityIcon },
            { href: "/letters?tab=sent", label: "Sent letters", Icon: FileDown },
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
