import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, ScrollText } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { EditorTopbar } from "@/components/EditorTopbar";
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
          <div className="min-h-screen flex flex-col">
            <EditorTopbar />
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
  return (
    <header className="md:hidden flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/85 backdrop-blur-sm px-3 sticky top-0 z-30">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpenMobile(true)}
        className="grid place-items-center size-11 -ml-2 rounded-md hover:bg-sidebar-accent text-foreground"
      >
        <Menu className="size-5" />
      </button>
      <Link
        to="/"
        aria-label="DRAFTHR home"
        className="flex items-center gap-2 min-w-0"
      >
        <span className="bg-primary text-primary-foreground grid place-items-center size-7 rounded-md shrink-0">
          <ScrollText className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight truncate">
          DRAFTHR
        </span>
      </Link>
      <div className="ml-auto flex items-center">
        <NotificationsBell />
      </div>
    </header>
  );
}
