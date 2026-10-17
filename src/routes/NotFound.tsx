import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/ds";

/**
 * 404: unknown route. The app's wildcard previously bounced every mistyped
 * or stale URL to "/" with no explanation; this gives an honest "not found"
 * with a clear way back. "Go to DraftHR" routes to "/", where RootRedirect
 * picks the right destination (sign-in / workspace setup / home) based on the
 * user's auth + onboarding state.
 */
export function NotFound() {
  const nav = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center px-4 py-20">
      <div className="w-full max-w-[480px] text-center">
        <Link
          to="/"
          aria-label="DraftHR home"
          className="mb-10 inline-flex items-center gap-2.5"
        >
          <Wordmark size={26} />
        </Link>
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">Error 404</p>
        <h1 className="ds-title m-0 mt-2 text-[clamp(32px,4.4vw,42px)] leading-[1.1]">
          We couldn't find that page
        </h1>
        <p className="m-0 mt-3 text-[15px] leading-relaxed text-[var(--ds-muted)]">
          The link may be broken, or the page may have moved. Let's get you back
          to your workspace.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-[var(--ds-r-m)] bg-[var(--ds-accent)] px-4 text-[14px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
          >
            Go to DraftHR
          </Link>
        </div>
        <button
          type="button"
          onClick={() => nav(-1)}
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Go back
        </button>
      </div>
    </div>
  );
}
