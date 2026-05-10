import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { App } from "./App";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initSentry } from "@/lib/observability/sentry";
import { bootstrapTheme } from "@/lib/theme";
import "./styles/globals.css";
// Radix Themes CSS must come AFTER ./styles/globals.css so Tailwind's preflight
// doesn't strip Radix component backgrounds. (See RADIX-THEMES-MIGRATION.md.)
import "@radix-ui/themes/styles.css";

bootstrapTheme();
initSentry();

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
        </Theme>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
