import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/observability/sentry";
import { isChunkLoadError, reloadForStaleChunk } from "@/lib/chunk-reload";

/**
 * App-level error boundary.
 *
 * Without this, any render-time throw anywhere in the tree unmounts the
 * whole app to a blank white screen with no recovery path. This catches
 * the throw, reports it to Sentry, and renders a contained fallback card
 * with a reload button — so a single buggy component degrades to a
 * recoverable error state instead of taking down the entire surface.
 *
 * Styled with the DraftHR DS tokens so the fallback itself stays on-brand.
 */
type Props = { children: ReactNode };
type State = { error: Error | null; reloading: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // A lazily loaded chunk that is gone after a deploy: reload to the new
    // build rather than showing an error (see componentDidCatch).
    return { error, reloading: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      if (reloadForStaleChunk()) return;
      // Already reloaded moments ago: show the error card instead of looping.
      if (this.state.reloading) this.setState({ reloading: false });
    }
    // Report to Sentry (no-op if Sentry isn't configured) with the
    // component stack so we can locate the throwing component.
    try {
      captureError(error, { componentStack: info.componentStack ?? undefined });
    } catch {
      /* never let the reporter itself crash the boundary */
    }
    // Also log to the console so it's visible in dev + production devtools.
    console.error("[ErrorBoundary] caught render error", error, info.componentStack);
  }

  private handleReload = () => {
    // Full reload clears any corrupt in-memory state. If a persisted
    // store is the culprit, the migrate functions run fresh on reload.
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ error: null, reloading: false });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.reloading) {
      return (
        <div className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
          <p role="status" className="text-[13.5px] text-[var(--ds-body)]">
            Loading the latest version of DraftHR
          </p>
        </div>
      );
    }

    return (
      <div className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
        <div className="w-full max-w-md rounded-[var(--ds-r-xl)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-7 text-center shadow-[var(--ds-shadow-l)]">
          <p className="text-[13px] text-[var(--ds-muted)]">
            Something went wrong
          </p>
          <h1 className="ds-title mt-2 text-[28px] leading-[1.15]">
            This page hit an error.
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
            The rest of DraftHR is fine. Reloading usually clears it. If it
            keeps happening, let us know at{" "}
            <a
              href="mailto:support@drafthr.io"
              className="font-medium text-[var(--ds-ink)] underline"
            >
              support@drafthr.io
            </a>
            .
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-[38px] items-center rounded-[9px] bg-[var(--ds-accent)] px-3.5 text-[14.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex h-[38px] items-center rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 text-[14.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:border-[var(--ds-line-hover)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
            >
              Try again
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-48 overflow-auto rounded-[8px] bg-[var(--ds-surface-2)] p-3 text-left text-[11px] leading-relaxed text-[var(--ds-red-fg)]">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
