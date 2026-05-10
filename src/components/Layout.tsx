import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppTopbar } from "@/components/AppTopbar";
import { EditorTopbar } from "@/components/EditorTopbar";

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const isEditor = loc.pathname.startsWith("/editor/");

  // Editor route: no global sidebar at all — full focus mode. The editor's own
  // 3-column layout (sections / Tiptap / compliance rail) is the only chrome.
  if (isEditor) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="min-h-screen flex flex-col">
          <EditorTopbar />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="min-h-screen flex flex-col">
          <AppTopbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-sidebar-border py-6 text-center text-xs text-muted-foreground">
            Generated content is not legal advice. Review with qualified HR or
            employment-law counsel before issuance.
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
