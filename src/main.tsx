import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { Toaster } from "sonner";
import { App } from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initSentry } from "@/lib/observability/sentry";
import { bootstrapTheme } from "@/lib/theme";
import { getFlag, setFlag } from "@/lib/flags";
import { reloadForStaleChunk } from "@/lib/chunk-reload";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "./styles/globals.css";
// Radix Themes CSS must come AFTER ./styles/globals.css so Tailwind's preflight
// doesn't strip Radix component backgrounds. (See RADIX-THEMES-MIGRATION.md.)
import "@radix-ui/themes/styles.css";
// Stone palette, Geist and radii for Radix Themes. Must follow its styles.
import "./styles/radix-overrides.css";

bootstrapTheme();
initSentry();

// A lazily loaded chunk (route, letter template, export library) failed to
// load, almost always because a deploy replaced it while this tab was open.
// Reload once to pick up the new build; if that was already tried, the error
// carries on to the caller or the ErrorBoundary.
window.addEventListener("vite:preloadError", () => {
  reloadForStaleChunk();
});

// Dev helper — flip feature flags from devtools without a code change.
// e.g. window.__drafthr.setFlag("pixelPerfectEdit", true)
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __drafthr?: unknown }).__drafthr = { getFlag, setFlag };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <Theme
          accentColor="gray"
          grayColor="slate"
          radius="medium"
          scaling="100%"
          appearance="inherit"
        >
          <App />
          {/* Global toast surface — top-right, theme-aware, swipe-dismiss.
           * Used for accept/reject pending, regen done, comment resolved,
           * export complete, etc. Single mount keeps the stack consistent. */}
          <Toaster
            position="top-right"
            theme="system"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] shadow-lg",
              },
            }}
          />
        </Theme>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
