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

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const isEditor = loc.pathname.startsWith("/editor/");
  const { open, setOpen } = useSearchPalette();

  if (isEditor) {
    return (
      <TooltipProvider delayDuration={150}>
        <SearchPaletteContext.Provider value={{ open, setOpen }}>
          {/* The editor is locked to viewport height. h-dvh handles mobile
           * URL-bar resize correctly; h-screen as fallback. Inner flex/grid
           * children scroll independently so the chat composer + sections
           * list stay sticky on screen at any letter length. */}
          <div className="h-screen h-dvh flex flex-col overflow-hidden">
            <main className="flex-1 flex flex-col min-h-0">{children}</main>
          </div>
          <SearchPalette open={open} onOpenChange={setOpen} />
        </SearchPaletteContext.Provider>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <SearchPaletteContext.Provider value={{ open, setOpen }}>
        <SidebarProvider defaultOpen>
          <AppSidebar />
          <SidebarInset className="min-h-screen flex flex-col">
            <MobileTopbar />
            <main className="flex-1">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <SearchPalette open={open} onOpenChange={setOpen} />
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
