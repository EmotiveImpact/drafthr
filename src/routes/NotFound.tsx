import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/ds";

/**
 * 404 — unknown route. The app's wildcard previously bounced every mistyped
 * or stale URL to "/" with no explanation; this gives an honest "not found"
 * with a clear way back. "Go to DraftHR" routes to "/", where RootRedirect
 * picks the right destination (sign-in / workspace setup / home) based on the
 * user's auth + onboarding state.
 */
export function NotFound() {
  const nav = useNavigate();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20 min-h-[60vh]">
      <div className="w-full max-w-[440px] text-center">
        <Link
          to="/"
          aria-label="DraftHR home"
          className="inline-flex items-center gap-2.5 mb-8"
        >
          <BrandMark size={40} />
          <Wordmark size={24} />
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          404
        </p>
        <h1 className="mt-2 text-[clamp(22px,3vw,28px)] font-semibold tracking-[-0.01em] text-[var(--ds-ink)] leading-[1.15]">
          We couldn't find that page.
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          The link may be broken, or the page may have moved. Let's get you back
          to your workspace.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-1.5 h-[40px] px-4 rounded-[9px] border border-[var(--ds-line)] bg-white text-[var(--ds-ink)] font-semibold text-[13px] hover:bg-[var(--ds-surface-2)] transition"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Go back
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center h-[40px] px-4 rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[13px] hover:-translate-y-px hover:shadow-md transition"
          >
            Go to DraftHR
          </Link>
        </div>
      </div>
    </div>
  );
}
