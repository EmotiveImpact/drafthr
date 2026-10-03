/** One quiet, stable first-load surface while auth and workspace data resolve. */
export function AppLoadingScreen({ scope = "viewport", label }: { scope?: "viewport" | "page"; label?: string }) {
  return (
    <div className="app-loading-screen" data-scope={scope} role="status" aria-live="polite" aria-label={label ?? "Loading workspace"}>
      <p className="text-sm text-muted-foreground">{label ?? (scope === "viewport" ? "Loading your workspace…" : "Loading page…")}</p>
    </div>
  );
}
