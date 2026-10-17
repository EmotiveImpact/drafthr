import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, Search } from "lucide-react";
import { BrandMark } from "@/components/ds";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, shortOrgName } from "@/components/AppSidebar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SearchPalette, useSearchPalette } from "@/components/SearchPalette";
import { SearchPaletteContext, useSearchPaletteToggle } from "@/components/SearchPaletteContext";
import { Onboarding } from "@/components/Onboarding";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";

/** Routes that render WITHOUT the authenticated app chrome (sidebar,
 * notifications, search palette). These show before the user has a session
 * OR a tenant — so rendering the full HR sidebar would leak a "logged in"
 * appearance and confuse the user mid-flow.
 *
 * Includes "/" because RootRedirect handles every pre-onboarded state
 * there (public landing, tenant-less redirect, role chooser). Once the
 * user is fully onboarded, RootRedirect redirects to /hr or /me which
 * fall through to the chrome path below. */
const CHROMELESS_EXACT = ["/", "/pick-role"];
const CHROMELESS_PREFIXES = [
  "/sign-in",
  "/auth/callback",
  "/signup/workspace",
  "/join/",
  // Mobile read-only view: full-bleed letter, no sidebar / topbar / chrome.
  // Auth gate still applies (see Protected wrapper in App.tsx).
  "/m/",
  // Public legal pages — accessible without sign-in, must not show the
  // signed-in app shell. The pages themselves provide their own minimal
  // wordmark + back-to-sign-in chrome.
  "/privacy",
  "/terms",
  "/legal",
  // Reviewer views: the trusted reviewer's secure link (no account) and the
  // booked expert's review page show the letter without the app sidebar.
  "/r/",
  "/c/review/",
];

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  useDocumentTitle(loc.pathname);
  const { user, activeTenant, isLoaded } = useAuth();
  // The full Finalise page keeps the normal sidebar (SEND-110).
  const isEditor = loc.pathname.startsWith("/editor/") && !/^\/editor\/[^/]+\/finalize\/?$/.test(loc.pathname);
  const isChromeless =
    CHROMELESS_EXACT.includes(loc.pathname) ||
    CHROMELESS_PREFIXES.some((p) => loc.pathname.startsWith(p));
  const { open, setOpen } = useSearchPalette();

  // Gate the app SHELL (sidebar/topbar) on auth, not just the pathname.
  // Without this, an unauthenticated visitor to a protected URL (/hr,
  // /matters, /editor/x, …) saw the full sidebar — nav, recent drafts from
  // localStorage, workspace name, user card — for the entire async
  // /api/auth/session round-trip, before Protected redirected to /sign-in.
  // That's the "logged-in app showing before auth" flash. Until a session
  // is confirmed, render the minimal chromeless shell so no app chrome paints
  // pre-auth. (The route BODY is separately gated by <Protected>, which now
  // branches synchronously.)
  //
  // Tenant nuance: most surfaces also require an active tenant before the
  // workspace chrome makes sense — EXCEPT consultant routes (/c, /c/*), where
  // the tenant is minted lazily on first marketplace call, so a consultant
  // legitimately has activeTenant === null while using the app. Requiring a
  // tenant there would wrongly strip their sidebar. So: always require a
  // confirmed session; require a tenant only off the consultant surface.
  const onConsultantSurface =
    loc.pathname === "/c" || loc.pathname.startsWith("/c/");
  const authPending =
    AUTH_ENABLED &&
    (!isLoaded || !user || (!activeTenant && !onConsultantSurface));

  // Public / onboarding routes get a minimal shell — no sidebar, no chrome.
  // Stops the flash-of-logged-in-app between page load and the WorkOS redirect.
  if (isChromeless || authPending) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="min-h-screen flex flex-col bg-background">
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-[var(--ds-ink)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
          <main id="main" aria-label="Main content" className="flex-1 flex flex-col min-h-0">{children}</main>
        </div>
      </TooltipProvider>
    );
  }

  if (isEditor) {
    return (
      <TooltipProvider delayDuration={150}>
        <SearchPaletteContext.Provider value={{ open, setOpen }}>
          {/* The letter workspace sits beside the app sidebar, as in the
           * design, starting as the icon rail so the letter and its side panel
           * keep their room (the person can expand it). It is locked to viewport height (h-dvh handles the mobile
           * URL bar; h-screen is the fallback) so inner panes scroll on their
           * own and the composer stays on screen at any letter length. Below
           * md the sidebar is a sheet, so phones still get the full-bleed
           * editor with its own back button. */}
          {/* Keyed apart from the app frame's provider below: both sit at the
           * same place in the tree, so without a key a letter opened from a
           * list page would keep the full sidebar instead of the rail. */}
          <SidebarProvider key="letter" defaultOpen={false} className="h-screen h-dvh min-h-0 overflow-hidden">
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-[var(--ds-ink)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
            <AppSidebar />
            <SidebarInset className="min-h-0 min-w-0 flex flex-col overflow-hidden">
              <main id="main" aria-label="Main content" className="flex-1 flex flex-col min-h-0">{children}</main>
            </SidebarInset>
          </SidebarProvider>
          <SearchPalette open={open} onOpenChange={setOpen} />
          <Onboarding />
        </SearchPaletteContext.Provider>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <SearchPaletteContext.Provider value={{ open, setOpen }}>
        <SidebarProvider key="app" defaultOpen>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-[var(--ds-ink)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
          <AppSidebar />
          {/* The page sits flat beside the white sidebar (a hairline between
           * them), as in the mocks. On phones the compact top bar sits above
           * it, transparent, so a page's mist band runs up behind it. */}
          <SidebarInset className="min-h-screen min-w-0 flex flex-col bg-[var(--ds-surface)]">
            <MobileTopbar />
            <main id="main" aria-label="Main content" className="relative flex-1 min-w-0">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <SearchPalette open={open} onOpenChange={setOpen} />
        <Onboarding />
      </SearchPaletteContext.Provider>
    </TooltipProvider>
  );
}

/**
 * The compact phone top bar (mock phone-home): the logo, the workspace name
 * (opens the menu, where the workspace switcher lives), then search, the
 * bell with its count, and the menu button that opens the sidebar sheet.
 * Hidden at md and up, where the sidebar is always on screen.
 */
function MobileTopbar() {
  const { setOpenMobile } = useSidebar();
  const search = useSearchPaletteToggle();
  const { activeTenant } = useAuth();
  const orgName = useProfileStore((s) => s.profile.employer.legalName);
  const name = shortOrgName(activeTenant?.name || orgName?.trim() || "DraftHR");

  return (
    <header className="relative z-10 flex h-[52px] shrink-0 items-center gap-1 pt-1.5 pr-3 pl-4 md:hidden">
      <Link to="/" aria-label="DraftHR home" className="mr-1.5 shrink-0 rounded-[7px]">
        <BrandMark size={26} className="rounded-[7px]" />
      </Link>
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-label={`${name}, open menu`}
        className="flex h-9 min-w-0 items-center gap-1 rounded-[8px] px-1 text-left transition-colors duration-[120ms] active:bg-[var(--ds-surface-3)]"
      >
        <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)]">{name}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
      </button>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="Search"
        onClick={() => search.setOpen(true)}
        className="grid size-[38px] shrink-0 place-items-center rounded-[10px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]"
      >
        <Search className="size-[19px]" />
      </button>
      <NotificationsBell variant="count" />
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpenMobile(true)}
        className="grid size-[38px] shrink-0 place-items-center rounded-[10px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]"
      >
        <Menu className="size-5" />
      </button>
    </header>
  );
}
