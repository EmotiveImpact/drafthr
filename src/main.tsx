import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { Toaster } from "sonner";
import { App } from "./App";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initSentry } from "@/lib/observability/sentry";
import { bootstrapTheme } from "@/lib/theme";
import { getFlag, setFlag } from "@/lib/flags";
import "./styles/globals.css";
// Radix Themes CSS must come AFTER ./styles/globals.css so Tailwind's preflight
// doesn't strip Radix component backgrounds. (See RADIX-THEMES-MIGRATION.md.)
import "@radix-ui/themes/styles.css";

bootstrapTheme();
initSentry();

// Dev helper — flip feature flags from devtools without a code change.
// e.g. window.__drafthr.setFlag("pixelPerfectEdit", true)
if (typeof window !== "undefined") {
  (window as unknown as { __drafthr?: unknown }).__drafthr = { getFlag, setFlag };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </StrictMode>
);
