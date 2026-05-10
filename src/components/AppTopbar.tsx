import { UserChip } from "@/lib/auth/UserChip";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Topbar above the main content — minimal. Notifications now live in the
 * sidebar header (sidebar-02 pattern); breadcrumbs removed by request.
 */
export function AppTopbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-sidebar-border bg-background/85 backdrop-blur-sm px-3 sm:px-4 sticky top-0 z-30">
      <ThemeToggle />
      <UserChip />
    </header>
  );
}
