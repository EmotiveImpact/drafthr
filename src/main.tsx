import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { CircleCheck } from "lucide-react";
import { App } from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initSentry } from "@/lib/observability/sentry";
import { bootstrapTheme } from "@/lib/theme";
import { getFlag, setFlag } from "@/lib/flags";
import { reloadForStaleChunk } from "@/lib/chunk-reload";
import "./styles/globals.css";

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
        <App />
        {/* Global toast surface (kit.html "Toast"): bottom right, the dark
         * ink toast with a green tick for success, swipe to dismiss. Used
         * for accept/reject pending, regen done, comment resolved, export
         * complete, etc. Single mount keeps the stack consistent. */}
        <Toaster
          position="bottom-right"
          theme="light"
          icons={{ success: <CircleCheck className="size-[18px] text-[var(--ds-green-line)]" strokeWidth={1.8} /> }}
          toastOptions={{
            classNames: {
              toast:
                "rounded-[var(--ds-r-l)]! border-0! bg-[var(--ds-ink)]! font-sans! text-[var(--ds-on-accent)]! text-[14px] shadow-[var(--ds-shadow-l)]",
              title: "font-medium",
              description: "text-[13px] text-[color-mix(in_srgb,var(--ds-on-accent)_70%,transparent)]!",
              actionButton:
                "bg-transparent! px-1! text-[13.5px]! font-medium! text-[var(--ds-on-accent)]! underline! underline-offset-[3px]!",
              cancelButton: "bg-transparent! text-[color-mix(in_srgb,var(--ds-on-accent)_70%,transparent)]!",
            },
          }}
        />
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
