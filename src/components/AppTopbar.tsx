import { UserChip } from "@/lib/auth/UserChip";

/**
 * A plain top bar above the main content, kept for pages that want one.
 * The app frame itself has no desktop top bar: the sidebar holds search and
 * notifications, and phones use the compact bar in Layout.
 */
export function AppTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center justify-end gap-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] px-4">
      <UserChip />
    </header>
  );
}
