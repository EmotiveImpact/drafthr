import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { initSentry } from "@/lib/observability/sentry";
import { bootstrapTheme } from "@/lib/theme";
import "./styles/globals.css";

bootstrapTheme();
initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
