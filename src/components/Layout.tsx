import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Plus } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/ds";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SearchPalette, useSearchPalette } from "@/components/SearchPalette";
import { SearchPaletteContext } from "@/components/SearchPaletteContext";
import { Onboarding } from "@/components/Onboarding";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";

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
];

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user, activeTenant, isLoaded } = useAuth();
  const isEditor = loc.pathname.startsWith("/editor/");
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
          {/* The editor is locked to viewport height. h-dvh handles mobile
           * URL-bar resize correctly; h-screen as fallback. Inner flex/grid
           * children scroll independently so the chat composer + sections
           * list stay sticky on screen at any letter length. */}
          <div className="h-screen h-dvh flex flex-col overflow-hidden">
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-[var(--ds-ink)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
            <main id="main" aria-label="Main content" className="flex-1 flex flex-col min-h-0">{children}</main>
          </div>
          <SearchPalette open={open} onOpenChange={setOpen} />
          <Onboarding />
        </SearchPaletteContext.Provider>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <SearchPaletteContext.Provider value={{ open, setOpen }}>
        <SidebarProvider defaultOpen>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-[var(--ds-ink)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
          <AppSidebar />
          <SidebarInset className="min-h-screen flex flex-col">
            <MobileTopbar />
            <main id="main" aria-label="Main content" className="flex-1">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <SearchPalette open={open} onOpenChange={setOpen} />
        <Onboarding />
      </SearchPaletteContext.Provider>
    </TooltipProvider>
  );
}

/**
 * Mobile-only topbar shown when the sidebar is collapsed behind a Sheet
 * (i.e. < md). Houses a hamburger that opens the sidebar, the brand mark
 * for context, and the NotificationsBell. Hidden at md+ where the
 * sidebar is permanently visible.
 */
function MobileTopbar() {
  const { setOpenMobile } = useSidebar();
  const loc = useLocation();

  // Route the "+ New" action by which mode the user is in. We detect mode
  // from the URL prefix so the action stays correct as the user navigates.
  // Fallback to /pick-role if mode is ambiguous (e.g. /settings, /privacy).
  const newLetterHref = loc.pathname.startsWith("/hr")
    ? "/hr/new"
    : loc.pathname.startsWith("/me")
      ? "/me/new"
      : "/pick-role";

  return (
    <header className="md:hidden flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/85 backdrop-blur-sm px-3 sticky top-0 z-30">
      <Link
        to="/"
        aria-label="DRAFTHR home"
        className="flex items-center gap-2 min-w-0"
      >
        <BrandMark size={34} />
        <Wordmark size={16} className="truncate" />
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <Link
          to={newLetterHref}
          aria-label="New letter"
          className="grid place-items-center size-11 rounded-md hover:bg-sidebar-accent text-foreground"
        >
          <Plus className="size-5" />
        </Link>
        <NotificationsBell />
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpenMobile(true)}
          className="grid place-items-center size-11 -mr-2 rounded-md hover:bg-sidebar-accent text-foreground"
        >
          <Menu className="size-5" />
        </button>
      </div>
    </header>
  );
}
