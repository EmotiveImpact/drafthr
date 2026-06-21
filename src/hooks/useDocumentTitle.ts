import { useEffect } from "react";

/**
 * Per-route document title. The app shipped with a single static
 * "<title>DRAFTHR</title>" for every page, so tabs / bookmarks / history were
 * indistinguishable. This sets a "<Section> · DraftHR" title from the path so
 * the browser chrome reflects where the user is. Driven from Layout (one call)
 * rather than sprinkled across ~30 routes.
 */
const BASE = "DraftHR";

const PREFIX_TITLES: Array<[string, string]> = [
  ["/editor/", "Editor"],
  ["/matters", "Matters"],
  ["/employees", "People"],
  ["/reports", "Reports"],
  ["/calendar", "Calendar"],
  ["/activity", "Activity"],
  ["/exported", "Exported"],
  ["/bulk", "Bulk letters"],
  ["/templates", "Templates"],
  ["/browse", "Letter library"],
  ["/consultants", "Marketplace"],
  ["/bookings", "Bookings"],
  ["/c/review", "Review"],
  ["/c/profile", "Consultant profile"],
  ["/c", "Consultant"],
  ["/settings", "Settings"],
  ["/notifications", "Notifications"],
  ["/sign-in", "Sign in"],
  ["/signup", "Create account"],
  ["/join", "Join workspace"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/legal", "Legal"],
  ["/m/", "Letter"],
];

const EXACT_TITLES: Record<string, string> = {
  "/hr": "Home",
  "/me": "Home",
  "/pick-role": "Choose your role",
};

function sectionFor(pathname: string): string | null {
  if (EXACT_TITLES[pathname]) return EXACT_TITLES[pathname];
  for (const [prefix, title] of PREFIX_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return title;
  }
  return null;
}

export function useDocumentTitle(pathname: string): void {
  useEffect(() => {
    const section = sectionFor(pathname);
    document.title = section ? `${section} · ${BASE}` : BASE;
  }, [pathname]);
}
