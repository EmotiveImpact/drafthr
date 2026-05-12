import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is >= the Tailwind `lg:` breakpoint
 * (1024px), false otherwise. Re-evaluates on viewport resize.
 *
 * Used by the editor to render exactly ONE AI surface at a time —
 * either the desktop inline rail or the mobile bottom sheet — so the
 * useChat state lives in a single mounted AIPanel and survives a
 * resize via the store's draft.aiChat persistence.
 *
 * SSR-safe: defaults to `true` (desktop) during the brief moment
 * before window is available so the desktop chrome renders first
 * (less jarring than starting in mobile mode then snapping to
 * desktop). Vite-only project today, but this guards against any
 * future Astro/Next migration.
 */
export function useIsLargeViewport(): boolean {
  const query = "(min-width: 1024px)";

  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    // Sync state once on mount in case the SSR default didn't match.
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return matches;
}
